// Turn-order sanity tests. Run with: node src/lib/turnOrder.test.mjs
import {
  nextActiveSeat,
  prevActiveSeat,
  computeBlindsAndFirstToAct,
  computePostflopOrder,
} from './turnOrder.js'

let failed = 0
function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error('FAIL:', msg, '\n  expected:', expected, '\n  actual:  ', actual)
    failed++
  } else {
    console.log('ok  ', msg)
  }
}

const h = (seat, status = 'active') => ({ seat_index: seat, status })

// ── nextActiveSeat / prevActiveSeat — base cases ───────────────────────
{
  const hands = [h(0), h(1), h(2)]
  eq(nextActiveSeat(hands, 0), 1, 'next active from 0 → 1')
  eq(nextActiveSeat(hands, 1), 2, 'next active from 1 → 2')
  eq(nextActiveSeat(hands, 2), 0, 'wrap: next active from 2 → 0')
  eq(prevActiveSeat(hands, 0), 2, 'wrap: prev active from 0 → 2')
  eq(prevActiveSeat(hands, 1), 0, 'prev active from 1 → 0')
}

// ── Skip all-in and folded ─────────────────────────────────────────────
{
  const hands = [h(0, 'all_in'), h(1), h(2, 'folded')]
  eq(nextActiveSeat(hands, 1), 1, 'only one active → next returns same seat')
  eq(prevActiveSeat(hands, 1), 1, 'only one active → prev returns same seat')
}

{
  const hands = [h(0), h(1, 'all_in'), h(2), h(3, 'folded')]
  eq(nextActiveSeat(hands, 0), 2, 'next skips all_in and folded')
  eq(nextActiveSeat(hands, 2), 0, 'wrap with skips')
  eq(prevActiveSeat(hands, 2), 0, 'prev skips all_in')
  eq(prevActiveSeat(hands, 0), 2, 'wrap prev with skips')
}

// ── computeBlindsAndFirstToAct — 3+ players ────────────────────────────
{
  const hands = [h(0), h(1), h(2)]
  // Dealer at seat 0 → SB=1, BB=2, UTG=0
  eq(computeBlindsAndFirstToAct(hands, 0), { sbIdx: 1, bbIdx: 2, firstToAct: 0 },
    '3p dealer=0 → SB=1, BB=2, UTG=0 (dealer is UTG in 3-handed)')
  // Dealer at seat 1 → SB=2, BB=0, UTG=1
  eq(computeBlindsAndFirstToAct(hands, 1), { sbIdx: 2, bbIdx: 0, firstToAct: 1 },
    '3p dealer=1 → SB=2, BB=0, UTG=1')
  // Dealer at seat 2 → SB=0, BB=1, UTG=2
  eq(computeBlindsAndFirstToAct(hands, 2), { sbIdx: 0, bbIdx: 1, firstToAct: 2 },
    '3p dealer=2 → SB=0, BB=1, UTG=2')
}

// ── 4+ players ─────────────────────────────────────────────────────────
{
  const hands = [h(0), h(1), h(2), h(3), h(4)]
  // Dealer=0 → SB=1, BB=2, UTG=3
  eq(computeBlindsAndFirstToAct(hands, 0), { sbIdx: 1, bbIdx: 2, firstToAct: 3 },
    '5p dealer=0 → UTG=3')
  // Dealer=3 → SB=4, BB=0, UTG=1
  eq(computeBlindsAndFirstToAct(hands, 3), { sbIdx: 4, bbIdx: 0, firstToAct: 1 },
    '5p dealer=3 → UTG=1')
}

// ── Heads-up (2 players) — dealer = SB, BB acts first POSTFLOP ─────────
{
  const hands = [h(0), h(1)]
  // Dealer=0 → SB=0 (same as dealer), BB=1, UTG preflop = SB = 0
  eq(computeBlindsAndFirstToAct(hands, 0), { sbIdx: 0, bbIdx: 1, firstToAct: 0 },
    'heads-up dealer=0 → SB acts first preflop')
  eq(computeBlindsAndFirstToAct(hands, 1), { sbIdx: 1, bbIdx: 0, firstToAct: 1 },
    'heads-up dealer=1 → SB acts first preflop')
}

// ── computePostflopOrder — SB acts first, dealer is closer ─────────────
{
  const hands = [h(0), h(1), h(2)]
  // Dealer=0 → SB=1 acts first, closer=0 (dealer)
  eq(computePostflopOrder(hands, 0), { firstSeatAfterDealer: 1, closerSeat: 0 },
    '3p postflop dealer=0 → SB(1) first, dealer(0) closer')
  // Dealer=1 → SB=2 first, dealer=1 closer
  eq(computePostflopOrder(hands, 1), { firstSeatAfterDealer: 2, closerSeat: 1 },
    '3p postflop dealer=1 → SB(2) first, dealer(1) closer')
}

// ── Postflop with all-in: skips correctly ──────────────────────────────
{
  // 3 players, C (seat 2) all-in. Dealer=0.
  // Active seats: 0, 1. firstSeatAfter from 0 = 1 (B). closer = prev active from 1 = 0 (A).
  const hands = [h(0), h(1), h(2, 'all_in')]
  eq(computePostflopOrder(hands, 0), { firstSeatAfterDealer: 1, closerSeat: 0 },
    'postflop with C all-in, dealer=0 → B first, A closer')
  // Dealer=2 (the all-in player). firstSeatAfter skips 2 → 0 (A). closer = prev active from 0 = 1 (B).
  eq(computePostflopOrder(hands, 2), { firstSeatAfterDealer: 0, closerSeat: 1 },
    'postflop with all-in DEALER, firstSeatAfter skips all-in')
}

// ── Edge: 2 active + many all-ins ──────────────────────────────────────
{
  const hands = [h(0), h(1, 'all_in'), h(2), h(3, 'all_in'), h(4, 'folded')]
  eq(nextActiveSeat(hands, 0), 2, 'with multi-all-in, next from 0 → 2')
  eq(nextActiveSeat(hands, 2), 0, 'wrap: next from 2 → 0')
  eq(prevActiveSeat(hands, 0), 2, 'wrap prev: from 0 → 2')
}

// ── Edge: all but one folded → that one is the only "active" ──────────
{
  const hands = [h(0, 'folded'), h(1), h(2, 'folded')]
  eq(nextActiveSeat(hands, 1), 1, 'only active → next returns self')
  eq(prevActiveSeat(hands, 1), 1, 'only active → prev returns self')
}

// ── Edge: no active player at all → null ────────────────────────────────
{
  const hands = [h(0, 'all_in'), h(1, 'all_in'), h(2, 'folded')]
  eq(nextActiveSeat(hands, 0), null, 'no active players → null')
  eq(prevActiveSeat(hands, 0), null, 'no active players → null')
}

console.log(failed ? `\n${failed} test(s) failed` : '\nAll turn-order tests passed!')
process.exit(failed ? 1 : 0)
