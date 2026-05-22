// Texas Hold'em game flow: orchestrates rounds via Supabase.
// NOTE for stage 2: RLS is permissive — anyone can read all cards.
// We accept this for now; stage 3 will tighten security.

import { createDeck, shuffle, bestHandFor, compareEval, HAND_CATEGORIES } from './pokerLogic.js'
import { supabase } from './supabase.js'
import { computeSidePots } from './sidePots.js'
import { nextActiveSeat as _nextActiveSeat, prevActiveSeat as _prevActiveSeat } from './turnOrder.js'

async function loadState(roundId) {
  const [{ data: round }, { data: hands }] = await Promise.all([
    supabase.from('game_rounds').select('*').eq('id', roundId).single(),
    supabase.from('player_hands').select('*').eq('round_id', roundId).order('seat_index'),
  ])
  return { round, hands: hands || [] }
}

const nextActiveSeat = _nextActiveSeat
const prevActiveSeat = _prevActiveSeat

export async function startNewRound({ roomId, players, settings = {}, roundNumber = 1, dealerIndex = 0 }) {
  const smallBlind = settings.smallBlind ?? 10
  const bigBlind = settings.bigBlind ?? 20

  const seated = players.filter((p) => (p.chips ?? 0) > 0 && !p.left_game)
  if (seated.length < 2) throw new Error('צריך לפחות 2 שחקנים עם צ׳יפים')

  const deck = shuffle(createDeck())

  const sbIdx = seated.length === 2 ? dealerIndex : (dealerIndex + 1) % seated.length
  const bbIdx = seated.length === 2 ? (dealerIndex + 1) % 2 : (dealerIndex + 2) % seated.length

  // Compute everything before INSERT so we write correct values immediately
  const holeCardsBySeat = seated.map(() => [deck.shift(), deck.shift()])
  const hands = seated.map((p, i) => ({
    player_id: p.id,
    seat_index: i,
    status: 'active',
    current_bet: 0,
    total_bet_in_round: 0,
    chips_at_start: p.chips,
  }))

  const sbHand = hands[sbIdx]
  const bbHand = hands[bbIdx]
  const sbAmt = Math.min(smallBlind, sbHand.chips_at_start)
  const bbAmt = Math.min(bigBlind, bbHand.chips_at_start)
  sbHand.current_bet = sbAmt
  sbHand.total_bet_in_round = sbAmt
  if (sbAmt === sbHand.chips_at_start) sbHand.status = 'all_in'
  bbHand.current_bet = bbAmt
  bbHand.total_bet_in_round = bbAmt
  if (bbAmt === bbHand.chips_at_start) bbHand.status = 'all_in'

  const firstToAct =
    seated.length === 2
      ? sbIdx
      : nextActiveSeat(hands, bbIdx) ?? bbIdx

  // Single INSERT with all correct values — no separate UPDATE needed
  const { data: round, error: roundErr } = await supabase
    .from('game_rounds')
    .insert({
      room_id: roomId,
      round_number: roundNumber,
      phase: 'preflop',
      pot: sbAmt + bbAmt,
      current_bet: bbAmt,
      community_cards: [],
      deck,
      dealer_index: dealerIndex,
      current_turn_index: firstToAct,
      last_raise_index: bbIdx,
      small_blind: smallBlind,
      big_blind: bigBlind,
      turn_started_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (roundErr) throw roundErr

  const handsWithRound = hands.map((h) => ({ ...h, round_id: round.id }))
  const { data: insertedHands, error: handsErr } = await supabase
    .from('player_hands')
    .insert(handsWithRound)
    .select()
  if (handsErr) throw handsErr

  const sortedInserted = [...insertedHands].sort((a, b) => a.seat_index - b.seat_index)
  const holeRows = sortedInserted.map((h, i) => ({
    player_hand_id: h.id,
    cards: holeCardsBySeat[i],
  }))
  const { error: holeErr } = await supabase.from('player_hole_cards').insert(holeRows)
  if (holeErr) throw holeErr

  await supabase.from('game_actions').insert([
    { round_id: round.id, player_id: seated[sbIdx].id, phase: 'preflop', action: 'small_blind', amount: sbAmt },
    { round_id: round.id, player_id: seated[bbIdx].id, phase: 'preflop', action: 'big_blind', amount: bbAmt },
  ])

  // Atomic blind deductions — same reason as in takeAction.
  await Promise.all([
    supabase.rpc('adjust_player_chips', { p_player_id: seated[sbIdx].id, p_delta: -sbAmt }),
    supabase.rpc('adjust_player_chips', { p_player_id: seated[bbIdx].id, p_delta: -bbAmt }),
  ])

  return round.id
}

export async function takeAction({ roundId, playerId, action, raiseTo = 0 }) {
  const { round, hands } = await loadState(roundId)
  if (!round) throw new Error('סיבוב לא נמצא')
  if (round.phase === 'showdown' || round.phase === 'finished') throw new Error('הסיבוב נגמר')

  const myHand = hands.find((h) => h.player_id === playerId)
  if (!myHand) throw new Error('היד לא נמצאה')
  if (round.current_turn_index !== myHand.seat_index) throw new Error('לא תורך')
  if (myHand.status !== 'active') throw new Error('כבר לא פעיל')

  const chipsLeft = myHand.chips_at_start - myHand.total_bet_in_round
  const callAmount = round.current_bet - myHand.current_bet

  let newBet = myHand.current_bet
  let amountAdded = 0
  let newStatus = myHand.status
  let newCurrentBet = round.current_bet
  let newLastRaise = round.last_raise_index
  let raised = false

  if (action === 'fold') {
    newStatus = 'folded'
  } else if (action === 'check') {
    if (callAmount > 0) throw new Error('אי אפשר Check, יש הימור על השולחן')
  } else if (action === 'call') {
    amountAdded = Math.min(callAmount, chipsLeft)
    newBet = myHand.current_bet + amountAdded
    if (amountAdded === chipsLeft && chipsLeft > 0) newStatus = 'all_in'
  } else if (action === 'raise') {
    if (raiseTo <= round.current_bet) throw new Error('Raise חייב להיות גבוה מההימור הנוכחי')
    const needed = raiseTo - myHand.current_bet
    if (needed > chipsLeft) throw new Error('אין מספיק צ׳יפים')
    amountAdded = needed
    newBet = raiseTo
    newCurrentBet = raiseTo
    newLastRaise = myHand.seat_index
    raised = true
    if (amountAdded === chipsLeft) newStatus = 'all_in'
  } else if (action === 'all_in') {
    if (chipsLeft <= 0) throw new Error('אין צ׳יפים')
    amountAdded = chipsLeft
    newBet = myHand.current_bet + amountAdded
    newStatus = 'all_in'
    if (newBet > round.current_bet) {
      newCurrentBet = newBet
      newLastRaise = myHand.seat_index
      raised = true
    }
  } else {
    throw new Error('פעולה לא חוקית')
  }

  await supabase
    .from('player_hands')
    .update({
      current_bet: newBet,
      total_bet_in_round: myHand.total_bet_in_round + amountAdded,
      status: newStatus,
    })
    .eq('id', myHand.id)

  if (amountAdded > 0) {
    // Atomic decrement to avoid SELECT-then-UPDATE races with concurrent
    // chip changes (e.g., a pot distribution arriving at the same time).
    await supabase.rpc('adjust_player_chips', {
      p_player_id: myHand.player_id,
      p_delta: -amountAdded,
    })
  }

  await supabase.from('game_actions').insert({
    round_id: round.id,
    player_id: myHand.player_id,
    phase: round.phase,
    action,
    amount: amountAdded,
  })

  const updatedMyHand = {
    ...myHand,
    current_bet: newBet,
    total_bet_in_round: myHand.total_bet_in_round + amountAdded,
    status: newStatus,
  }
  const updatedHands = hands.map((h) => (h.id === myHand.id ? updatedMyHand : h))
  const newPot = round.pot + amountAdded

  const notFolded = updatedHands.filter((h) => h.status !== 'folded')
  if (notFolded.length === 1) {
    return finishOneWinner(round, updatedHands, notFolded[0], newPot)
  }

  const activeHands = updatedHands.filter((h) => h.status === 'active')
  if (activeHands.length === 0) {
    return runOutAndShowdown(round, updatedHands, newPot, newCurrentBet)
  }
  // Only one active player remains AND they've already matched the current
  // bet — no one left to act against and the active player is square with the
  // pot, so deal out the remaining community cards straight to showdown.
  // (We MUST also check current_bet >= newCurrentBet, otherwise this would
  // trigger when the SOLE active player still owes a call after an all-in,
  // which is the case "the other player just went all-in and it's now my
  // turn to call or fold".)
  if (
    activeHands.length === 1
    && notFolded.length > 1
    && activeHands[0].current_bet >= newCurrentBet
  ) {
    return runOutAndShowdown(round, updatedHands, newPot, newCurrentBet)
  }

  const nextSeat = nextActiveSeat(updatedHands, myHand.seat_index)
  const allMatched = activeHands.every((h) => h.current_bet === newCurrentBet)

  // The "closer" is the seat last_raise_index points to. If that player is no
  // longer active (went all-in earlier), the action loop can never literally
  // "return to" them — they're skipped by nextActiveSeat. In that case we use
  // the previous active seat as the effective closer (the active player who
  // sits right before the all-in raiser in seat order). That makes
  // actionReturnedToCloser meaningful again.
  const rawCloserHand = updatedHands.find((h) => h.seat_index === newLastRaise)
  let effectiveCloserSeat = newLastRaise
  if (rawCloserHand && rawCloserHand.status !== 'active') {
    effectiveCloserSeat = prevActiveSeat(updatedHands, newLastRaise) ?? newLastRaise
  }
  const closerHand = updatedHands.find((h) => h.seat_index === effectiveCloserSeat)

  // Has the (effective) closer acted voluntarily in this phase?
  // Blinds count as forced action — BB still has option preflop.
  let closerActed = false
  if (closerHand) {
    if (closerHand.player_id === myHand.player_id) {
      closerActed = true // I am the closer and just acted
    } else {
      const { data: priorActions } = await supabase
        .from('game_actions')
        .select('action')
        .eq('round_id', round.id)
        .eq('phase', round.phase)
        .eq('player_id', closerHand.player_id)
      closerActed = (priorActions || []).some((a) => !['small_blind', 'big_blind'].includes(a.action))
    }
  }

  const actionReturnedToCloser = nextSeat === effectiveCloserSeat || myHand.seat_index === effectiveCloserSeat
  const bettingDone = !raised && allMatched && closerActed && actionReturnedToCloser

  if (bettingDone) {
    return advancePhase(round, updatedHands, newPot)
  }

  await supabase
    .from('game_rounds')
    .update({
      pot: newPot,
      current_bet: newCurrentBet,
      current_turn_index: nextSeat,
      last_raise_index: newLastRaise,
      turn_started_at: new Date().toISOString(),
    })
    .eq('id', round.id)
}

async function advancePhase(round, hands, pot) {
  const deck = round.deck.slice()
  const community = round.community_cards.slice()

  let nextPhase = round.phase
  if (round.phase === 'preflop') {
    deck.shift() // burn
    community.push(deck.shift(), deck.shift(), deck.shift())
    nextPhase = 'flop'
  } else if (round.phase === 'flop') {
    deck.shift()
    community.push(deck.shift())
    nextPhase = 'turn'
  } else if (round.phase === 'turn') {
    deck.shift()
    community.push(deck.shift())
    nextPhase = 'river'
  } else if (round.phase === 'river') {
    return doShowdown(round, hands, pot)
  }

  await supabase.from('player_hands').update({ current_bet: 0 }).eq('round_id', round.id)

  const updatedHands = hands.map((h) => ({ ...h, current_bet: 0 }))
  const firstSeatAfterDealer = nextActiveSeat(updatedHands, round.dealer_index)
  const closerSeat = prevActiveSeat(updatedHands, firstSeatAfterDealer) ?? firstSeatAfterDealer

  await supabase
    .from('game_rounds')
    .update({
      phase: nextPhase,
      pot,
      current_bet: 0,
      community_cards: community,
      deck,
      current_turn_index: firstSeatAfterDealer,
      last_raise_index: closerSeat,
      turn_started_at: new Date().toISOString(),
    })
    .eq('id', round.id)

  const stillActive = updatedHands.filter((h) => h.status === 'active')
  if (stillActive.length <= 1) {
    return runOutAndShowdown({ ...round, phase: nextPhase, community_cards: community, deck, pot }, updatedHands, pot, 0)
  }
}

async function runOutAndShowdown(round, hands, pot, currentBet) {
  let deck = round.deck.slice()
  let community = round.community_cards.slice()
  let phase = round.phase
  while (phase !== 'river') {
    if (phase === 'preflop') {
      deck.shift()
      community.push(deck.shift(), deck.shift(), deck.shift())
      phase = 'flop'
    } else if (phase === 'flop') {
      deck.shift()
      community.push(deck.shift())
      phase = 'turn'
    } else if (phase === 'turn') {
      deck.shift()
      community.push(deck.shift())
      phase = 'river'
    }
  }
  await supabase
    .from('game_rounds')
    .update({ community_cards: community, deck, phase: 'river', current_bet: currentBet, pot })
    .eq('id', round.id)
  return doShowdown({ ...round, community_cards: community, phase: 'river' }, hands, pot)
}

async function doShowdown(round, hands, pot) {
  // Move to showdown first so hole_cards become readable for evaluation
  await supabase.from('game_rounds').update({ phase: 'showdown' }).eq('id', round.id)

  const contenders = hands.filter((h) => h.status !== 'folded')
  // We need hole cards for all NON-FOLDED hands (folded never need evaluation).
  const { data: holeRows } = await supabase
    .from('player_hole_cards')
    .select('player_hand_id, cards')
    .in('player_hand_id', contenders.map((h) => h.id))
  const cardsById = new Map((holeRows || []).map((r) => [r.player_hand_id, r.cards]))

  const evaluationByHandId = new Map()
  for (const h of contenders) {
    evaluationByHandId.set(h.id, bestHandFor(cardsById.get(h.id) || [], round.community_cards))
  }

  // Build side pots from EVERY hand's total contribution (including folded
  // ones — their chips stay in the pot but they're excluded from winning).
  const sidePots = computeSidePots(hands, evaluationByHandId)

  // Award chips per pot. Within a pot, ties split evenly with remainder to first.
  // Collect all unique winners' names for the headline + a structured breakdown
  // for the UI.
  const allWinnerNames = new Set()
  const breakdown = []
  for (let i = 0; i < sidePots.length; i++) {
    const p = sidePots[i]
    if (!p.winners.length) continue
    const share = Math.floor(p.amount / p.winners.length)
    const remainder = p.amount - share * p.winners.length
    const winnerPlayerIds = p.winners.map((w) => w.player_id)
    const { data: winnerPlayers } = await supabase
      .from('players').select('id, name').in('id', winnerPlayerIds)
    const namesById = new Map((winnerPlayers || []).map((wp) => [wp.id, wp.name]))
    for (let j = 0; j < p.winners.length; j++) {
      const w = p.winners[j]
      const extra = j === 0 ? remainder : 0
      await supabase.rpc('adjust_player_chips', { p_player_id: w.player_id, p_delta: share + extra })
      const name = namesById.get(w.player_id)
      if (name) allWinnerNames.add(name)
    }
    breakdown.push({
      label: i === 0 ? 'main' : `side${i}`,
      amount: p.amount,
      winners: p.winners.map((w) => namesById.get(w.player_id) || '?'),
      hand_category: p.winningEval ? HAND_CATEGORIES[p.winningEval.category] : null,
    })
  }

  // Headline win_reason — based on the MAIN pot's winning hand.
  const mainWinner = sidePots[0]
  const headlineCategory = mainWinner?.winningEval
    ? HAND_CATEGORIES[mainWinner.winningEval.category]
    : null
  const isSplitMain = mainWinner ? mainWinner.winners.length > 1 : false

  await supabase.from('game_rounds').update({
    phase: 'showdown',
    pot,
    ended_at: new Date().toISOString(),
    winner_name: [...allWinnerNames].join(', ') || null,
    win_reason: isSplitMain ? 'split' : headlineCategory,
    pot_breakdown: breakdown,
  }).eq('id', round.id)
}

async function finishOneWinner(round, hands, winnerHand, pot) {
  // Atomic add — see adjust_player_chips comment in takeAction.
  await supabase.rpc('adjust_player_chips', { p_player_id: winnerHand.player_id, p_delta: pot })
  const { data: p } = await supabase
    .from('players').select('name').eq('id', winnerHand.player_id).single()
  await supabase.from('game_rounds').update({
    phase: 'finished',
    pot,
    ended_at: new Date().toISOString(),
    winner_name: p?.name ?? null,
    win_reason: 'fold',
  }).eq('id', round.id)
}
