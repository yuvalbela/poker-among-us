import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function VotingPanel({ room, players, hands, me, roundNumber, isAdmin, onReveal }) {
  const [votes, setVotes] = useState([])
  const [myVote, setMyVote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(null)

  // Timer
  useEffect(() => {
    if (!room?.voting_started_at) return
    const votingTime = room.settings?.votingTime ?? 60
    function tick() {
      const elapsed = Math.floor((Date.now() - new Date(room.voting_started_at).getTime()) / 1000)
      const left = Math.max(0, votingTime - elapsed)
      setSecondsLeft(left)
      if (left === 0 && isAdmin) onReveal?.()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [room?.voting_started_at, room?.settings?.votingTime, isAdmin])

  useEffect(() => {
    if (!room?.id) return
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('votes').select('*')
        .eq('room_id', room.id).eq('round_number', roundNumber)
      if (!cancelled) {
        setVotes(data || [])
        const mine = data?.find((v) => v.voter_player_id === me?.id)
        if (mine) setMyVote(mine.target_player_id)
      }
    }
    load()
    const ch = supabase
      .channel(`votes:${room.id}:${roundNumber}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes',
        filter: `room_id=eq.${room.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id, roundNumber, me?.id])

  async function vote(targetId) {
    if (myVote || busy || !me) return
    setBusy(true)
    setError('')
    try {
      await supabase.from('votes').insert({
        room_id: room.id, round_number: roundNumber,
        voter_player_id: me.id, target_player_id: targetId,
      })
      setMyVote(targetId)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  // Players who had a hand this round (played) — shown in list for voting
  const playedPlayerIds = new Set((hands || []).map(h => h.player_id))
  const playedPlayers = players.filter(p => playedPlayerIds.has(p.id))

  // Did the current user play in this round? If not, they can only watch the vote
  const iCanVote = playedPlayerIds.has(me?.id)

  // Only non-left players need to vote
  const activePlayers = playedPlayers.filter(p => !p.left_game)
  const everyoneVoted = activePlayers.length > 0 && votes.filter(v =>
    activePlayers.some(p => p.id === v.voter_player_id)
  ).length >= activePlayers.length
  const urgent = secondsLeft !== null && secondsLeft <= 10
  const mins = Math.floor((secondsLeft ?? 0) / 60)
  const secs = ((secondsLeft ?? 0) % 60).toString().padStart(2, '0')

  return (
    <div className="bg-yellow-950/80 border-2 border-yellow-500 rounded-xl p-4 mb-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-yellow-200 font-bold text-lg">🗳️ שלב ההצבעה</div>
        {secondsLeft !== null && (
          <div className={`font-mono text-2xl font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-yellow-200'}`}>
            {mins}:{secs}
          </div>
        )}
      </div>
      <div className="text-yellow-100/70 text-sm">הצבעה גלויה — כולם רואים מי מצביע על מי.</div>

      <div className="space-y-2">
        {playedPlayers.map((p) => {
          const isMe = p.id === me?.id
          const votesForP = votes.filter((v) => v.target_player_id === p.id)
          const voterNames = votesForP.map((v) => playedPlayers.find((x) => x.id === v.voter_player_id)?.name || '?')
          const iMyTarget = myVote === p.id
          const canVote = !isMe && !myVote && !p.left_game && iCanVote
          return (
            <div key={p.id}
              className={`flex items-center justify-between p-3 rounded-lg border
                ${iMyTarget ? 'border-yellow-400 bg-yellow-500/20' : 'border-yellow-800 bg-yellow-950/40'}
                ${isMe ? 'opacity-60' : ''}`}>
              <div>
                <div className="text-yellow-50 font-bold flex items-center gap-1.5">
                  {p.name}
                  {isMe && <span className="text-yellow-300/60 text-xs">(אני)</span>}
                  {p.left_game && <span className="text-white/30 text-xs">יצא</span>}
                </div>
                {voterNames.length > 0 && (
                  <div className="text-yellow-300/70 text-xs">הצביעו: {voterNames.join(', ')}</div>
                )}
              </div>
              {canVote && (
                <button onClick={() => vote(p.id)} disabled={busy}
                  className="px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-bold text-sm disabled:opacity-50">
                  הצבע
                </button>
              )}
              {iMyTarget && <span className="text-yellow-300 font-bold text-sm">✓ בחרתי</span>}
            </div>
          )
        })}
      </div>

      {myVote && (
        <div className="text-yellow-200/70 text-sm text-center">
          הצבעת על {players.find((p) => p.id === myVote)?.name}. ממתין לשאר...
          ({votes.filter(v => activePlayers.some(p => p.id === v.voter_player_id)).length}/{activePlayers.length})
        </div>
      )}

      {isAdmin && everyoneVoted && (
        <button onClick={onReveal}
          className="w-full py-3 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-bold">
          חשוף תוצאה
        </button>
      )}

      {!iCanVote && (
        <div className="text-center text-white/30 text-xs py-1">
          לא שיחקת בסיבוב זה — צופה בלבד
        </div>
      )}

      {error && <div className="text-red-300 text-xs">{error}</div>}
    </div>
  )
}
