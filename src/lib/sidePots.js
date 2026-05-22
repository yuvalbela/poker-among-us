// Pure side-pot math — no Supabase dependency so it can be unit-tested
// directly with `node src/lib/sidePots.test.mjs`.
import { compareEval } from './pokerLogic.js'

/**
 * Compute the per-pot breakdown for showdown distribution.
 *
 * For each unique total-contribution level (smallest to largest), forms a
 * pot equal to (this_level − previous_level) × (players still contributing
 * at this level). Folded players' contributions stay in the pot but they
 * are NOT eligible to win that pot.
 *
 * @param {Array} allHands  player_hands rows: {id, player_id, total_bet_in_round, status}
 * @param {Map}   evaluationByHandId  Map<handId, evalShape> for non-folded hands
 * @returns Array of pots: [{amount, eligible, winners, winningEval}]
 */
export function computeSidePots(allHands, evaluationByHandId) {
  const sorted = [...allHands].sort(
    (a, b) => (a.total_bet_in_round || 0) - (b.total_bet_in_round || 0),
  )
  const uniqueLevels = [...new Set(sorted.map((h) => h.total_bet_in_round || 0))]
    .filter((v) => v > 0)
    .sort((a, b) => a - b)

  const pots = []
  let prevLevel = 0
  for (const level of uniqueLevels) {
    const participants = sorted.filter((h) => (h.total_bet_in_round || 0) >= level)
    const layerAmount = (level - prevLevel) * participants.length
    if (layerAmount > 0) {
      const eligible = participants.filter((h) => h.status !== 'folded')
      pots.push({ amount: layerAmount, eligible, participantsCount: participants.length })
    }
    prevLevel = level
  }

  return pots.map((pot) => {
    if (!pot.eligible.length) return { ...pot, winners: [] }
    let best = pot.eligible[0]
    let bestEval = evaluationByHandId.get(best.id)
    const ties = [best]
    for (let i = 1; i < pot.eligible.length; i++) {
      const h = pot.eligible[i]
      const e = evaluationByHandId.get(h.id)
      const cmp = compareEval(e, bestEval)
      if (cmp > 0) { best = h; bestEval = e; ties.length = 0; ties.push(h) }
      else if (cmp === 0) { ties.push(h) }
    }
    return { ...pot, winners: ties, winningEval: bestEval }
  })
}
