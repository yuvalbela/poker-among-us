import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

/**
 * Reveal/result panel — shown after the vote concludes. Visual layout matches
 * the VotingPanel so the player perceives the screen "completing" rather than
 * resizing. Outcome (caught / wrong / tie / traitor-left) is signaled by the
 * header text and the optional reveal banner; tile rows and the footer
 * (status + admin "next round") preserve VotingPanel's structure.
 */
export default function ResultPanel({ room, players, roundNumber, isAdmin, onNextRound }) {
  const [votes, setVotes] = useState([])

  useEffect(() => {
    if (!room?.id) return
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('votes').select('*')
        .eq('room_id', room.id).eq('round_number', roundNumber)
      if (!cancelled) setVotes(data || [])
    }
    load()
    const ch = supabase
      .channel(`result-votes:${room.id}:${roundNumber}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_id=eq.${room.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id, roundNumber])

  // ── Tally + outcome derivation ──
  const tally = {}
  for (const v of votes) tally[v.target_player_id] = (tally[v.target_player_id] || 0) + 1
  const counts = Object.values(tally)
  const maxVotes = counts.length ? Math.max(...counts) : 0
  const topTargets = Object.keys(tally).filter((id) => tally[id] === maxVotes)
  const isTie = topTargets.length > 1
  const traitorLeft = !!room.traitor_left
  const revealedTraitorId = room.revealed_traitor_player_id
  const traitorPlayer = revealedTraitorId ? players.find((p) => p.id === revealedTraitorId) : null
  const traitorCaught = !!revealedTraitorId && !traitorLeft

  // Outcome metadata drives the small status banner (and tile of the caught
  // traitor, when known). Keep all colors in the yellow family for parity with
  // VotingPanel; outcome state is conveyed via the icon/text + a single accent.
  const outcome = traitorLeft
    ? { icon: '🚪', text: 'הבוגד עזב — בוגד חדש בסיבוב הבא', accent: '#fb923c' }
    : isTie
      ? { icon: '🤝', text: 'תיקו — הבוגד שורד', accent: '#fbbf24' }
      : traitorCaught
        ? { icon: '✅', text: `הבוגד נתפס: ${traitorPlayer?.name ?? '?'}`, accent: '#22c55e' }
        : { icon: '❌', text: 'הואשם תמים — הבוגד שורד', accent: '#ef4444' }

  // Players that received any votes — shown in the compact tile list. Order by
  // count desc so the leading suspects are first.
  const tilePlayers = players
    .filter((p) => (tally[p.id] || 0) > 0)
    .sort((a, b) => (tally[b.id] || 0) - (tally[a.id] || 0))

  return (
    <div className="bg-yellow-950/80 border-2 border-yellow-500 rounded-xl p-2 space-y-1.5">
      {/* Header — outcome banner replaces the voting-phase timer */}
      <div
        className="flex items-center gap-2 rounded-md px-2 py-1"
        style={{
          background: 'rgba(60,40,5,0.6)',
          border: `1px solid ${outcome.accent}`,
          minHeight: '28px',
        }}
      >
        <span className="text-base">{outcome.icon}</span>
        <span className="font-bold text-sm" style={{ color: outcome.accent }}>
          {outcome.text}
        </span>
      </div>

      {/* Player tiles — same layout as voting (fixed-width name col, voters on the side) */}
      {tilePlayers.length > 0 && (
        <div className="space-y-1">
          {tilePlayers.map((p) => {
            const count = tally[p.id] || 0
            const voterNames = votes
              .filter((v) => v.target_player_id === p.id)
              .map((v) => players.find((x) => x.id === v.voter_player_id)?.name || '?')
            const isCaughtRow = traitorCaught && p.id === revealedTraitorId
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 px-2 rounded-md"
                style={{
                  background: isCaughtRow ? 'rgba(34,197,94,0.18)' : 'rgba(60,40,5,0.35)',
                  border: isCaughtRow ? '1.5px solid #22c55e' : '1px solid rgba(234,179,8,0.25)',
                  minHeight: '32px',
                }}
              >
                {/* Name column — fixed width to keep voters column aligned */}
                <div className="flex items-center gap-1 text-sm font-bold text-yellow-50 whitespace-nowrap overflow-hidden"
                  style={{ width: '110px', flexShrink: 0 }}>
                  <span className="truncate">{p.name}</span>
                  {isCaughtRow && <span className="text-[10px] text-green-300">🕵️</span>}
                </div>

                {/* Voters list with count badge (mirrors VotingPanel) */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5 text-yellow-300/70 text-[11px]">
                  <span className="text-[10px] bg-yellow-500/30 text-yellow-100 rounded-full px-1.5 font-bold"
                    style={{ flexShrink: 0 }}>
                    {count}
                  </span>
                  <span className="truncate">הצביעו: {voterNames.join(', ')}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer — single line: round-state hint + admin Next Round */}
      <div className="flex items-center gap-2" style={{ minHeight: '28px' }}>
        <span className="text-yellow-200/70 text-[11px] flex-1 truncate">
          {isAdmin ? 'לחץ "סיבוב הבא" כשתהיו מוכנים' : 'ממתין שהאדמין יתחיל סיבוב חדש'}
        </span>
        {isAdmin && (
          <button
            onClick={onNextRound}
            className="rounded-md font-bold text-[11px] uppercase tracking-wide active:scale-95"
            style={{
              background: '#eab308',
              color: '#3b2400',
              border: '1px solid #eab308',
              padding: '4px 12px',
              height: '26px',
            }}
          >
            סיבוב הבא
          </button>
        )}
      </div>
    </div>
  )
}
