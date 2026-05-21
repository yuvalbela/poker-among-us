import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { RANK_CHAR, SUIT_SYMBOL } from '../lib/pokerLogic.js'

const LEVEL_LABELS = {
  1: 'רמה 1: ציצה אקראית',
  2: 'רמה 2: בחר שחקן + ראה קלף',
  3: 'רמה 3: ראה יד מלאה',
  4: 'רמה 4: יד מלאה + החלפת קלף',
}

function cardLabel(c) {
  if (!c) return '?'
  const r = RANK_CHAR[c.rank] || String(c.rank)
  return `${r}${SUIT_SYMBOL[c.suit]}`
}

export default function TraitorPanel({ roomId, roundId, players, hands = [], myPlayerId, holeCards, onReveal, floating = false, inline = false, settings = {} }) {
  const [state, setState] = useState(null)
  const [actions, setActions] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    // Reset state on every new round — RLS will return null if user is no longer traitor
    setState(null)
    setActions([])

    async function load() {
      const { data } = await supabase.from('traitor_state').select('*').eq('room_id', roomId).maybeSingle()
      if (!cancelled) setState(data || null)
    }
    load()

    const ch = supabase
      .channel(`traitor-state:${roomId}:${roundId ?? 'lobby'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'traitor_state', filter: `room_id=eq.${roomId}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [roomId, roundId])

  useEffect(() => {
    if (!roundId) { setActions([]); return }
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('traitor_actions').select('*').eq('round_id', roundId).order('created_at')
      if (!cancelled) setActions(data || [])
    }
    load()
    const ch = supabase
      .channel(`traitor-actions:${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'traitor_actions', filter: `round_id=eq.${roundId}` }, load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [roundId])

  // RLS makes traitor_state row visible only to the actual traitor — if state exists, I'm it.
  if (!state || state.current_traitor_player_id !== myPlayerId) return null

  // Compute effective level based on current round number vs. per-level thresholds from settings.
  // levelNRounds = "the round number where level N starts". Current round = rounds_survived + 1.
  const survived = state.rounds_survived ?? 0
  const currentRound = survived + 1
  const l2 = settings.enableAbility2 !== false ? (settings.level2Rounds ?? 2) : Infinity
  const l3 = settings.enableAbility3 !== false ? (settings.level3Rounds ?? 3) : Infinity
  const l4 = settings.enableAbility4 !== false ? (settings.level4Rounds ?? 4) : Infinity
  const effectiveLevel = currentRound >= l4 ? 4 : currentRound >= l3 ? 3 : currentRound >= l2 ? 2 : 1
  const ability1Enabled = settings.enableAbility1 !== false

  // Use settings-based level (effectiveLevel) — not the DB level which uses old uniform calculation
  const level = effectiveLevel
  const usedPeek = actions.some((a) => ['peek_random', 'peek_player'].includes(a.action_type))
  const usedView = actions.some((a) => a.action_type === 'view_hand')
  const usedSwap = actions.some((a) => a.action_type === 'swap_card')
  // Only players who have an ACTIVE/ALL_IN hand in current round (not folded, not left)
  const activeHandPlayerIds = new Set(
    hands.filter(h => h.status === 'active' || h.status === 'all_in').map(h => h.player_id)
  )
  const otherPlayers = players.filter(
    (p) => p.id !== myPlayerId && activeHandPlayerIds.has(p.id) && !p.left_game
  )

  // Inline mode: compact row of ability buttons embedded in bottom panel
  if (inline) {
    const abilityUsed = actions.some((a) =>
      ['peek_random','peek_player','view_hand','swap_card'].includes(a.action_type))
    const peekUsed = actions.some((a) => ['peek_random','peek_player'].includes(a.action_type))
    const viewUsed = actions.some((a) => a.action_type === 'view_hand')
    const swapUsed = actions.some((a) => a.action_type === 'swap_card')
    const lvl = effectiveLevel  // Use settings-based level, not DB level

    return (
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,100,100,0.2)' }}>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] font-bold" style={{ color: '#ef4444' }}>🕵️ רמה {lvl}</span>
          {abilityUsed && <span className="text-[9px] text-white/30">· השתמשת היום</span>}
          {error && <span className="text-[9px] text-red-400 mr-auto">{error}</span>}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {/* Level 1 — peek random */}
          {lvl >= 1 && lvl < 2 && ability1Enabled && (
            <button disabled={busy || peekUsed || !roundId}
              onClick={() => callRpc('traitor_peek_random', { p_round_id: roundId })}
              className="px-2 py-1.5 rounded text-xs font-bold flex-1"
              style={{ background: peekUsed ? '#3a1515' : '#7f1d1d', color: peekUsed ? '#666' : 'white', border: '1px solid #ef4444' }}>
              {peekUsed ? '✓ הצצת' : '👁 הצץ אקראי'}
            </button>
          )}
          {/* Level 2 — peek chosen */}
          {lvl >= 2 && lvl < 3 && (
            <>
              <select value={target} onChange={(e) => setTarget(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded text-xs"
                style={{ background: '#2a0a0a', color: 'white', border: '1px solid #7f1d1d' }}>
                <option value="">בחר...</option>
                {otherPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button disabled={busy || peekUsed || !target || !roundId}
                onClick={() => callRpc('traitor_peek_player', { p_round_id: roundId, p_target_player_id: target })}
                className="px-2 py-1.5 rounded text-xs font-bold"
                style={{ background: peekUsed ? '#3a1515' : '#7f1d1d', color: peekUsed ? '#666' : 'white', border: '1px solid #ef4444' }}>
                {peekUsed ? '✓' : '👁 הצץ'}
              </button>
            </>
          )}
          {/* Level 3 — view full hand */}
          {lvl >= 3 && lvl < 4 && (
            <>
              <select value={target} onChange={(e) => setTarget(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded text-xs"
                style={{ background: '#2a0a0a', color: 'white', border: '1px solid #7f1d1d' }}>
                <option value="">בחר...</option>
                {otherPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button disabled={busy || viewUsed || !target || !roundId}
                onClick={() => callRpc('traitor_view_hand', { p_round_id: roundId, p_target_player_id: target })}
                className="px-2 py-1.5 rounded text-xs font-bold"
                style={{ background: viewUsed ? '#3a1515' : '#7f1d1d', color: viewUsed ? '#666' : 'white', border: '1px solid #ef4444' }}>
                {viewUsed ? '✓ ראית' : '🃏 ראה יד'}
              </button>
            </>
          )}
          {/* Level 4 — view + swap */}
          {lvl >= 4 && (
            <>
              <select value={target} onChange={(e) => setTarget(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded text-xs"
                style={{ background: '#2a0a0a', color: 'white', border: '1px solid #7f1d1d' }}>
                <option value="">בחר...</option>
                {otherPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button disabled={busy || viewUsed || !target || !roundId}
                onClick={() => callRpc('traitor_view_hand', { p_round_id: roundId, p_target_player_id: target })}
                className="px-2 py-1.5 rounded text-xs font-bold"
                style={{ background: viewUsed ? '#3a1515' : '#7f1d1d', color: viewUsed ? '#666' : 'white', border: '1px solid #ef4444' }}>
                {viewUsed ? '✓' : '🃏'}
              </button>
              {holeCards && [0,1].map(i => (
                <button key={i} disabled={busy || swapUsed || !roundId}
                  onClick={() => callRpc('traitor_swap_card', { p_round_id: roundId, p_card_index: i })}
                  className="px-2 py-1.5 rounded text-xs font-bold"
                  style={{ background: swapUsed ? '#3a1515' : '#4c1d95', color: swapUsed ? '#666' : 'white', border: '1px solid #7c3aed' }}>
                  {swapUsed ? '✓' : `🔄 ${i+1}`}
                </button>
              ))}
            </>
          )}
        </div>
        {/* Last discovered card */}
        {actions.length > 0 && (
          <div className="mt-1 text-[10px] text-red-300/70 truncate">
            {actions.map((a, i) => {
              const nm = players.find(p => p.id === a.target_player_id)?.name
              if (a.payload?.card) return <span key={i} className="mr-2">{nm}: <b className="text-amber-400">{cardLabel(a.payload.card)}</b></span>
              if (a.payload?.cards) return <span key={i} className="mr-2">{nm}: <b className="text-amber-400">{a.payload.cards.map(cardLabel).join(' ')}</b></span>
              if (a.payload?.new) return <span key={i} className="mr-2">החלפת → <b className="text-amber-400">{cardLabel(a.payload.new)}</b></span>
              return null
            })}
          </div>
        )}
      </div>
    )
  }

  // Floating mode: render as a spy-icon button + slide-up panel
  if (floating) {
    return (
      <>
        {/* Floating spy button */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: '#7f1d1d', border: '2px solid #ef4444' }}
          title="יכולות בוגד"
        >
          🕵️
        </button>

        {/* Slide-up panel */}
        {open && (
          <div className="fixed bottom-20 right-5 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: '#1c0a0a', border: '2px solid #ef4444' }}>
            <div className="flex justify-between items-center px-4 py-2"
              style={{ background: '#7f1d1d' }}>
              <span className="text-red-100 font-bold text-sm">🕵️ אתה הבוגד — רמה {state.current_level}</span>
              <button onClick={() => setOpen(false)} className="text-red-200 hover:text-white text-lg">×</button>
            </div>
            <div className="p-3">
              {renderContent()}
            </div>
          </div>
        )}
      </>
    )
  }

  async function callRpc(name, args = {}) {
    setError('')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw error
      // Trigger card reveal on table
      if (onReveal && data) {
        if (data.card) onReveal(args.p_target_player_id ?? data.target_player_id, Math.random() < 0.5 ? 0 : 1, data.card)
        if (data.cards) {
          const cards = data.cards
          cards.forEach((c, i) => onReveal(args.p_target_player_id, i, c))
        }
        if (data.new) onReveal(myPlayerId, args.p_card_index ?? 0, data.new)
      }
    } catch (e) {
      setError(e.message || 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  function renderContent() {
    return <div className="space-y-3">
      <div className="flex justify-between items-center text-xs">
        <span className="text-red-200/70">{LEVEL_LABELS[level]}</span>
        <span className="text-red-300">שרדת: <b>{state.rounds_survived}</b></span>
      </div>

      {!roundId && (
        <div className="text-red-100/70 text-sm">היכולות שלך יהיו זמינות בסיבוב הבא.</div>
      )}

      {roundId && level >= 1 && level < 2 && !usedPeek && (
        <button
          onClick={() => callRpc('traitor_peek_random', { p_round_id: roundId })}
          disabled={busy}
          className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50"
        >
          הצץ בקלף אקראי של שחקן אקראי
        </button>
      )}

      {roundId && level >= 2 && level < 3 && !usedPeek && (
        <div className="space-y-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full px-2 py-2 rounded-lg bg-red-900 text-white border border-red-700"
          >
            <option value="">בחר יעד...</option>
            {otherPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => callRpc('traitor_peek_player', { p_round_id: roundId, p_target_player_id: target })}
            disabled={busy || !target}
            className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50"
          >
            הצץ בקלף שלו
          </button>
        </div>
      )}

      {roundId && level >= 3 && (
        <div className="space-y-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full px-2 py-2 rounded-lg bg-red-900 text-white border border-red-700"
          >
            <option value="">בחר יעד...</option>
            {otherPlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => callRpc('traitor_view_hand', { p_round_id: roundId, p_target_player_id: target })}
            disabled={busy || !target || usedView}
            className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50"
          >
            {usedView ? 'כבר ראית יד בסיבוב זה' : 'ראה את היד שלו'}
          </button>
        </div>
      )}

      {roundId && level >= 4 && holeCards && (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => (
            <button
              key={i}
              onClick={() => callRpc('traitor_swap_card', { p_round_id: roundId, p_card_index: i })}
              disabled={busy || usedSwap}
              className="py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold disabled:opacity-50"
            >
              {usedSwap ? 'החלפת השתמשה' : `החלף קלף ${i + 1} (${cardLabel(holeCards[i])})`}
            </button>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="bg-red-950/60 border border-red-800 rounded p-2 space-y-1">
          <div className="text-red-200 text-xs font-bold">מה גילית הסיבוב:</div>
          {actions.map((a) => {
            const targetName = players.find((p) => p.id === a.target_player_id)?.name
            if (a.action_type === 'peek_random' || a.action_type === 'peek_player') {
              return (
                <div key={a.id} className="text-sm text-red-100">
                  • קלף של <b>{targetName}</b>: <span className="text-amber-300 font-mono">{cardLabel(a.payload?.card)}</span>
                </div>
              )
            }
            if (a.action_type === 'view_hand') {
              return (
                <div key={a.id} className="text-sm text-red-100">
                  • יד של <b>{targetName}</b>: <span className="text-amber-300 font-mono">{(a.payload?.cards || []).map(cardLabel).join(' ')}</span>
                </div>
              )
            }
            if (a.action_type === 'swap_card') {
              return (
                <div key={a.id} className="text-sm text-red-100">
                  • החלפת קלף: {cardLabel(a.payload?.old)} → <span className="text-amber-300 font-mono">{cardLabel(a.payload?.new)}</span>
                </div>
              )
            }
            return null
          })}
        </div>
      )}

      {error && <div className="text-red-300 text-xs">{error}</div>}
    </div>
  }

  return (
    <div className="bg-red-950/80 border-2 border-red-500 rounded-xl p-4 mb-4">
      <div className="text-red-300 font-bold mb-2">🕵️ אתה הבוגד — רמה {state.current_level}</div>
      {renderContent()}
    </div>
  )
}
