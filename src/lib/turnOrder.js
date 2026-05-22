// Pure turn-order helpers — no Supabase dependency, easy to unit-test.

export function nextActiveSeat(hands, fromSeat) {
  const n = hands.length
  for (let step = 1; step <= n; step++) {
    const seat = (fromSeat + step) % n
    const h = hands.find((x) => x.seat_index === seat)
    if (h && h.status === 'active') return seat
  }
  return null
}

export function prevActiveSeat(hands, fromSeat) {
  const n = hands.length
  for (let step = 1; step <= n; step++) {
    const seat = (fromSeat - step + n) % n
    const h = hands.find((x) => x.seat_index === seat)
    if (h && h.status === 'active') return seat
  }
  return null
}

/**
 * Compute the standard preflop turn order for a freshly-seated round:
 *   sbIdx, bbIdx, firstToAct (UTG).
 * Heads-up: dealer is also SB, BB acts first postflop (and after preflop limp),
 * but SB (=dealer) acts first PREFLOP.
 */
export function computeBlindsAndFirstToAct(hands, dealerIndex) {
  const n = hands.length
  if (n < 2) throw new Error('need at least 2 players')
  const sbIdx = n === 2 ? dealerIndex : (dealerIndex + 1) % n
  const bbIdx = n === 2 ? (dealerIndex + 1) % 2 : (dealerIndex + 2) % n
  const firstToAct = n === 2
    ? sbIdx
    : (nextActiveSeat(hands, bbIdx) ?? bbIdx)
  return { sbIdx, bbIdx, firstToAct }
}

/**
 * Compute postflop turn order:
 *   firstSeatAfterDealer (acts first), closerSeat (acts last).
 * Both skip non-active seats (all-in/folded).
 */
export function computePostflopOrder(hands, dealerIndex) {
  const firstSeatAfterDealer = nextActiveSeat(hands, dealerIndex)
  if (firstSeatAfterDealer == null) return { firstSeatAfterDealer: null, closerSeat: null }
  const closerSeat = prevActiveSeat(hands, firstSeatAfterDealer) ?? firstSeatAfterDealer
  return { firstSeatAfterDealer, closerSeat }
}
