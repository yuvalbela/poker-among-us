import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.js'
import { generateRoomCode } from '../lib/roomCode.js'

export default function Home() {
  const navigate = useNavigate()
  const { userId, loading } = useAuth()
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setError('')
    if (!name.trim()) return setError('הכנס שם שחקן')
    if (!userId) return setError('עוד מתחבר...')
    setBusy(true)
    try {
      const code = generateRoomCode()
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .insert({ code, admin_user_id: userId })
        .select()
        .single()
      if (roomErr) throw roomErr

      const { error: playerErr } = await supabase.from('players').insert({
        room_id: room.id,
        user_id: userId,
        name: name.trim(),
      })
      if (playerErr) throw playerErr

      navigate(`/room/${code}`)
    } catch (e) {
      setError(e.message || 'שגיאה ביצירת חדר')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin() {
    setError('')
    if (!name.trim()) return setError('הכנס שם שחקן')
    if (!/^\d{6}$/.test(joinCode.trim())) return setError('קוד חדר חייב להיות 6 ספרות')
    if (!userId) return setError('עוד מתחבר...')
    setBusy(true)
    try {
      const code = joinCode.trim()
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id, status')
        .eq('code', code)
        .maybeSingle()
      if (roomErr) throw roomErr
      if (!room) throw new Error('לא נמצא חדר עם הקוד הזה')

      // If game is already running → navigate to room as spectator, don't add to players
      if (room.status === 'playing') {
        navigate(`/room/${code}`)
        return
      }

      const trimmedName = name.trim()
      const { data: existing, error: existingErr } = await supabase
        .from('players')
        .select('user_id, name')
        .eq('room_id', room.id)
      if (existingErr) throw existingErr
      const nameTaken = existing?.some(
        (p) => p.user_id !== userId && p.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
      if (nameTaken) throw new Error('השם הזה תפוס בחדר. בחר שם אחר.')

      const { error: playerErr } = await supabase
        .from('players')
        .upsert(
          { room_id: room.id, user_id: userId, name: trimmedName },
          { onConflict: 'room_id,user_id' }
        )
      if (playerErr) throw playerErr

      navigate(`/room/${code}`)
    } catch (e) {
      setError(e.message || 'שגיאה בהצטרפות לחדר')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-emerald-900/60 backdrop-blur rounded-2xl shadow-xl p-6 space-y-5 border border-emerald-700">
        <h1 className="text-3xl font-bold text-center text-amber-300">Poker Among Us</h1>
        <p className="text-center text-emerald-100/80 text-sm">פוקר עם בוגד אחד בין השחקנים</p>

        <div className="space-y-2">
          <label className="block text-sm text-emerald-100">שם שחקן</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="השם שלך"
            className="w-full px-3 py-2 rounded-lg bg-emerald-950 text-white border border-emerald-700 focus:outline-none focus:border-amber-400"
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={busy || loading}
          className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-emerald-950 font-bold disabled:opacity-50"
        >
          {loading ? 'מתחבר...' : 'צור חדר חדש'}
        </button>

        <div className="flex items-center gap-2 text-emerald-100/60 text-sm">
          <div className="flex-1 h-px bg-emerald-700" />
          <span>או</span>
          <div className="flex-1 h-px bg-emerald-700" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-emerald-100">קוד חדר (6 ספרות)</label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            className="w-full px-3 py-2 rounded-lg bg-emerald-950 text-white border border-emerald-700 focus:outline-none focus:border-amber-400 tracking-widest text-center text-xl"
          />
        </div>

        <button
          onClick={handleJoin}
          disabled={busy || loading}
          className="w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold disabled:opacity-50"
        >
          הצטרף לחדר
        </button>

        {error && (
          <div className="text-red-300 text-sm text-center bg-red-900/30 p-2 rounded">{error}</div>
        )}
      </div>
    </div>
  )
}
