import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function JoinRequestsPanel({ room }) {
  const [requests, setRequests] = useState([])
  const [editChips, setEditChips] = useState({}) // id -> chips

  useEffect(() => {
    if (!room?.id) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('join_requests').select('*')
        .eq('room_id', room.id).eq('status', 'pending').order('created_at')
      if (!cancelled) setRequests(data || [])
    }
    load()
    const ch = supabase.channel(`jr:${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests', filter: `room_id=eq.${room.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id])

  async function approve(req) {
    const chips = editChips[req.id] ?? req.desired_chips
    // Only update status + chips — the spectator's browser will insert themselves
    await supabase.from('join_requests').update({ status: 'approved', admin_chips: chips }).eq('id', req.id)
  }

  async function reject(req) {
    await supabase.from('join_requests').update({ status: 'rejected' }).eq('id', req.id)
  }

  if (!requests.length) return null

  return (
    <div className="rounded-xl overflow-hidden mb-2"
      style={{ background: '#1e1e28', border: '1px solid rgba(255,165,0,0.3)' }}>
      <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider"
        style={{ background: 'rgba(255,165,0,0.1)', color: '#fbbf24' }}>
        🔔 {requests.length} בקשה להצטרף
      </div>
      <div className="divide-y divide-white/5">
        {requests.map(req => (
          <div key={req.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-bold text-sm">{req.player_name}</div>
                <div className="text-white/40 text-xs">מושב {req.desired_seat}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="number" value={editChips[req.id] ?? req.desired_chips} min={1}
                  onChange={e => setEditChips(prev => ({ ...prev, [req.id]: parseInt(e.target.value) || req.desired_chips }))}
                  className="w-20 text-center text-sm rounded px-2 py-1 focus:outline-none font-bold"
                  style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.15)', color: '#e8c44a' }} />
                <span className="text-white/30 text-xs">💰</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => reject(req)}
                className="flex-1 py-1.5 rounded text-xs font-bold"
                style={{ background: 'transparent', border: '1px solid rgba(231,76,60,0.5)', color: '#e74c3c' }}>
                דחה
              </button>
              <button onClick={() => approve(req)}
                className="flex-1 py-1.5 rounded text-xs font-bold"
                style={{ background: '#2d7a3c', color: 'white' }}>
                אשר
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
