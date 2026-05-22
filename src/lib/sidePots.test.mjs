// Side-pot algorithm sanity tests. Run with: node src/lib/sidePots.test.mjs
//
// Bypasses Supabase (computeSidePots is a pure function) and just verifies
// the layer math + winner selection.
import { computeSidePots } from './sidePots.js'

let failed = 0
function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) {
    console.error('FAIL:', msg)
    console.error('  expected:', expected)
    console.error('  actual:  ', actual)
    failed++
  } else {
    console.log('ok  ', msg)
  }
}

// Fake hand-eval objects — comparison only needs `compareEval`-compatible
// shape but for our `evaluationByHandId` map we use a "score" int and a
// stub compareEval in test wiring. Easier: use real compareEval from pokerLogic
// by emitting eval shapes it understands. We'll cheat by sorting tied evals
// via category number only.
function evalAt(category) {
  // Real compareEval reads `.category` then `.tiebreakers[]`. We only care
  // about category-level wins in these tests, so empty tiebreakers is fine.
  return { category, tiebreakers: [] }
}

// ── Test 1: classic 3-way side pot, A wins everything ────────────────────
{
  const hands = [
    { id: 'A', player_id: 'pA', total_bet_in_round: 1000, status: 'active' },
    { id: 'B', player_id: 'pB', total_bet_in_round: 500,  status: 'all_in' },
    { id: 'C', player_id: 'pC', total_bet_in_round: 200,  status: 'all_in' },
  ]
  const evals = new Map([
    ['A', evalAt(7)],  // Best
    ['B', evalAt(3)],
    ['C', evalAt(1)],
  ])
  const pots = computeSidePots(hands, evals)
  eq(pots.length, 3, '3 unique levels → 3 pots')
  eq(pots[0].amount, 600, 'main pot = 200 * 3')
  eq(pots[1].amount, 600, 'side 1 = (500-200) * 2')
  eq(pots[2].amount, 500, 'side 2 = (1000-500) * 1')
  eq(pots[0].winners.map(w => w.player_id), ['pA'], 'A wins main pot')
  eq(pots[1].winners.map(w => w.player_id), ['pA'], 'A wins side 1')
  eq(pots[2].winners.map(w => w.player_id), ['pA'], 'A wins side 2 (alone)')
  const total = pots.reduce((s, p) => s + p.amount, 0)
  eq(total, 1700, 'total = 1000 + 500 + 200')
}

// ── Test 2: short stack wins main pot, big stack wins side ───────────────
{
  const hands = [
    { id: 'A', player_id: 'pA', total_bet_in_round: 1000, status: 'active' },
    { id: 'B', player_id: 'pB', total_bet_in_round: 500,  status: 'all_in' },
    { id: 'C', player_id: 'pC', total_bet_in_round: 200,  status: 'all_in' },
  ]
  const evals = new Map([
    ['A', evalAt(3)],
    ['B', evalAt(5)],
    ['C', evalAt(7)],  // Best — but only eligible for main
  ])
  const pots = computeSidePots(hands, evals)
  eq(pots[0].winners.map(w => w.player_id), ['pC'], 'C wins main 600')
  eq(pots[1].winners.map(w => w.player_id), ['pB'], 'B wins side 1')
  eq(pots[2].winners.map(w => w.player_id), ['pA'], 'A wins side 2 alone')
}

// ── Test 3: folded player's contribution stays in pot but they don't win ──
{
  const hands = [
    { id: 'A', player_id: 'pA', total_bet_in_round: 1000, status: 'active' },
    { id: 'B', player_id: 'pB', total_bet_in_round: 500,  status: 'all_in' },
    { id: 'C', player_id: 'pC', total_bet_in_round: 200,  status: 'all_in' },
    { id: 'D', player_id: 'pD', total_bet_in_round: 800,  status: 'folded' },
  ]
  const evals = new Map([
    ['A', evalAt(5)],
    ['B', evalAt(3)],
    ['C', evalAt(1)],
    // D folded — no eval needed
  ])
  const pots = computeSidePots(hands, evals)
  eq(pots.length, 4, 'unique levels: 200, 500, 800, 1000')
  eq(pots[0].amount, 800, 'main = 200 * 4 (D contributes)')
  eq(pots[1].amount, 900, 'side 1 = (500-200) * 3 (A, B, D)')
  eq(pots[2].amount, 600, 'side 2 = (800-500) * 2 (A, D)')
  eq(pots[3].amount, 200, 'side 3 = (1000-800) * 1 (A)')
  eq(pots[0].winners.map(w => w.player_id), ['pA'], 'A wins main (D excluded)')
  eq(pots[1].winners.map(w => w.player_id), ['pA'], 'A wins side 1 (D excluded)')
  eq(pots[2].winners.map(w => w.player_id), ['pA'], 'A wins side 2 (D excluded, B not in this layer)')
  eq(pots[3].winners.map(w => w.player_id), ['pA'], 'A wins side 3 alone')
  const total = pots.reduce((s, p) => s + p.amount, 0)
  eq(total, 2500, 'total = sum of all contributions (1000+500+200+800)')
}

// ── Test 4: split pot — equal contribution, tied hands ──────────────────
{
  const hands = [
    { id: 'A', player_id: 'pA', total_bet_in_round: 500, status: 'active' },
    { id: 'B', player_id: 'pB', total_bet_in_round: 500, status: 'active' },
  ]
  const evals = new Map([
    ['A', evalAt(5)],
    ['B', evalAt(5)],
  ])
  const pots = computeSidePots(hands, evals)
  eq(pots.length, 1, 'one pot — same contribution')
  eq(pots[0].amount, 1000, 'pot = 500 * 2')
  eq(pots[0].winners.map(w => w.player_id).sort(), ['pA', 'pB'], 'both tie')
}

// ── Test 5: edge — everyone same contribution, no all-ins ──────────────
{
  const hands = [
    { id: 'A', player_id: 'pA', total_bet_in_round: 100, status: 'active' },
    { id: 'B', player_id: 'pB', total_bet_in_round: 100, status: 'active' },
    { id: 'C', player_id: 'pC', total_bet_in_round: 100, status: 'folded' },
  ]
  const evals = new Map([['A', evalAt(7)], ['B', evalAt(2)]])
  const pots = computeSidePots(hands, evals)
  eq(pots.length, 1, 'single pot')
  eq(pots[0].amount, 300, '100 * 3 including folded contributor')
  eq(pots[0].winners.map(w => w.player_id), ['pA'], 'A wins')
}

console.log(failed ? `\n${failed} test(s) failed` : '\nAll side-pot tests passed!')
process.exit(failed ? 1 : 0)
