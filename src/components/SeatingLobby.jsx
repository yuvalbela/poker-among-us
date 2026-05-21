import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import MaskIcon from './MaskIcon.jsx'
import SitModal from './SitModal.jsx'

// Portrait seat positions [xPct, yPct] relative to table container
// 10 seats around the table, seat 1 = bottom center
const SEAT_POSITIONS = {
  1:  [50, 92],
  2:  [18, 82],
  3:  [5,  62],
  4:  [5,  38],
  5:  [18, 18],
  6:  [50, 6],
  7:  [82, 18],
  8:  [95, 38],
  9:  [95, 62],
  10: [82, 82],
}

function SeatButton({ seatNum, player, isMe, onClick }) {
  const taken = !!player
  const empty = !taken

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5"
      style={{ minWidth: '68px' }}
    >
      {taken ? (
        <>
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
            style={{
              background: isMe ? '#2d7a3c' : '#2a2a3a',
              border: isMe ? '2px solid #4aba72' : '2px solid rgba(255,255,255,0.2)',
              color: 'white',
            }}>
            {player.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="text-[10px] font-bold truncate max-w-[68px]"
            style={{ color: isMe ? '#4aba72' : 'rgba(255,255,255,0.8)' }}>
            {player.name}
          </div>
          <div className="text-[9px]" style={{ color: '#e8c44a' }}>
            {player.custom_chips ?? player.chips ?? '—'}
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px dashed rgba(255,255,255,0.25)',
              color: 'rgba(255,255,255,0.4)',
            }}>
            {seatNum}
          </div>
          <div className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            SIT
          </div>
        </>
      )}
    </button>
  )
}

export default function SeatingLobby({
  room, players, me, isAdmin,
  isSpectator = false, currentRound = null, myJoinRequest = null,
  onSit, onLeave, onShuffle, onStartGame,
  roomCode, onOpenSettings,
}) {
  const [sitModal, setSitModal] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [unread, setUnread] = useState(0)
  const chatEndRef = useRef(null)
  const myPlayer = players.find(p => p.user_id === me?.id)
  const myPlayerIdRef = useRef(null)
  useEffect(() => { myPlayerIdRef.current = myPlayer?.id }, [myPlayer?.id])

  useEffect(() => {
    if (!room?.id) return
    let cancelled = false
    supabase.from('messages').select('*').eq('room_id', room.id).order('created_at')
      .then(({ data }) => { if (!cancelled) setMessages(data || []) })
    const ch = supabase.channel(`seating-chat:${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        (p) => {
          setMessages(prev => prev.some(m => m.id === p.new.id) ? prev : [...prev, p.new])
          if (!chatOpen && p.new.player_id !== myPlayerIdRef.current) setUnread(c => c + 1)
        })
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatOpen])
  useEffect(() => { if (chatOpen) setUnread(0) }, [chatOpen])

  async function sendChat(e) {
    e.preventDefault()
    if (!chatInput.trim() || !myPlayer || !room) return
    const content = chatInput.trim()
    setChatInput('')
    await supabase.from('messages').insert({ room_id: room.id, player_id: myPlayer.id, content })
  }
  const settings = room?.settings || {}
  const lockStack = settings.lockStack ?? false
  const defaultChips = settings.startingChips ?? 1000
  const allSeated = players.length >= 2 && players.every(p => p.seat_number != null)

  function handleSeatClick(seatNum) {
    const occupant = players.find(p => p.seat_number === seatNum)
    if (occupant && occupant.user_id !== me?.id) return // taken by someone else
    setSitModal(seatNum)
  }

  async function handleSit(seatNum, name, chips) {
    setSitModal(null)
    await onSit(seatNum, name, chips)
  }

  const CONTROLS_H = isAdmin ? 56 : 48  // px

  return (
    <div style={{ height: '100dvh', background: '#111118', position: 'relative', overflow: 'hidden' }}>
      {/* Spectator banner */}
      {isSpectator && (
        <div className="px-4 py-2 text-center text-xs font-bold"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(180,130,0,0.2)', color: '#fbbf24', borderBottom: '1px solid rgba(180,130,0,0.3)', zIndex: 5 }}>
          🎮 המשחק כבר התחיל{currentRound && ` • סיבוב ${currentRound.round_number}`} — בחר מושב ובקש להצטרף
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ position: 'absolute', top: isSpectator ? '40px' : 0, left: 0, right: 0 }}>
        <button onClick={onLeave} className="text-white/40 hover:text-white text-xs">← יציאה</button>
        <div className="text-center">
          <div className="text-white/40 text-[10px]">קוד חדר</div>
          <div className="text-amber-400 font-mono font-bold text-lg tracking-widest">{roomCode}</div>
        </div>
        <div className="w-16" />
      </div>

      {/* Table with seats — fills all space except header and controls */}
      <div style={{ position: 'absolute', top: isSpectator ? '90px' : '70px', bottom: `${CONTROLS_H + 8}px`, left: 0, right: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 8px', }}>
          {/* Table visual */}
          <div style={{ position: 'absolute', inset: '8%', borderRadius: '30px', background: '#0d0d0d', zIndex: 1 }}>
            <div style={{
              position: 'absolute', inset: '8px', borderRadius: '24px',
              backgroundImage: [
                'repeating-linear-gradient(45deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 6px)',
                'repeating-linear-gradient(-45deg, rgba(0,0,0,0.018) 0px, rgba(0,0,0,0.018) 1px, transparent 1px, transparent 6px)',
                'radial-gradient(ellipse at 50% 38%, rgba(255,255,255,0.07) 0%, transparent 60%)',
                'radial-gradient(ellipse at 50% 38%, #42ae68 0%, #2d9650 35%, #1c6e38 65%, #124d28 100%)',
              ].join(', '),
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.4)',
            }}>
              {/* Center logo */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                <MaskIcon style={{ width: '20%', height: 'auto', opacity: 0.1 }} />
                <span style={{ color: 'rgba(255,255,255,0.1)', fontWeight: 800, letterSpacing: '0.2em', fontSize: '0.75rem' }}>
                  IMPOKER
                </span>
              </div>
            </div>
          </div>

          {/* Seat buttons */}
          {Object.entries(SEAT_POSITIONS).map(([seatStr, [xPct, yPct]]) => {
            const seatNum = parseInt(seatStr)
            const occupant = players.find(p => p.seat_number === seatNum)
            const isMe = occupant?.user_id === me?.id
            return (
              <div key={seatNum}
                style={{
                  position: 'absolute',
                  left: `${xPct}%`, top: `${yPct}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                }}>
                <SeatButton
                  seatNum={seatNum}
                  player={occupant}
                  isMe={isMe}
                  onClick={() => handleSeatClick(seatNum)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom controls — fixed height at bottom */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${CONTROLS_H}px`, padding: '6px 12px 8px', background: '#111118', zIndex: 100 }} className="space-y-2">
        {isAdmin && (
          <div className="flex gap-2" style={{ direction: 'ltr' }}>
            {/* Chat — leftmost in LTR */}
            <button onClick={() => setChatOpen(o => !o)}
              className="relative py-2 px-3 rounded-lg text-sm font-bold"
              style={{ background: '#2a2a3a', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', minWidth: '40px' }}>
              💬
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <button onClick={onOpenSettings}
              className="py-2 px-3 rounded-lg text-xs font-bold"
              style={{ background: '#2a2a3a', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)' }}>
              ⚙️
            </button>
            <button onClick={onShuffle}
              className="flex-1 py-2 rounded-lg text-xs font-bold uppercase"
              style={{ background: '#2a2a3a', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
              🔀 ערבב מושבים
            </button>
            <button
              onClick={onStartGame}
              disabled={!allSeated}
              className="flex-1 py-2 rounded-lg text-sm font-bold uppercase"
              style={{ background: allSeated ? '#2d7a3c' : '#1a3a22', color: allSeated ? 'white' : 'rgba(255,255,255,0.3)' }}>
              התחל משחק
            </button>
          </div>
        )}
        {!isAdmin && !isSpectator && (
          <div className="flex items-center gap-2" style={{ direction: 'ltr' }}>
            <button onClick={() => setChatOpen(o => !o)}
              className="relative py-2 px-3 rounded-lg text-sm font-bold"
              style={{ background: '#2a2a3a', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', minWidth: '40px' }}>
              💬
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            <div className="flex-1 text-center text-white/40 text-sm">
              {!myPlayer?.seat_number ? 'בחר מושב לשבת' : `מושב ${myPlayer.seat_number} · ממתין לאדמין`}
            </div>
          </div>
        )}

        {/* Spectator controls */}
        {isSpectator && (
          <div className="text-center py-2 text-sm"
            style={{ color: myJoinRequest?.status === 'pending' ? '#fbbf24' : 'rgba(255,255,255,0.4)' }}>
            {myJoinRequest?.status === 'pending'
              ? '⏳ הבקשה נשלחה — ממתין לאישור האדמין'
              : 'לחץ על מושב פנוי כדי לבחור ולבקש להצטרף'}
          </div>
        )}
      </div>

      {/* Chat panel */}
      {chatOpen && (
        <div className="fixed bottom-20 left-5 z-50 w-72 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: '340px', background: '#1e1e28', border: '2px solid rgba(255,255,255,0.12)' }}>
          <div className="flex justify-between items-center px-3 py-2"
            style={{ background: '#2a2a3a', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-white/80 font-bold text-sm">💬 צ'אט לובי</span>
            <button onClick={() => setChatOpen(false)} className="text-white/40 hover:text-white text-lg">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {messages.map((m) => {
              const author = players.find(p => p.id === m.player_id)
              const mine = author?.user_id === me?.id
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] px-2 py-1.5 rounded-lg text-xs ${mine ? 'bg-amber-600 text-white' : 'bg-emerald-800 text-emerald-50'}`}>
                    <div className="opacity-70 mb-0.5 font-bold">{author?.name || '?'}</div>
                    <div>{m.content}</div>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendChat} className="flex gap-1 p-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              placeholder="הודעה..."
              className="flex-1 px-2 py-1.5 text-xs rounded-lg text-white focus:outline-none"
              style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.1)' }} />
            <button type="submit" disabled={!chatInput.trim()}
              className="px-2 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: '#d97706', color: 'white' }}>
              שלח
            </button>
          </form>
        </div>
      )}

      {/* Sit modal */}
      {sitModal && (
        <SitModal
          seatNumber={sitModal}
          currentName={myPlayer?.name || ''}
          onSit={handleSit}
          onCancel={() => setSitModal(null)}
          lockStack={lockStack}
          defaultChips={defaultChips}
          isSpectator={isSpectator}
        />
      )}
    </div>
  )
}
