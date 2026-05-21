import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.js'

export default function JoinRequestForm({ room, players, existingRequest, onRequestSent }) {
  const { userId } = useAuth()
  const [name, setName] = useState('')
  const [chips, setChips] = useState(room?.settings?.startingChips ?? 1000)
  const [seat, setSeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const takenSeats = players.filter(p => p.seat_number != null).map(p => p.seat_number)
  const availableSeats = Array.from({ length: 10 }, (_, i) => i + 1).filter(s => !takenSeats.includes(s))

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !seat) return
    setBusy(true)
    setError('')
    try {
      const { error: err } = await supabase.from('join_requests').upsert({
        room_id: room.id,
        user_id: userId,
        player_name: name.trim(),
        desired_seat: parseInt(seat),
        desired_chips: chips,
        status: 'pending',
      }, { onConflict: 'room_id,user_id' })
      if (err) throw err
      onRequestSent?.()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  if (existingRequest) {
    const statusLabel = {
      pending: '⏳ ממתין לאישור האדמין...',
      approved: '✅ בקשתך אושרה! תצטרף בסיבוב הבא',
      rejected: '❌ בקשתך נדחתה',
    }[existingRequest.status]

    return (
      <div className="rounded-2xl p-6 text-center space-y-2"
        style={{ background: '#1e1e28', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="text-white text-lg">{statusLabel}</div>
        {existingRequest.status === 'rejected' && (
          <button onClick={() => supabase.from('join_requests').delete().eq('room_id', room.id).eq('user_id', userId)}
            className="text-white/40 text-sm underline">שלח בקשה מחדש</button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: '#1e1e28', border: '1px solid rgba(255,255,255,0.12)' }}>
      <div className="px-5 py-4 border-b border-white/10">
        <div className="text-white font-bold text-lg">הצטרף למשחק</div>
        <div className="text-white/40 text-xs">תצטרף בסיבוב הבא אחרי אישור האדמין</div>
      </div>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">שם שחקן</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="השם שלך" maxLength={16}
            className="w-full px-3 py-2.5 rounded-lg text-white font-medium focus:outline-none"
            style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.15)' }} />
        </div>
        <div>
          <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">מושב מבוקש</label>
          <select value={seat} onChange={e => setSeat(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-white focus:outline-none"
            style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.15)' }}>
            <option value="">בחר מושב...</option>
            {availableSeats.map(s => <option key={s} value={s}>מושב {s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-white/50 text-xs uppercase tracking-wider block mb-1.5">כסף לכניסה</label>
          {room?.settings?.lockStack ? (
            <div className="px-3 py-2.5 rounded-lg font-bold"
              style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.08)', color: '#e8c44a' }}>
              {room.settings.startingChips ?? 1000} <span className="text-white/30 text-xs font-normal">(נקבע ע"י האדמין)</span>
            </div>
          ) : (
            <input type="number" value={chips} min={1}
              onChange={e => setChips(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2.5 rounded-lg font-medium focus:outline-none"
              style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.15)', color: '#e8c44a' }} />
          )}
        </div>
        {error && <div className="text-red-400 text-xs">{error}</div>}
        <button type="submit" disabled={busy || !name.trim() || !seat}
          className="w-full py-3 rounded-lg font-bold"
          style={{ background: '#2d7a3c', color: 'white', opacity: (!name.trim() || !seat) ? 0.5 : 1 }}>
          שלח בקשה
        </button>
      </form>
    </div>
  )
}
