import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function ResultPanel({ room, players, roundNumber, isAdmin, onNextRound }) {
  const [votes, setVotes] = useState([])

  useEffect(() => {
    if (!room?.id) return
    supabase.from('votes').select('*').eq('room_id', room.id).eq('round_number', roundNumber)
      .then(({ data }) => setVotes(data || []))
    // subscribe to votes in case they arrive slightly late
    const ch = supabase
      .channel(`result-votes:${room.id}:${roundNumber}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `room_id=eq.${room.id}` },
        () => supabase.from('votes').select('*').eq('room_id', room.id).eq('round_number', roundNumber)
               .then(({ data }) => setVotes(data || [])))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [room?.id, roundNumber])

  // Traitor left mid-game
  if (room.traitor_left) {
    return (
      <div className="border-2 rounded-xl p-4 mb-4 space-y-3 text-center"
        style={{ background: 'rgba(180,60,0,0.2)', borderColor: 'rgba(255,120,0,0.5)' }}>
        <div className="text-orange-300 font-bold text-lg">🚪 הבוגד עזב את המשחק</div>
        <div className="text-white/50 text-sm">בוגד חדש ייבחר בסיבוב הבא</div>
        {isAdmin && (
          <button onClick={onNextRound}
            className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-emerald-950 font-bold">
            סיבוב הבא
          </button>
        )}
      </div>
    )
  }

  if (!votes.length && !room.traitor_left) return (
    <div className="text-center text-white/60 text-sm mt-4">טוען תוצאות...</div>
  )

  // Count votes per target
  const tally = {}
  for (const v of votes) {
    tally[v.target_player_id] = (tally[v.target_player_id] || 0) + 1
  }
  const maxVotes = Math.max(...Object.values(tally))
  const topTargets = Object.keys(tally).filter((id) => tally[id] === maxVotes)
  const isTie = topTargets.length > 1
  const accusedId = isTie ? null : topTargets[0]
  const accusedPlayer = players.find((p) => p.id === accusedId)

  const traitorLeft = !!room.traitor_left

  // The revealed_traitor_player_id is set by the RPC only if caught (and traitor didn't leave)
  const revealedTraitorId = room.revealed_traitor_player_id
  const traitorPlayer = revealedTraitorId ? players.find((p) => p.id === revealedTraitorId) : null
  const traitorCaught = !!revealedTraitorId && !traitorLeft
  const innocentAccused = !isTie && !traitorCaught && !traitorLeft

  // Title logic
  const titleText = traitorLeft
    ? (isTie ? '🤝 תיקו — הבוגד יצא, נבחר בוגד חדש' : `❌ טעות — הבוגד יצא, נבחר בוגד חדש`)
    : isTie ? '🤝 תיקו — הבוגד שורד!'
    : traitorCaught ? '✅ הבוגד נתפס!'
    : '❌ הואשם תמים — הבוגד שורד!'

  return (
    <div className={`border-2 rounded-xl p-4 mb-4 space-y-4 ${
      traitorCaught ? 'bg-green-950/80 border-green-500'
      : traitorLeft ? 'bg-orange-950/80 border-orange-500'
      : 'bg-red-950/80 border-red-500'}`}>
      <div className={`font-bold text-xl text-center ${
        traitorCaught ? 'text-green-200'
        : traitorLeft ? 'text-orange-200'
        : 'text-red-200'}`}>
        {titleText}
      </div>

      {/* Vote summary */}
      <div className="space-y-2">
        <div className="text-white/70 text-sm font-bold">תוצאות ההצבעה:</div>
        {players.map((p) => {
          const count = tally[p.id] || 0
          const voterNames = votes.filter((v) => v.target_player_id === p.id)
            .map((v) => players.find((x) => x.id === v.voter_player_id)?.name || '?')
          if (count === 0) return null
          return (
            <div key={p.id} className="flex items-center justify-between bg-white/10 px-3 py-2 rounded-lg">
              <div>
                <span className="text-white font-bold">{p.name}</span>
                <span className="text-white/60 text-xs mr-2">← {voterNames.join(', ')}</span>
              </div>
              <span className="text-amber-300 font-bold">{count} קולות</span>
            </div>
          )
        })}
      </div>

      {/* Traitor reveal */}
      {traitorCaught && traitorPlayer && (
        <div className="bg-red-900/60 border border-red-400 rounded-lg p-3 text-center">
          <div className="text-red-200 text-sm">הבוגד היה:</div>
          <div className="text-red-100 font-bold text-xl">{traitorPlayer.name}</div>
        </div>
      )}

      {isAdmin && (
        <button onClick={onNextRound}
          className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-emerald-950 font-bold">
          סיבוב הבא
        </button>
      )}
    </div>
  )
}
