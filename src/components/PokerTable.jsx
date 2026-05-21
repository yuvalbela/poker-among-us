import { useEffect, useRef, useState } from 'react'
import Card from './Card.jsx'
import MaskIcon from './MaskIcon.jsx'
import PlayerSeat from './PlayerSeat.jsx'

// Seat positions as [xPercent, yPercent] relative to the table container
// Index 0 = "me" (always bottom-center), rest = opponents clockwise from top
// Positions are seat CENTERS as [x%, y%]. The PlayerSeat is ~150px tall
// (cards 88 + seat box 26 + bet chip 20 + chat bubble 30). Each seat is
// centered with translate(-50%, -50%), so the box extends ~75px above/below
// its center. We keep extreme seats away from 0/100% edges to avoid clipping.
const PORTRAIT_POSITIONS = {
  2: [[50, 85], [50, 17]],
  3: [[50, 85], [10, 17], [90, 17]],
  4: [[50, 85], [7, 50],  [50, 17], [93, 50]],
  5: [[50, 85], [7, 65],  [10, 19], [90, 19], [93, 65]],
  6: [[50, 85], [7, 70],  [7, 24],  [50, 17], [93, 24], [93, 70]],
}

const LANDSCAPE_POSITIONS = {
  2: [[50, 88], [50, 12]],
  3: [[50, 88], [10, 14], [90, 14]],
  4: [[50, 88], [5, 48],  [50, 12], [95, 48]],
  5: [[50, 88], [5, 64],  [10, 14], [90, 14], [95, 64]],
  6: [[50, 88], [5, 68],  [5, 24],  [50, 12], [95, 24], [95, 68]],
}

// Compute the same ordered-players list + position array used by render — call this
// from animation effects to keep "seat X is at coordinate Y" consistent.
function computeSeatLayout(players, hands, meId, isLandscape) {
  const sorted = [...players]
    .filter((p) => {
      if (!hands?.length) return true
      return hands.some((h) => h.player_id === p.id)
    })
    .sort((a, b) => (a.seat_number ?? 99) - (b.seat_number ?? 99))
  const myIdx = sorted.findIndex((p) => p.id === meId)
  const ordered = myIdx >= 0
    ? [...sorted.slice(myIdx), ...sorted.slice(0, myIdx)]
    : sorted
  const count = Math.min(ordered.length, 6)
  const positions = isLandscape
    ? (LANDSCAPE_POSITIONS[count] || LANDSCAPE_POSITIONS[2])
    : (PORTRAIT_POSITIONS[count] || PORTRAIT_POSITIONS[2])
  // Map: playerId -> [xPct, yPct]
  const seatPos = {}
  ordered.slice(0, count).forEach((p, i) => { seatPos[p.id] = positions[i] || [50, 50] })
  return { ordered, count, positions, seatPos }
}

// Generic flying chip — animates from (fromX,fromY)% to (toX,toY)%.
// Used both for pot→winners (showdown) and player→pot (bet).
function FlyingChip({ fromX, fromY, toX, toY, amount, delay = 0, durationMs = 650 }) {
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMoved(true), 30 + delay)
    return () => clearTimeout(t)
  }, [])
  return (
    <div
      style={{
        position: 'absolute',
        left: moved ? `${toX}%` : `${fromX}%`,
        top: moved ? `${toY}%` : `${fromY}%`,
        transform: 'translate(-50%, -50%)',
        transition: moved
          ? `left ${durationMs}ms cubic-bezier(0.4,0,0.2,1), top ${durationMs}ms cubic-bezier(0.4,0,0.2,1), opacity 0.25s ${durationMs - 50}ms`
          : 'none',
        opacity: moved ? 0 : 1,
        zIndex: 30,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(15,10,0,0.92)',
        border: '2px solid #e8c44a',
        borderRadius: '999px',
        padding: '4px 12px',
        boxShadow: '0 0 16px rgba(232,196,74,0.7), 0 2px 8px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        display: 'inline-block',
        width: '12px', height: '12px',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #fde68a 0%, #f0c040 45%, #b45309 100%)',
        border: '1px solid #78350f',
        boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.4)',
        flexShrink: 0,
      }} />
      <span style={{ color: '#e8c44a', fontWeight: 800, fontSize: '14px' }}>{amount}</span>
    </div>
  )
}

function PotChip({ targetX, targetY, amount, delay = 0 }) {
  const [moved, setMoved] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMoved(true), 30 + delay)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: moved ? `${targetX}%` : '50%',
        top: moved ? `${targetY}%` : '50%',
        transform: 'translate(-50%, -50%)',
        transition: moved
          ? `left 0.65s cubic-bezier(0.4,0,0.2,1), top 0.65s cubic-bezier(0.4,0,0.2,1), opacity 0.25s 0.6s`
          : 'none',
        opacity: moved ? 0 : 1,
        zIndex: 30,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(15,10,0,0.92)',
        border: '2px solid #e8c44a',
        borderRadius: '999px',
        padding: '4px 12px',
        boxShadow: '0 0 16px rgba(232,196,74,0.7), 0 2px 8px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        display: 'inline-block',
        width: '12px', height: '12px',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 30%, #fde68a 0%, #f0c040 45%, #b45309 100%)',
        border: '1px solid #78350f',
        boxShadow: 'inset 0 -1px 1px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.4)',
        flexShrink: 0,
      }} />
      <span style={{ color: '#e8c44a', fontWeight: 800, fontSize: '14px' }}>{amount}</span>
    </div>
  )
}

function useOrientation() {
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight)
  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', () => setTimeout(update, 100))
    return () => window.removeEventListener('resize', update)
  }, [])
  return landscape
}

export default function PokerTable({
  players,
  hands,
  holeCards,
  revealedByTraitor, // { playerId: { cardIndex: card } }
  round,
  me,
  lastMessages, // { playerId: string }
  traitor,       // from useTraitor() — controls clickable cards/seats when I'm the traitor
}) {
  const isLandscape = useOrientation()

  // ── Pot animation hooks (must be before any early return) ──
  const firedForRoundRef = useRef(null)   // id of round for which pot anim already fired (one-shot guard)
  const [potAnim, setPotAnim] = useState(null)
  // ── Bet animation (player → pot) ──
  const prevBetsRef = useRef({})            // playerId -> last seen current_bet
  const [betAnims, setBetAnims] = useState([])    // [{id, fromX, fromY, amount}]

  const phase = round?.phase

  useEffect(() => {
    // Fire pot animation once per round, only after winner is known.
    // doShowdown does TWO updates: (1) phase='showdown' with winner_name=null
    // (so hole cards unlock for evaluation), then (2) same phase + winner_name set.
    // Listening to phase alone would fire on update #1 — before we know who won —
    // and skip #2 (phase unchanged). So we wait for winner_name and use a
    // one-shot ref keyed by round.id.
    if (phase !== 'showdown' && phase !== 'finished') return
    if (!round?.winner_name) return
    if (firedForRoundRef.current === round.id) return
    firedForRoundRef.current = round.id
    if (!round?.pot || !hands.length || !players.length) return

    // Use the SAME ordering/positions the render uses — fixes the "pot goes to wrong
    // seat after a player left" bug, since unfiltered players list was off-by-one.
    const { seatPos } = computeSeatLayout(players, hands, me?.id, isLandscape)

    // Pick actual winners (not just everyone who didn't fold).
    // round.winner_name is a comma-joined list of winner names (single name for
    // a clear win, multiple for a split). Fallback: any non-folded hand.
    const winnerNames = (round.winner_name || '')
      .split(',').map((s) => s.trim()).filter(Boolean)
    let winnerHands
    if (winnerNames.length) {
      winnerHands = hands.filter((h) => {
        const p = players.find((p) => p.id === h.player_id)
        return p && winnerNames.includes(p.name)
      })
    }
    if (!winnerHands || !winnerHands.length) {
      winnerHands = hands.filter((h) => h.status !== 'folded')
    }
    if (!winnerHands.length) return
    const share = Math.floor(round.pot / winnerHands.length)
    const targets = winnerHands.map((h) => {
      const [px, py] = seatPos[h.player_id] || [50, 50]
      return { tx: px, ty: py, amount: share }
    })
    setPotAnim(targets)
    setTimeout(() => setPotAnim(null), 1200)
  }, [phase, round?.winner_name, round?.id])

  // --- Bet → pot animation: fire a chip when a player's current_bet increases ---
  useEffect(() => {
    if (!hands?.length || !players?.length || !round?.id) return
    const { seatPos } = computeSeatLayout(players, hands, me?.id, isLandscape)
    const newAnims = []
    const nextBets = {}
    for (const h of hands) {
      const bet = h.current_bet ?? 0
      nextBets[h.player_id] = bet
      const prevBet = prevBetsRef.current[h.player_id] ?? 0
      if (bet > prevBet) {
        const delta = bet - prevBet
        const [fx, fy] = seatPos[h.player_id] || [50, 50]
        newAnims.push({
          id: `${h.player_id}-${Date.now()}-${Math.random()}`,
          fromX: fx, fromY: fy, amount: delta,
        })
      }
    }
    prevBetsRef.current = nextBets
    if (newAnims.length) {
      setBetAnims((prev) => [...prev, ...newAnims])
      // Remove these specific anims after their animation finishes
      const ids = new Set(newAnims.map((a) => a.id))
      setTimeout(() => setBetAnims((prev) => prev.filter((a) => !ids.has(a.id))), 900)
    }
  }, [hands, round?.id, isLandscape])

  // Reset prevBets when a new round starts, so the first preflop bet animates
  // from 0 and not from previous round's leftover state.
  useEffect(() => {
    prevBetsRef.current = {}
  }, [round?.id])

  if (!players.length) return null

  // Sort by seat_number clockwise, rotate so "me" is first (bottom)
  const sorted = [...players]
    .filter(p => {
      // Only show players who have a hand in the current round
      // (new joiners waiting for next round have no hand → hidden)
      if (!hands.length) return true  // still loading — show all
      return hands.some(h => h.player_id === p.id)
    })
    .sort((a, b) => (a.seat_number ?? 99) - (b.seat_number ?? 99))
  const sortedMyIndex = sorted.findIndex((p) => p.id === me?.id)
  const ordered = sortedMyIndex >= 0
    ? [...sorted.slice(sortedMyIndex), ...sorted.slice(0, sortedMyIndex)]
    : sorted
  const count = Math.min(ordered.length, 6)
  const positions = isLandscape
    ? (LANDSCAPE_POSITIONS[count] || LANDSCAPE_POSITIONS[2])
    : (PORTRAIT_POSITIONS[count] || PORTRAIT_POSITIONS[2])

  // Dealer/SB/BB detection (seats from player_hands seat_index)
  const dealerIdx = round?.dealer_index ?? 0
  const sbIdx = players.length === 2 ? dealerIdx : (dealerIdx + 1) % players.length
  const bbIdx = players.length === 2 ? (dealerIdx + 1) % 2 : (dealerIdx + 2) % players.length
  function getPlayerSeatIndex(player) {
    const hand = hands.find((h) => h.player_id === player.id)
    return hand?.seat_index ?? -1
  }

  // Reveal opponents' cards only at an ACTUAL showdown (two or more contestants
  // reached the river). If the round ended because everyone else folded, the
  // last player isn't required to show — they may have been bluffing.
  const showdownRevealed = (phase === 'showdown' || phase === 'finished')
    && round?.win_reason !== 'fold'

  return (
    <div className="relative w-full h-full">
      {/* === TABLE OUTER SHADOW === */}
      <div
        className="absolute"
        style={{
          inset: isLandscape ? '4%' : '3%',
          borderRadius: isLandscape ? '50%' : '22px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          background: 'transparent',
          zIndex: 0,
        }}
      />
      {/* === TABLE RIM === */}
      <div
        className="absolute"
        style={{
          inset: isLandscape ? '4%' : '3%',
          borderRadius: isLandscape ? '50%' : '22px',
          background: '#0d0d0d',
          padding: isLandscape ? '10px' : '8px',
          zIndex: 1,
        }}
      >
        {/* === TABLE FELT (inner green) === */}
        <div
          className="absolute"
          style={{
            inset: isLandscape ? '10px' : '8px',
            borderRadius: isLandscape ? 'calc(50% - 10px)' : '16px',
            background: [
              'radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.07) 0%, transparent 60%)',
              'radial-gradient(ellipse at 50% 38%, #42ae68 0%, #2d9650 35%, #1c6e38 65%, #124d28 100%)',
            ].join(', '),
            backgroundBlendMode: 'overlay, normal',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.45)',
            // Felt texture via pseudo-element simulation with repeating pattern
            backgroundImage: [
              'repeating-linear-gradient(45deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 6px)',
              'repeating-linear-gradient(-45deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 6px)',
              'radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.07) 0%, transparent 60%)',
              'radial-gradient(ellipse at 50% 38%, #42ae68 0%, #2d9650 35%, #1c6e38 65%, #124d28 100%)',
            ].join(', '),
          }}
        >
        {/* IMPOKER logo — between community cards and bottom player */}
        <div className="absolute bottom-[22%] left-0 right-0 flex flex-col items-center justify-center gap-0.5 pointer-events-none select-none">
          <MaskIcon
            style={{
              width: isLandscape ? '7%' : '13%',
              height: 'auto',
              opacity: 0.18,
            }}
          />
          <span style={{
            color: 'rgba(255,255,255,0.28)',
            fontWeight: 800,
            letterSpacing: '0.25em',
            fontSize: isLandscape ? '1.1rem' : '0.95rem',
          }}>
            IMPOKER
          </span>
        </div>

        {/* Community cards + pot */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
          {round?.community_cards?.length > 0 && (
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} card={round.community_cards[i]} hidden={!round.community_cards[i]}
                  small={!isLandscape} />
              ))}
            </div>
          )}
          {round && (
            <div className="bg-black/40 text-amber-300 font-bold px-3 py-0.5 rounded-full text-sm">
              {round.pot > 0 ? `${round.pot}` : ''}
            </div>
          )}
        </div>{/* end cards/pot */}

        {/* ── POT ANIMATION chips (pot → winners on showdown) ── */}
        {potAnim && potAnim.map((target, i) => (
          <PotChip key={i} targetX={target.tx} targetY={target.ty} amount={target.amount} delay={i * 120} />
        ))}

        {/* ── BET ANIMATION chips (player → pot on bet/raise/call/blind) ── */}
        {betAnims.map((a) => (
          <FlyingChip
            key={a.id}
            fromX={a.fromX} fromY={a.fromY}
            toX={50} toY={50}
            amount={a.amount}
            durationMs={600}
          />
        ))}

        </div>{/* end felt */}
      </div>{/* end rim */}

      {/* === PLAYER SEATS (absolute positioned around table) === */}
      {ordered.slice(0, count).map((player, idx) => {
        const [xPct, yPct] = positions[idx] || [50, 50]
        const isMe = player.id === me?.id
        const hand = hands.find((h) => h.player_id === player.id)
        const seatIdx = getPlayerSeatIndex(player)
        const myCards = isMe ? (holeCards[hand?.id] ?? null) : null
        const opponentRevealed = revealedByTraitor?.[player.id] ?? {}
        const isCurrent = round && hand && round.current_turn_index === hand.seat_index
          && hand.status === 'active' && phase !== 'showdown' && phase !== 'finished'
        const allCards = showdownRevealed ? (holeCards[hand?.id] ?? null) : null

        // --- Traitor click wiring ---
        // Decide for THIS seat whether cards or the seat should be clickable for
        // the local traitor user, based on level + already-used flags + target validity.
        let onCardClick, onSeatClick, cardsHighlight = false, seatHighlight = false
        const targetValid = hand && hand.status !== 'folded' && !player.left_game
        if (traitor?.isTraitor && phase !== 'showdown' && phase !== 'finished') {
          const lvl = traitor.effectiveLevel
          if (isMe) {
            // Level 4: tap own card to swap it
            if (lvl === 4 && !traitor.usedSwap && hand?.status === 'active') {
              onCardClick = (i) => traitor.swapCard(i)
              cardsHighlight = true
            }
          } else if (targetValid) {
            if (lvl === 2 && !traitor.usedPeek) {
              onCardClick = (i) => traitor.peekCard(player.id, i)
              cardsHighlight = true
            } else if ((lvl === 3 || lvl === 4) && !traitor.usedView) {
              onSeatClick = () => traitor.viewHand(player.id)
              seatHighlight = true
            }
          }
        }

        return (
          <div
            key={player.id}
            className="absolute"
            style={{ left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)', zIndex: 10 }}
          >
            <PlayerSeat
              player={player}
              hand={hand}
              cards={isMe ? myCards : (showdownRevealed && hand?.status !== 'folded' ? allCards : null)}
              revealedCards={isMe ? null : opponentRevealed}
              isMe={isMe}
              isCurrent={isCurrent}
              isDealer={seatIdx === dealerIdx}
              isSB={seatIdx === sbIdx}
              isBB={seatIdx === bbIdx}
              chatMessage={lastMessages?.[player.id]}
              small={!isLandscape}
              bubbleBelow={yPct < 35}
              onCardClick={onCardClick}
              onSeatClick={onSeatClick}
              cardsHighlight={cardsHighlight}
              seatHighlight={seatHighlight}
            />
          </div>
        )
      })}
    </div>
  )
}
