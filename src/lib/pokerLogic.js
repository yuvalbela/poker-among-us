// Pure poker logic: no DB, no UI, no side effects.
// Card = { rank: 2..14, suit: 's'|'h'|'d'|'c' }  (14 = Ace)

export const SUITS = ['s', 'h', 'd', 'c']
export const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' }
export const RANK_CHAR = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }

export const HAND_CATEGORIES = {
  9: 'Straight Flush',
  8: 'Four of a Kind',
  7: 'Full House',
  6: 'Flush',
  5: 'Straight',
  4: 'Three of a Kind',
  3: 'Two Pair',
  2: 'One Pair',
  1: 'High Card',
}

export function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

// Fisher-Yates shuffle. Returns a new array.
export function shuffle(deck) {
  const arr = deck.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function cardToString(c) {
  const r = RANK_CHAR[c.rank] || String(c.rank)
  return r + SUIT_SYMBOL[c.suit]
}

// --- Hand evaluation ---

// Returns { category, tiebreakers, cards } where cards is the best 5-card hand.
// `category` is 1..9 (higher is better). `tiebreakers` is a descending array
// of ranks used to break ties at the same category.
export function evaluateFive(cards) {
  if (cards.length !== 5) throw new Error('evaluateFive needs exactly 5 cards')

  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a)
  const suits = cards.map((c) => c.suit)
  const isFlush = suits.every((s) => s === suits[0])

  // Straight: 5 consecutive ranks. Special case: A-2-3-4-5 (wheel).
  const uniqRanks = [...new Set(ranks)]
  let straightHigh = 0
  if (uniqRanks.length === 5) {
    if (uniqRanks[0] - uniqRanks[4] === 4) straightHigh = uniqRanks[0]
    else if (uniqRanks.join() === '14,5,4,3,2') straightHigh = 5 // wheel
  }

  // Count of each rank.
  const counts = {}
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1
  // Sort ranks by (count desc, rank desc) — gives us tiebreakers in priority order.
  const byCount = Object.entries(counts)
    .map(([r, c]) => ({ rank: +r, count: c }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)
  const countSig = byCount.map((x) => x.count).join(',')
  const orderedRanks = byCount.map((x) => x.rank)

  if (isFlush && straightHigh) return { category: 9, tiebreakers: [straightHigh], cards }
  if (countSig === '4,1') return { category: 8, tiebreakers: orderedRanks, cards }
  if (countSig === '3,2') return { category: 7, tiebreakers: orderedRanks, cards }
  if (isFlush) return { category: 6, tiebreakers: ranks, cards }
  if (straightHigh) return { category: 5, tiebreakers: [straightHigh], cards }
  if (countSig === '3,1,1') return { category: 4, tiebreakers: orderedRanks, cards }
  if (countSig === '2,2,1') return { category: 3, tiebreakers: orderedRanks, cards }
  if (countSig === '2,1,1,1') return { category: 2, tiebreakers: orderedRanks, cards }
  return { category: 1, tiebreakers: ranks, cards }
}

// All C(n,5) combinations of an array.
function combinations(arr, k) {
  const result = []
  const combo = []
  function go(start) {
    if (combo.length === k) {
      result.push(combo.slice())
      return
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i])
      go(i + 1)
      combo.pop()
    }
  }
  go(0)
  return result
}

// Given 5..7 cards, return the best 5-card hand evaluation.
export function findBestHand(allCards) {
  if (allCards.length < 5) throw new Error('Need at least 5 cards')
  if (allCards.length === 5) return evaluateFive(allCards)
  let best = null
  for (const five of combinations(allCards, 5)) {
    const ev = evaluateFive(five)
    if (!best || compareEval(ev, best) > 0) best = ev
  }
  return best
}

// 1 if a beats b, -1 if b beats a, 0 if tie.
export function compareEval(a, b) {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1
  for (let i = 0; i < a.tiebreakers.length; i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) {
      return a.tiebreakers[i] > b.tiebreakers[i] ? 1 : -1
    }
  }
  return 0
}

// Given hole cards (2) and community cards (0..5), return best 5-card hand.
// Returns null if fewer than 5 total cards.
export function bestHandFor(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards]
  if (all.length < 5) return null
  return findBestHand(all)
}
