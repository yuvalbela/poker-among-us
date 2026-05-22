import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.js'
import { startNewRound } from '../lib/gameFlow.js'
import SeatingLobby from '../components/SeatingLobby.jsx'
import SettingsPanel from '../components/SettingsPanel.jsx'

export default function Lobby() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()

  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [starting, setStarting] = useState(false)  // guards against double-click on "Start Game"
  const [acting, setActing] = useState(false)      // guards Sit / JoinRequest / Leave

  // Load room + subscribe
  useEffect(() => {
    let cancelled = false
    let subs = []

    async function load() {
      const { data: roomData } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle()
      if (!roomData || cancelled) { setLoading(false); return }

      const { data: pl } = await supabase.from('players').select('*').eq('room_id', roomData.id).order('seat_number')
      if (!cancelled) {
        // Set both together to avoid intermediate renders with stale players
        setRoom(roomData)
        setPlayers(pl || [])
        setLoading(false)
      }

      // Subscribe players
      const pSub = supabase.channel(`lobby-players:${roomData.id}:${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomData.id}` },
          async () => {
            const { data } = await supabase.from('players').select('*').eq('room_id', roomData.id).order('seat_number')
            if (!cancelled) setPlayers(data || [])
          })
        .subscribe()
      subs.push(pSub)

      // Subscribe room
      const rSub = supabase.channel(`lobby-room:${roomData.id}:${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomData.id}` },
          (payload) => { if (!cancelled) setRoom(payload.new) })
        .subscribe()
      subs.push(rSub)
    }

    load()
    return () => {
      cancelled = true
      subs.forEach(s => supabase.removeChannel(s))
    }
  }, [code])

  const [currentRound, setCurrentRound] = useState(null)
  const [myJoinRequest, setMyJoinRequest] = useState(null)

  // When game is playing: if I'm already a player → redirect to game
  // If I'm a spectator → stay and show spectator seating view
  useEffect(() => {
    if (room?.status !== 'playing') return
    const isInGame = players.some(p => p.user_id === userId)
    if (isInGame) navigate(`/game/${code}`)
  }, [room?.status, players, userId, code, navigate])

  // Fetch current round info for spectator view
  useEffect(() => {
    if (room?.status !== 'playing' || !room?.id) return
    supabase.from('game_rounds').select('round_number, phase')
      .eq('room_id', room.id).order('round_number', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setCurrentRound(data || null))
  }, [room?.status, room?.id])

  // Track my join request
  useEffect(() => {
    if (!room?.id || !userId) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('join_requests').select('*')
        .eq('room_id', room.id).eq('user_id', userId).maybeSingle()
      if (!cancelled) setMyJoinRequest(data || null)
    }
    load()
    const ch = supabase.channel(`lobby-jr:${room.id}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests',
        filter: `room_id=eq.${room.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id, userId])

  // When join request approved → spectator inserts themselves then navigates to game
  useEffect(() => {
    if (myJoinRequest?.status !== 'approved' || !room?.id || !userId) return
    const chips = myJoinRequest.admin_chips ?? myJoinRequest.desired_chips ?? 1000
    supabase.from('players').upsert({
      room_id: room.id,
      user_id: userId,
      name: myJoinRequest.player_name,
      seat_number: myJoinRequest.desired_seat,
      chips,
      custom_chips: chips,
      left_game: false,
    }, { onConflict: 'room_id,user_id' }).then(() => {
      navigate(`/game/${code}`)
    })
  }, [myJoinRequest?.status, room?.id, userId, code, navigate])

  const me = { id: userId }
  const myPlayer = players.find(p => p.user_id === userId)
  const isAdmin = room?.admin_user_id === userId

  async function handleSit(seatNum, name, chips) {
    if (!room || acting) return
    setActing(true)
    setError('')
    try {
      // Check duplicate name (excluding self)
      const nameTaken = players.some(p => p.user_id !== userId && p.name?.toLowerCase() === name.toLowerCase())
      if (nameTaken) { setError('שם תפוס'); return }

      // Free previous seat if switching
      if (myPlayer?.seat_number && myPlayer.seat_number !== seatNum) {
        // Will be overwritten by upsert below
      }

      await supabase.from('players').upsert(
        { room_id: room.id, user_id: userId, name, seat_number: seatNum, custom_chips: chips },
        { onConflict: 'room_id,user_id' }
      )
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

  // For spectators: submit join request
  async function handleJoinRequest(seatNum, name, chips) {
    if (acting) return
    setActing(true)
    setError('')
    try {
      await supabase.from('join_requests').upsert({
        room_id: room.id, user_id: userId,
        player_name: name, desired_seat: seatNum,
        desired_chips: chips, status: 'pending',
      }, { onConflict: 'room_id,user_id' })
    } catch (e) { setError(e.message) }
    finally { setActing(false) }
  }

  async function handleLeave() {
    if (acting) return
    setActing(true)
    try {
      if (myPlayer) await supabase.from('players').delete().eq('id', myPlayer.id)
    } finally { setActing(false) }
    navigate('/')
  }

  async function handleShuffle() {
    if (!isAdmin || !room) return
    const seated = players.filter(p => p.seat_number != null)
    if (!seated.length) return

    // Generate random unique seat numbers from 1-10
    const nums = Array.from({ length: 10 }, (_, i) => i + 1)
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]]
    }

    await Promise.all(seated.map((p, i) =>
      supabase.from('players').update({ seat_number: nums[i] }).eq('id', p.id)
    ))
  }

  async function handleStartGame() {
    if (!isAdmin || !room || starting) return  // prevent re-entry
    setStarting(true)
    setError('')
    try {
      // Use custom_chips per player, fallback to settings.startingChips
      const defaultChips = room.settings?.startingChips ?? 1000
      const seatedByNumber = [...players]
        .filter(p => p.seat_number != null)
        .sort((a, b) => a.seat_number - b.seat_number)

      // Set chips per player
      await Promise.all(seatedByNumber.map(p =>
        supabase.from('players').update({ chips: p.custom_chips ?? defaultChips, left_game: false }).eq('id', p.id)
      ))
      const updatedPlayers = seatedByNumber.map(p => ({ ...p, chips: p.custom_chips ?? defaultChips, left_game: false }))

      // Clear stale join requests from previous sessions
      await supabase.from('join_requests').delete().eq('room_id', room.id)

      const { error: traitorErr } = await supabase.rpc('pick_traitor', { p_room_id: room.id })
      if (traitorErr) throw traitorErr

      await startNewRound({
        roomId: room.id,
        players: updatedPlayers,
        settings: room.settings,
        roundNumber: 1,
        dealerIndex: 0,
      })
      await supabase.from('rooms').update({ status: 'playing', game_phase: 'poker' }).eq('id', room.id)
    } catch (e) {
      setError(e.message || 'שגיאה')
      setStarting(false)  // unlock on failure so admin can retry
    }
    // On success we don't reset `starting` — the page is about to navigate to /game/:code
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#111118' }}>
      <div className="text-white/40">טוען...</div>
    </div>
  )

  if (!room) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#111118' }}>
      <div className="text-red-300">חדר לא נמצא</div>
      <button onClick={() => navigate('/')} className="text-white/50 hover:text-white text-sm">← חזור</button>
    </div>
  )

  // Spectator view: game running but I'm not a player yet
  const isSpectator = room?.status === 'playing' && !players.some(p => p.user_id === userId)
  if (isSpectator && room) {
    return (
      <>
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 text-red-200 text-sm px-4 py-2 rounded-lg">
            {error}<button onClick={() => setError('')} className="mr-2 text-red-400">×</button>
          </div>
        )}
        <SeatingLobby
          room={room}
          players={players}
          me={{ id: userId }}
          isAdmin={false}
          isSpectator
          currentRound={currentRound}
          myJoinRequest={myJoinRequest}
          onSit={handleJoinRequest}
          onLeave={() => navigate('/')}
          onShuffle={() => {}}
          onStartGame={() => {}}
          roomCode={code}
          onOpenSettings={() => {}}
        />
      </>
    )
  }

  return (
    <>
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 text-red-200 text-sm px-4 py-2 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="mr-2 text-red-400">×</button>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          room={room}
          extraSettings={[
            { key: 'lockStack', label: 'נעל סכום כניסה', hint: 'שחקנים לא יוכלו לבחור כמה להכניס', type: 'toggle', default: false },
          ]}
          onClose={() => setShowSettings(false)}
        />
      )}

      <SeatingLobby
        room={room}
        players={players}
        me={me}
        isAdmin={isAdmin}
        onSit={handleSit}
        onLeave={handleLeave}
        onShuffle={handleShuffle}
        onStartGame={handleStartGame}
        starting={starting}
        roomCode={code}
        onOpenSettings={() => setShowSettings(true)}
      />
    </>
  )
}
