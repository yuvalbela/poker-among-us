import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.js'
import { generateRoomCode } from '../lib/roomCode.js'
import MaskIcon from '../components/MaskIcon.jsx'
import HowToPlayModal from '../components/HowToPlayModal.jsx'

// Accept either a 6-digit room code or a full link containing /room/CODE or /game/CODE.
function extractRoomCode(raw) {
  const s = (raw || '').trim()
  const m = s.match(/(?:\/room\/|\/game\/)?(\d{6})\b/)
  return m ? m[1] : null
}

export default function Home() {
  const navigate = useNavigate()
  const { userId, loading } = useAuth()
  const [name, setName] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [howToOpen, setHowToOpen] = useState(false)

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
    const code = extractRoomCode(joinInput)
    if (!code) return setError('הזן קוד חדר בן 6 ספרות או הדבק קישור')
    if (!userId) return setError('עוד מתחבר...')
    setBusy(true)
    try {
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{
        background: 'radial-gradient(ellipse at top, #1c2a1a 0%, #0a0d12 65%)',
      }}>

      {/* How-to-play button — floating top-left */}
      <button
        onClick={() => setHowToOpen(true)}
        className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
        style={{
          background: 'rgba(234,179,8,0.15)',
          border: '1px solid rgba(234,179,8,0.4)',
          color: '#fbbf24',
          fontSize: '18px',
          fontWeight: 700,
        }}
        title="איך משחקים"
        aria-label="איך משחקים"
      >
        ?
      </button>

      {/* Branding — logo + title */}
      <div className="flex flex-col items-center mb-6 select-none">
        <MaskIcon style={{ width: '88px', height: 'auto', opacity: 0.95, filter: 'drop-shadow(0 4px 20px rgba(234,179,8,0.35))' }} />
        <h1 className="mt-2 text-5xl font-black tracking-[0.2em]" style={{
          color: '#fbbf24',
          textShadow: '0 2px 16px rgba(234,179,8,0.35)',
        }}>
          IMPOKER
        </h1>
        <p className="text-emerald-100/60 text-sm mt-1">פוקר עם בוגד מסתתר</p>
      </div>

      <div className="w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4"
        style={{
          background: 'rgba(10,14,12,0.85)',
          border: '1px solid rgba(234,179,8,0.25)',
          backdropFilter: 'blur(6px)',
        }}>

        {/* Name field */}
        <div className="space-y-1.5">
          <label className="block text-xs uppercase tracking-wider text-emerald-100/60">שם שחקן</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="השם שלך"
            className="w-full px-3 py-2.5 rounded-lg text-white border-none focus:outline-none"
            style={{
              background: 'rgba(15,26,20,0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={busy || loading}
          className="w-full py-3 rounded-lg font-bold disabled:opacity-50 transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(180deg, #f59e0b, #b45309)',
            color: '#1a0c00',
            boxShadow: '0 4px 16px rgba(245,158,11,0.3)',
          }}
        >
          {loading ? 'מתחבר...' : '➕ צור חדר חדש'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-2 text-emerald-100/40 text-xs">
          <div className="flex-1 h-px bg-emerald-100/15" />
          <span>או הצטרף לחדר קיים</span>
          <div className="flex-1 h-px bg-emerald-100/15" />
        </div>

        {/* Join — accepts code OR full link */}
        <div className="space-y-1.5">
          <label className="block text-xs uppercase tracking-wider text-emerald-100/60">קוד חדר או קישור</label>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="123456 או הדבק קישור"
            inputMode="text"
            dir="ltr"
            className="w-full px-3 py-2.5 rounded-lg text-white focus:outline-none text-center"
            style={{
              background: 'rgba(15,26,20,0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
              letterSpacing: '0.05em',
            }}
          />
        </div>

        <button
          onClick={handleJoin}
          disabled={busy || loading}
          className="w-full py-3 rounded-lg font-bold text-white disabled:opacity-50 transition-all active:scale-[0.98]"
          style={{
            background: 'linear-gradient(180deg, #1d4ed8, #1e3a8a)',
            boxShadow: '0 4px 16px rgba(29,78,216,0.3)',
          }}
        >
          🚪 הצטרף לחדר
        </button>

        {error && (
          <div className="text-red-300 text-sm text-center px-3 py-2 rounded"
            style={{ background: 'rgba(127,29,29,0.3)', border: '1px solid rgba(239,68,68,0.4)' }}>
            {error}
          </div>
        )}
      </div>

      <div className="mt-6 text-emerald-100/30 text-[10px] text-center max-w-md">
        💡 לא מכיר את המשחק? לחץ על <span className="text-amber-300/70">?</span> בפינה — יש הסבר מלא של הכללים ויכולות הבוגד.
      </div>

      {howToOpen && <HowToPlayModal onClose={() => setHowToOpen(false)} />}
    </div>
  )
}
