import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { ChatButton } from './ActionPanel.jsx'

/**
 * Voting panel — players guess who the traitor is.
 * Layout is intentionally stable: each player tile is a fixed-height row
 * with the voters list rendered ON THE SIDE of the name (truncated to one line),
 * so adding/removing votes doesn't grow the tile.
 *
 * Footer is a single line: status text · admin reveal button · chat button.
 * Players can change their vote freely until the result is revealed.
 */
export default function VotingPanel({
  room, players, hands, me, roundNumber, isAdmin, onReveal,
  onChat, unreadCount,
}) {
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

  // Live votes — listen to INSERT and DELETE (since revoting deletes the old row)
  useEffect(() => {
    if (!room?.id) return
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('votes').select('*')
        .eq('room_id', room.id).eq('round_number', roundNumber)
      if (!cancelled) {
        setVotes(data || [])
        const mine = data?.find((v) => v.voter_player_id === me?.id)
        setMyVote(mine ? mine.target_player_id : null)
      }
    }
    load()
    const ch = supabase
      .channel(`votes:${room.id}:${roundNumber}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes',
        filter: `room_id=eq.${room.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id, roundNumber, me?.id])

  // Vote / re-vote: UPDATE existing row if I already voted, INSERT otherwise.
  // (Update is preferred over DELETE+INSERT because most setups only have an
  //  insert-or-update RLS policy on the votes table, not a DELETE one.)
  async function vote(targetId) {
    if (busy || !me || myVote === targetId) return
    setBusy(true)
    setError('')
    try {
      if (myVote) {
        const { error: upErr } = await supabase.from('votes')
          .update({ target_player_id: targetId })
          .eq('room_id', room.id).eq('round_number', roundNumber).eq('voter_player_id', me.id)
        if (upErr) throw upErr
      } else {
        const { error: insErr } = await supabase.from('votes').insert({
          room_id: room.id, round_number: roundNumber,
          voter_player_id: me.id, target_player_id: targetId,
        })
        if (insErr) throw insErr
      }
      setMyVote(targetId)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  const playedPlayerIds = new Set((hands || []).map((h) => h.player_id))
  const playedPlayers = players.filter((p) => playedPlayerIds.has(p.id))
  const iCanVote = playedPlayerIds.has(me?.id)
  const activePlayers = playedPlayers.filter((p) => !p.left_game)
  const votedCount = votes.filter((v) => activePlayers.some((p) => p.id === v.voter_player_id)).length
  const everyoneVoted = activePlayers.length > 0 && votedCount >= activePlayers.length

  const urgent = secondsLeft !== null && secondsLeft <= 10
  const mins = Math.floor((secondsLeft ?? 0) / 60)
  const secs = ((secondsLeft ?? 0) % 60).toString().padStart(2, '0')

  // Single-line status text used in the footer
  const statusText = myVote
    ? `הצבעת על ${players.find((p) => p.id === myVote)?.name} · ${votedCount}/${activePlayers.length}`
    : iCanVote
      ? `בחר על מי להצביע · ${votedCount}/${activePlayers.length}`
      : 'צופה בלבד'

  return (
    <div className="bg-yellow-950/80 border-2 border-yellow-500 rounded-xl p-2 space-y-1.5">
      {/* Header */}
      <div className="flex justify-between items-center" style={{ minHeight: '24px' }}>
        <span className="text-yellow-200 font-bold text-sm">🗳️ שלב ההצבעה</span>
        {secondsLeft !== null && (
          <span className={`font-mono text-base font-bold ${urgent ? 'text-red-400 animate-pulse' : 'text-yellow-200'}`}>
            {mins}:{secs}
          </span>
        )}
      </div>

      {/* Player tiles — fixed-height rows; voters list on the side, truncated */}
      <div className="space-y-1">
        {playedPlayers.map((p) => {
          const isMe = p.id === me?.id
          const isMyTarget = myVote === p.id
          const voters = votes
            .filter((v) => v.target_player_id === p.id)
            .map((v) => playedPlayers.find((x) => x.id === v.voter_player_id)?.name || '?')
          const canVote = !isMe && !p.left_game && iCanVote
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 px-2 rounded-md"
              style={{
                background: isMyTarget ? 'rgba(234,179,8,0.18)' : 'rgba(60,40,5,0.35)',
                border: isMyTarget ? '1.5px solid #eab308' : '1px solid rgba(234,179,8,0.25)',
                opacity: p.left_game ? 0.5 : 1,
                minHeight: '32px',
              }}
            >
              {/* Name column — FIXED width so the voters list starts at the same x across rows */}
              <div className="flex items-center gap-1 text-sm font-bold text-yellow-50 whitespace-nowrap overflow-hidden"
                style={{ width: '110px', flexShrink: 0 }}>
                <span className="truncate">{p.name}</span>
                {isMe && <span className="text-yellow-300/60 text-[10px]">(אני)</span>}
                {p.left_game && <span className="text-white/40 text-[10px]">יצא</span>}
              </div>

              {/* Voters list (with count badge on the left of the names) */}
              <div className="flex-1 min-w-0 flex items-center gap-1.5 text-yellow-300/70 text-[11px]">
                {voters.length > 0 && (
                  <span className="text-[10px] bg-yellow-500/30 text-yellow-100 rounded-full px-1.5 font-bold" style={{ flexShrink: 0 }}>
                    {voters.length}
                  </span>
                )}
                <span className="truncate">
                  {voters.length > 0 ? `הצביעו: ${voters.join(', ')}` : ''}
                </span>
              </div>

              {/* Vote button — same width regardless of state to keep layout stable */}
              {canVote ? (
                <button
                  onClick={() => vote(p.id)}
                  disabled={busy}
                  className="rounded-md font-bold text-xs disabled:opacity-50 active:scale-95"
                  style={{
                    background: isMyTarget ? '#fde047' : '#eab308',
                    color: '#3b2400',
                    width: '64px',
                    height: '24px',
                    flexShrink: 0,
                  }}
                >
                  {isMyTarget ? '✓ נבחר' : 'הצבע'}
                </button>
              ) : (
                <div style={{ width: '64px', flexShrink: 0 }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Footer — single line: status · reveal (admin) · chat */}
      <div className="flex items-center gap-2" style={{ minHeight: '28px' }}>
        <span className="text-yellow-200/70 text-[11px] flex-1 truncate">{statusText}</span>
        {isAdmin && (
          <button
            onClick={onReveal}
            disabled={!everyoneVoted && (secondsLeft ?? 1) > 0}
            className="rounded-md font-bold text-[11px] uppercase tracking-wide disabled:opacity-40 active:scale-95"
            style={{
              background: everyoneVoted ? '#eab308' : 'rgba(234,179,8,0.2)',
              color: everyoneVoted ? '#3b2400' : 'rgba(234,179,8,0.6)',
              border: '1px solid #eab308',
              padding: '4px 10px',
              height: '26px',
            }}
          >
            חשוף
          </button>
        )}
        {onChat && <ChatButton onChat={onChat} unreadCount={unreadCount} />}
      </div>

      {error && <div className="text-red-300 text-[10px]">{error}</div>}
    </div>
  )
}
