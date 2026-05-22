import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.js'
import { takeAction, startNewRound } from '../lib/gameFlow.js'
import { bestHandFor, HAND_CATEGORIES } from '../lib/pokerLogic.js'
import TraitorPanel from '../components/TraitorPanel.jsx'
import { useTraitor } from '../lib/useTraitor.js'
import VotingPanel from '../components/VotingPanel.jsx'
import ResultPanel from '../components/ResultPanel.jsx'
import PokerTable from '../components/PokerTable.jsx'
import ActionPanel, { ChatButton } from '../components/ActionPanel.jsx'
import JoinRequestForm from '../components/JoinRequestForm.jsx'
import JoinRequestsPanel from '../components/JoinRequestsPanel.jsx'

const PHASE_LABELS = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
  finished: 'הסיבוב נגמר',
}

export default function Game() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()

  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [round, setRound] = useState(null)
  const [hands, setHands] = useState([])
  const [holeCards, setHoleCards] = useState({})
  const [error, setError] = useState('')
  const [raiseAmt, setRaiseAmt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastSeenCount, setLastSeenCount] = useState(0)
  const [lastMessages, setLastMessages] = useState({}) // playerId → last short msg
  const chatEndRef = useRef(null)
  const [revealedByTraitor, setRevealedByTraitor] = useState({})
  const [myJoinRequest, setMyJoinRequest] = useState(null) // playerId → {cardIndex: card}

  useEffect(() => {
    let cancelled = false
    let channels = []

    async function load() {
      const { data: roomData } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle()
      if (cancelled || !roomData) return
      setRoom(roomData)

      const [{ data: pl }, { data: rd }] = await Promise.all([
        supabase.from('players').select('*').eq('room_id', roomData.id).order('joined_at'),
        supabase
          .from('game_rounds')
          .select('*')
          .eq('room_id', roomData.id)
          .order('round_number', { ascending: false }).order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (cancelled) return
      setPlayers(pl || [])
      setRound(rd || null)

      if (rd) {
        const { data: hd } = await supabase.from('player_hands').select('*').eq('round_id', rd.id).order('seat_index')
        if (!cancelled) setHands(hd || [])
        if (hd?.length) {
          const { data: hc } = await supabase
            .from('player_hole_cards')
            .select('player_hand_id, cards')
            .in('player_hand_id', hd.map((h) => h.id))
          if (!cancelled) {
            const map = {}
            for (const row of hc || []) map[row.player_hand_id] = row.cards
            setHoleCards(map)
          }
        }
      }

      const roomCh = supabase
        .channel(`game-room:${roomData.id}:${Date.now()}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomData.id}` },
          (payload) => { if (!cancelled) setRoom(payload.new) })
        .subscribe()
      channels.push(roomCh)

      async function refetchRound() {
        const { data } = await supabase
          .from('game_rounds')
          .select('*')
          .eq('room_id', roomData.id)
          .order('round_number', { ascending: false }).order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!cancelled && data) {
          setRound(data)
          const { data: hd } = await supabase.from('player_hands').select('*').eq('round_id', data.id).order('seat_index')
          if (!cancelled && hd) setHands(hd)
        }
      }

      const playersCh = supabase
        .channel(`game-players:${roomData.id}:${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomData.id}` }, async () => {
          const { data } = await supabase.from('players').select('*').eq('room_id', roomData.id).order('joined_at')
          if (!cancelled) setPlayers(data || [])
          // Also re-fetch round in case phase changed (e.g., finishOneWinner)
          await refetchRound()
        })
        .subscribe()
      channels.push(playersCh)

      const roundsCh = supabase
        .channel(`game-rounds:${roomData.id}:${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${roomData.id}` }, async () => {
          const { data } = await supabase
            .from('game_rounds')
            .select('*')
            .eq('room_id', roomData.id)
            .order('round_number', { ascending: false }).order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (!cancelled) setRound(data || null)
          if (data) {
            const { data: hd } = await supabase.from('player_hands').select('*').eq('round_id', data.id).order('seat_index')
            if (!cancelled) setHands(hd || [])
            if (hd?.length) {
              const { data: hc } = await supabase
                .from('player_hole_cards')
                .select('player_hand_id, cards')
                .in('player_hand_id', hd.map((h) => h.id))
              if (!cancelled) {
                const map = {}
                for (const row of hc || []) map[row.player_hand_id] = row.cards
                setHoleCards(map)
              }
            }
          }
        })
        .subscribe()
      channels.push(roundsCh)
    }

    load()
    return () => {
      cancelled = true
      channels.forEach((c) => supabase.removeChannel(c))
    }
  }, [code])

  useEffect(() => {
    if (!round) return
    const ch = supabase
      .channel(`game-hands:${round.id}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_hands', filter: `round_id=eq.${round.id}` }, async () => {
        const { data } = await supabase.from('player_hands').select('*').eq('round_id', round.id).order('seat_index')
        if (data) setHands(data)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [round?.id])

  // Refetch hole cards when phase changes (showdown reveals others' cards)
  useEffect(() => {
    if (!round || !hands.length) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('player_hole_cards')
        .select('player_hand_id, cards')
        .in('player_hand_id', hands.map((h) => h.id))
      if (cancelled) return
      const map = {}
      for (const row of data || []) map[row.player_hand_id] = row.cards
      setHoleCards(map)
    })()
    return () => { cancelled = true }
  }, [round?.phase, hands.length])

  const me = players.find((p) => p.user_id === userId)
  const myHand = hands.find((h) => h.player_id === me?.id)
  const isAdmin = room?.admin_user_id === userId

  // --- Traitor reveal handler — must be defined before useTraitor so it can be passed in ---
  const traitorOnReveal = (targetPlayerId, cardIndex, card) => {
    setRevealedByTraitor((prev) => ({
      ...prev,
      [targetPlayerId]: { ...(prev[targetPlayerId] || {}), [cardIndex]: card },
    }))
    const dur = room?.settings?.revealDurationSeconds ?? 5
    if (dur === 'round') return
    const ms = Math.max(1, Number(dur)) * 1000
    setTimeout(() => setRevealedByTraitor((prev) => {
      const next = { ...prev }
      if (next[targetPlayerId]) {
        const remaining = { ...next[targetPlayerId] }
        delete remaining[cardIndex]
        if (Object.keys(remaining).length === 0) delete next[targetPlayerId]
        else next[targetPlayerId] = remaining
      }
      return next
    }), ms)
  }

  // Centralized traitor state + ability handlers (shared by TraitorPanel + PokerTable).
  // MUST be called unconditionally before any early returns to respect React's rules of hooks.
  const traitor = useTraitor({
    roomId: room?.id,
    roundId: round?.id,
    settings: room?.settings || {},
    myPlayerId: me?.id,
    onReveal: traitorOnReveal,
  })

  // Clear traitor card reveals at end of round (so they don't leak into next round)
  useEffect(() => {
    if (round?.phase === 'finished') setRevealedByTraitor({})
  }, [round?.phase, round?.id])

  // Persistent chat
  useEffect(() => {
    if (!room?.id) return
    let cancelled = false
    supabase.from('messages').select('*').eq('room_id', room.id).order('created_at')
      .then(({ data }) => {
        if (!cancelled) {
          setMessages(data || [])
          setLastSeenCount(data?.length || 0)
        }
      })
    const ch = supabase.channel(`game-chat:${room.id}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` },
        (p) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === p.new.id)) return prev
            const next = [...prev, p.new]
            // Speech bubble: update lastMessages
            const senderId = p.new.player_id
            const content = p.new.content
            const short = content.length > 28 ? content.slice(0, 25) + '...' : content
            setLastMessages((lm) => ({ ...lm, [senderId]: short }))
            // Auto-clear speech bubble after 5s
            setTimeout(() => setLastMessages((lm) => { const n = {...lm}; if (n[senderId] === short) delete n[senderId]; return n }), 5000)
            return next
          })
          if (!chatOpen) setUnreadCount((c) => c + 1)
        })
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatOpen])

  // Auto-fold when it's the turn of a player who left
  useEffect(() => {
    if (!round || !hands.length || !players.length) return
    if (round.phase === 'showdown' || round.phase === 'finished') return
    const currentHand = hands.find(h => h.seat_index === round.current_turn_index && h.status === 'active')
    if (!currentHand) return
    const currentPlayer = players.find(p => p.id === currentHand.player_id)
    if (!currentPlayer?.left_game) return
    // Only one client should trigger — use the one with lowest user_id (admin or first player)
    const activePlayerIds = players.filter(p => !p.left_game).map(p => p.user_id).sort()
    if (userId !== activePlayerIds[0] && !isAdmin) return
    // Auto-fold the disconnected player
    takeAction({ roundId: round.id, playerId: currentHand.player_id, action: 'fold' }).catch(() => {})
  }, [round?.current_turn_index, round?.phase, players])

  // Track my join request (for spectators / rejoining players)
  useEffect(() => {
    if (!room?.id || !userId) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase.from('join_requests').select('*')
        .eq('room_id', room.id).eq('user_id', userId).maybeSingle()
      if (!cancelled) setMyJoinRequest(data || null)
    }
    load()
    const ch = supabase.channel(`my-jr:${room.id}:${userId}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests',
        filter: `room_id=eq.${room.id}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [room?.id, userId])

  // When my join request gets approved (mirroring Lobby behavior so a broke
  // player rejoining mid-game doesn't need to navigate back to the lobby):
  // upsert myself back into players with the admin-set chips and seat,
  // clearing left_game.
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
    }, { onConflict: 'room_id,user_id' })
  }, [myJoinRequest?.status, room?.id, userId])

  // Clear unread when chat opens
  useEffect(() => {
    if (chatOpen) {
      setUnreadCount(0)
      setLastSeenCount(messages.length)
    }
  }, [chatOpen])

  async function sendChatMessage(e) {
    e.preventDefault()
    if (!chatInput.trim() || !me || !room) return
    const content = chatInput.trim()
    setChatInput('')
    await supabase.from('messages').insert({ room_id: room.id, player_id: me.id, content })
  }
  const isMyTurn = round && myHand && round.current_turn_index === myHand.seat_index && myHand.status === 'active' && round.phase !== 'showdown' && round.phase !== 'finished'

  // Pre-action (queue action before your turn)
  const [preAction, setPreAction] = useState(null) // null | 'check_or_fold' | 'check' | 'fold'

  // Execute pre-action when turn arrives
  useEffect(() => {
    if (!isMyTurn || !preAction) return
    const action = preAction
    setPreAction(null)
    const callAmt = myHand ? Math.max(0, round.current_bet - myHand.current_bet) : 0
    if (action === 'check_or_fold') {
      doAction(callAmt === 0 ? 'check' : 'fold')
    } else if (action === 'check') {
      if (callAmt === 0) doAction('check')
      // if there's a bet, don't execute — let player decide
    } else if (action === 'fold') {
      doAction('fold')
    }
  }, [isMyTurn, preAction])

  // Player turn timer — runs on ALL clients so a disconnected current player
  // doesn't stall the round. Local UI countdown uses the same numbers; the
  // server enforces expiry via the auto_fold_stuck_player RPC.
  const playerTimerSeconds = room?.settings?.playerTimerSeconds ?? 0
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(null)

  useEffect(() => {
    if (!playerTimerSeconds || !round?.turn_started_at || !round?.id) {
      setTurnSecondsLeft(null)
      return
    }
    if (round.phase === 'showdown' || round.phase === 'finished') {
      setTurnSecondsLeft(null)
      return
    }
    let triggered = false
    function tick() {
      const elapsed = Math.floor((Date.now() - new Date(round.turn_started_at).getTime()) / 1000)
      const left = Math.max(0, playerTimerSeconds - elapsed)
      // Only show the visible countdown to the current player
      setTurnSecondsLeft(isMyTurn ? left : null)
      // Once we're past the server's grace (5s), any client can call the RPC.
      // The server re-checks the time, so duplicate calls from multiple clients
      // are harmless.
      if (elapsed >= playerTimerSeconds + 5 && !triggered) {
        triggered = true
        supabase.rpc('auto_fold_stuck_player', { p_round_id: round.id })
          .catch(() => {/* server validates; client errors are non-fatal */})
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [isMyTurn, playerTimerSeconds, round?.turn_started_at, round?.id, round?.phase])

  async function doAction(action, amount = 0) {
    if (!round || !me || busy) return  // re-entry guard
    setError('')
    setBusy(true)
    try {
      await takeAction({ roundId: round.id, playerId: me.id, action, raiseTo: amount })
    } catch (e) {
      setError(e.message || 'שגיאה')
    } finally {
      setBusy(false)
      // Force re-fetch round immediately after any action
      // (handles end-of-round phase changes that Realtime might deliver late)
      const { data: freshRound } = await supabase
        .from('game_rounds').select('*').eq('id', round.id).maybeSingle()
      if (freshRound) setRound(freshRound)
      const { data: freshHands } = await supabase
        .from('player_hands').select('*').eq('round_id', round.id).order('seat_index')
      if (freshHands) setHands(freshHands)
      const { data: freshPlayers } = await supabase
        .from('players').select('*').eq('room_id', room.id).order('joined_at')
      if (freshPlayers) setPlayers(freshPlayers)
    }
  }

  async function startVoting() {
    if (!isAdmin || !room || busy) return
    setBusy(true)
    try {
      await supabase.from('rooms').update({
        game_phase: 'voting',
        voting_started_at: new Date().toISOString(),
      }).eq('id', room.id)
    } finally { setBusy(false) }
  }

  async function revealResult() {
    if (!isAdmin || !room || !round || busy) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc('reveal_voting_result', {
        p_room_id: room.id,
        p_round_number: round.round_number,
      })
      if (error) setError(error.message)
    } finally { setBusy(false) }
  }

  async function handleExit() {
    if (me) {
      // If it's my turn right now, fold immediately
      if (isMyTurn && myHand?.status === 'active') {
        await takeAction({ roundId: round.id, playerId: me.id, action: 'fold' }).catch(() => {})
        await new Promise(r => setTimeout(r, 300))
      }
      // Mark as left — auto-fold will trigger when it's their turn in future rounds
      await supabase.from('players').update({ left_game: true }).eq('id', me.id)
      // If traitor left, reset so new one gets picked next round
      const { data: ts } = await supabase.from('traitor_state').select('current_traitor_player_id').eq('room_id', room.id).maybeSingle()
      if (ts?.current_traitor_player_id === me.id) {
        await supabase.from('traitor_state').update({ current_traitor_player_id: null }).eq('room_id', room.id)
        await supabase.from('rooms').update({ traitor_left: true }).eq('id', room.id)
      }
    }
    navigate('/')
  }

  async function nextRound() {
    if (!isAdmin || !room || busy) return  // re-entry guard
    setError('')
    setBusy(true)
    try {
      const levelUp = room.settings?.traitorLevelUpRounds ?? 2
      const { error: traitorErr } = await supabase.rpc('advance_round_traitor', {
        p_room_id: room.id,
        p_level_up_rounds: levelUp,
      })
      if (traitorErr) throw traitorErr

      const { data: lastRound } = await supabase
        .from('game_rounds')
        .select('round_number, dealer_index')
        .eq('room_id', room.id)
        .order('round_number', { ascending: false }).order('created_at', { ascending: false })
        .limit(1)
        .single()
      // Re-fetch players fresh from DB to get latest left_game status
      const { data: freshPlayers } = await supabase.from('players').select('*').eq('room_id', room.id)
      // Anyone who lost all their chips this round becomes a spectator. We mark
      // them left_game so the game treats them as "out" but keep the record so
      // round history + chat names stay intact; they can submit a join request
      // to re-buy and rejoin.
      const broke = (freshPlayers || players).filter(p => !p.left_game && (p.chips ?? 0) <= 0)
      if (broke.length) {
        await Promise.all(broke.map(p =>
          supabase.from('players').update({ left_game: true }).eq('id', p.id)
        ))
      }
      const activePlayers = (freshPlayers || players).filter(p => !p.left_game && (p.chips ?? 0) > 0 && !broke.some(b => b.id === p.id))
      const dealerIndex = ((lastRound?.dealer_index ?? 0) + 1) % Math.max(1, activePlayers.length)
      await startNewRound({
        roomId: room.id,
        players: activePlayers,
        settings: room.settings,
        roundNumber: (lastRound?.round_number ?? 0) + 1,
        dealerIndex,
      })
      await supabase.from('rooms').update({ game_phase: 'poker', revealed_traitor_player_id: null, traitor_left: false }).eq('id', room.id)
    } catch (e) {
      setError(e.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  if (!room || !round) {
    return <div className="min-h-screen flex items-center justify-center text-emerald-100">טוען משחק...</div>
  }

  // Spectator / rejoining player view — also covers existing players who ran
  // out of chips (left_game=true with no chips). We treat them as spectators
  // so they can submit a fresh join request and re-buy in.
  const meBroke = me && me.left_game && (me.chips ?? 0) <= 0
  if (!me || meBroke) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#111118', overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ flexShrink: 0 }}>
          <button onClick={() => navigate('/')} className="text-white/40 hover:text-white text-xs">← יציאה</button>
          <div className="text-amber-400 font-mono font-bold">{code}</div>
          <div className="w-12" />
        </div>
        {meBroke && (
          <div className="px-3 py-2 text-center text-xs text-amber-200"
            style={{ background: 'rgba(180,130,0,0.18)', borderBottom: '1px solid rgba(180,130,0,0.35)' }}>
            💸 נגמרו לך הצ'יפים — שלח בקשת חזרה לאדמין כדי לקנות עוד ולהמשיך.
          </div>
        )}
        {/* Spectator table view */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: '0 4px' }}>
            <PokerTable players={players} hands={hands} holeCards={holeCards}
              revealedByTraitor={{}} round={round} me={null} lastMessages={{}} />
          </div>
        </div>
        {/* Join request form */}
        <div style={{ flexShrink: 0, padding: '8px 12px 12px' }}>
          <JoinRequestForm room={room} players={players}
            existingRequest={myJoinRequest}
            onRequestSent={() => {}} />
        </div>
      </div>
    )
  }

  // Player is in the game but has no hand in current round (joined mid-game, waiting for next round)
  const isWaitingForNextRound = me && !myHand && room.game_phase === 'poker'

  const callAmount = myHand ? Math.max(0, round.current_bet - myHand.current_bet) : 0
  const chipsLeft = myHand ? myHand.chips_at_start - myHand.total_bet_in_round : 0
  const minRaise = round.current_bet + round.big_blind
  const maxRaise = myHand ? myHand.current_bet + chipsLeft : 0
  const showdownRevealed = round.phase === 'showdown' || round.phase === 'finished'


  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#111118', overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ flexShrink: 0 }} className="flex items-center justify-between px-3 py-2">
        <button onClick={handleExit} className="text-white/50 hover:text-white/90 text-xs">← יציאה</button>
        <div className="text-center">
          <div className="text-white/40 text-[10px]">{code} · סיבוב {round.round_number}</div>
          <div className="text-amber-400 font-bold text-sm">{PHASE_LABELS[round.phase]}</div>
        </div>
        <div className="text-white/40 text-xs">💰 <span className="text-amber-300 font-bold">{me.chips}</span></div>
      </div>

      {/* ── TABLE — takes all remaining space ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: '0 4px' }}>
        <PokerTable
          players={players}
          hands={hands}
          holeCards={holeCards}
          revealedByTraitor={revealedByTraitor}
          round={round}
          me={me}
          lastMessages={lastMessages}
          traitor={traitor}
        />
        </div>
      </div>

      {/* ── BOTTOM PANEL — stable height: each sub-area reserves a tight slot so the
              table above doesn't shift when banners/traitor/buttons appear/disappear.
              Slots are tuned to the minimum that prevents visible jiggle. ── */}
      <div style={{ flexShrink: 0, padding: '2px 8px 6px' }}>
        {/* Banner slot — winner banner only shows at round end. With side pots,
            we render a structured per-pot breakdown; otherwise the simple "X ניצח" line. */}
        <div style={{ minHeight: '24px' }}>
          {(round.phase === 'showdown' || round.phase === 'finished') && round.winner_name && (() => {
            const pots = Array.isArray(round.pot_breakdown) ? round.pot_breakdown : []
            const multiPot = pots.length >= 2
            const bannerCss = {
              background: 'rgba(180,130,0,0.2)',
              border: '1px solid rgba(180,130,0,0.4)',
              color: '#f0c040',
            }
            if (multiPot) {
              // One row per pot: "Main 600 · Alice (Two Pair)"
              return (
                <div className="rounded-lg px-3 py-1 text-[11px] font-bold space-y-0.5" style={bannerCss}>
                  {pots.map((p, i) => {
                    const label = p.label === 'main' ? 'Main' : p.label.replace('side', 'Side ')
                    const winners = (p.winners || []).join(', ')
                    return (
                      <div key={i} className="flex justify-between items-center">
                        <span>🏆 {label}: {winners}{p.hand_category ? ` (${p.hand_category})` : ''}</span>
                        <span className="text-amber-300">{p.amount} 💰</span>
                      </div>
                    )
                  })}
                </div>
              )
            }
            // Single pot — keep the original compact one-line banner
            return (
              <div className="rounded-lg px-3 py-1 text-center text-xs font-bold" style={bannerCss}>
                🏆 {round.winner_name} ניצח
                {round.win_reason === 'fold' && ' · כולם פולד'}
                {round.win_reason === 'split' && ' · תיקו'}
                {round.win_reason && round.win_reason !== 'fold' && round.win_reason !== 'split' && ` · ${round.win_reason}`}
                {' '}({round.pot} 💰)
              </div>
            )
          })()}
        </div>

        {/* Join requests — admin only */}
        {isAdmin && <JoinRequestsPanel room={room} />}

        {/* Waiting for next round — player approved but has no hand yet */}
        {isWaitingForNextRound && (
          <div className="text-center py-3 rounded-xl space-y-1"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-white/70 font-bold text-sm">⏳ אושרת להצטרף!</div>
            <div className="text-white/40 text-xs">תצטרף בסיבוב הבא</div>
          </div>
        )}

        {/* Traitor slot — single-line inline panel reserves 22px */}
        <div style={{ minHeight: '22px' }}>
          <TraitorPanel
            traitor={traitor}
            roundOver={
              round.phase === 'showdown' || round.phase === 'finished' ||
              room.game_phase === 'voting' || room.game_phase === 'result'
            }
          />
        </div>

        {/* Action panel */}
        {isMyTurn && (
          <ActionPanel
            round={round}
            myHand={myHand}
            myCards={myHand && holeCards[myHand.id]}
            me={me}
            turnSecondsLeft={turnSecondsLeft}
            onAction={doAction}
            busy={busy}
            onChat={() => setChatOpen((o) => !o)}
            unreadCount={unreadCount}
          />
        )}

        {/* Pre-action buttons — when it's NOT my turn.
            Layout matches the my-turn ActionPanel: 1 status line + 1 row of buttons,
            same heights. Buttons (right→left in RTL): FOLD · CHECK · CHECK OR FOLD · CHAT */}
        {!isMyTurn && myHand?.status === 'active' && round.phase !== 'showdown' && round.phase !== 'finished' && room.game_phase === 'poker' && (
          <div className="space-y-1">
            <div className="flex items-center justify-end gap-2 px-1" style={{ minHeight: '14px' }}>
              <span className="text-white/30 text-[10px] uppercase tracking-wider">
                ממתין ל-{players.find((p) => p.id === hands.find((h) => h.seat_index === round.current_turn_index)?.player_id)?.name || '?'}
              </span>
              {isAdmin && (() => {
                const stuckHand = hands.find(h => h.seat_index === round.current_turn_index)
                const stuckPlayer = players.find(p => p.id === stuckHand?.player_id)
                if (!stuckPlayer?.left_game) return null
                return <span className="text-[10px] text-orange-400">⚡ פולד אוטומטי...</span>
              })()}
              {preAction && <span className="text-[9px] text-white/30">· לחץ שוב לביטול</span>}
            </div>
            <div className="flex gap-2" style={{ minHeight: '44px' }}>
              <button
                onClick={() => setPreAction(a => a === 'fold' ? null : 'fold')}
                className="flex-1 py-2 rounded-lg font-bold uppercase tracking-wide text-sm transition-all active:scale-95"
                style={{
                  background: 'transparent',
                  border: preAction === 'fold' ? '2px solid #e74c3c' : '1px solid rgba(231,76,60,0.4)',
                  color: preAction === 'fold' ? '#e74c3c' : 'rgba(231,76,60,0.5)',
                }}>
                {preAction === 'fold' ? '✓ ' : ''}FOLD
              </button>
              <button
                onClick={() => setPreAction(a => a === 'check' ? null : 'check')}
                className="flex-1 py-2 rounded-lg font-bold uppercase tracking-wide text-sm transition-all active:scale-95"
                style={{
                  background: 'transparent',
                  border: preAction === 'check' ? '2px solid #4caf50' : '1px solid rgba(76,175,80,0.4)',
                  color: preAction === 'check' ? '#4caf50' : 'rgba(76,175,80,0.5)',
                }}>
                {preAction === 'check' ? '✓ ' : ''}CHECK
              </button>
              <button
                onClick={() => setPreAction(a => a === 'check_or_fold' ? null : 'check_or_fold')}
                className="flex-1 py-2 rounded-lg font-bold uppercase tracking-wide text-sm transition-all active:scale-95"
                style={{
                  background: preAction === 'check_or_fold' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
                  border: preAction === 'check_or_fold' ? '1px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.15)',
                  color: preAction === 'check_or_fold' ? 'white' : 'rgba(255,255,255,0.5)',
                }}>
                {preAction === 'check_or_fold' ? '✓ ' : ''}<span className="text-[11px]">CHECK</span> / <span className="text-[11px]">FOLD</span>
              </button>
              <ChatButton onChat={() => setChatOpen((o) => !o)} unreadCount={unreadCount} />
            </div>
          </div>
        )}

        {/* After round — voting button */}
        {(round.phase === 'showdown' || round.phase === 'finished') && (!room.game_phase || room.game_phase === 'poker') && isAdmin && (
          <button onClick={startVoting} disabled={busy}
            className="w-full py-3 rounded-lg font-bold uppercase text-sm"
            style={{ background: '#b8860b', color: 'white' }}>
            עבור להצבעה
          </button>
        )}

        {/* Voting phase */}
        {room.game_phase === 'voting' && (
          <VotingPanel
            room={room} players={players} hands={hands} me={me}
            roundNumber={round.round_number} isAdmin={isAdmin}
            onReveal={revealResult}
            onChat={() => setChatOpen((o) => !o)}
            unreadCount={unreadCount}
          />
        )}

        {/* Result phase */}
        {room.game_phase === 'result' && (
          <ResultPanel
            room={room} players={players}
            roundNumber={round.round_number} isAdmin={isAdmin}
            onNextRound={nextRound}
          />
        )}

        {error && (
          <div className="text-red-400 text-xs text-center mt-1">{error}</div>
        )}
      </div>

      {/* ── TRAITOR ABILITIES — inline in bottom panel, handled in bottom section ── */}

      {/* Chat panel (the floating-bubble launcher was removed; chat is now opened
          from the action row's ChatButton, see ActionPanel.jsx + pre-action row) */}
      {chatOpen && (
        <div className="fixed bottom-20 left-5 z-50 w-72 bg-emerald-950 border-2 border-emerald-600 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: '380px' }}>
          <div className="flex justify-between items-center px-3 py-2 bg-emerald-900 border-b border-emerald-700">
            <span className="text-emerald-100 font-bold text-sm">💬 צ'אט</span>
            <button onClick={() => setChatOpen(false)} className="text-emerald-400 hover:text-white text-lg leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {messages.map((m) => {
              const author = players.find((p) => p.id === m.player_id)
              const mine = author?.user_id === userId
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
          <form onSubmit={sendChatMessage} className="flex gap-1 p-2 border-t border-emerald-700">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="הודעה..."
              className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-emerald-900 text-white border border-emerald-700 focus:outline-none"
            />
            <button type="submit" disabled={!chatInput.trim()}
              className="px-2 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs text-emerald-950 font-bold disabled:opacity-50">
              שלח
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
