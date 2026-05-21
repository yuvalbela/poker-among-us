import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

/**
 * useTraitor — central hook for traitor state, level, and ability handlers.
 *
 * Subscribes to traitor_state (my secret identity + rounds_survived) and
 * traitor_actions (what I've already used this round). Computes effective
 * level from rooms.settings + currentRound (= rounds_survived + 1).
 *
 * Returns:
 *   isTraitor:      bool — am I the traitor right now?
 *   effectiveLevel: 1..4 — what tier of abilities I have access to
 *   roundsSurvived: int
 *   actions:        array of traitor_actions rows for this round
 *   usedPeek/View/Swap: bools — has this ability fired this round?
 *   busy, error:    UI state
 *   peekRandom():           call level-1 RPC
 *   peekCard(playerId, idx):call level-2 RPC (idx 0|1)
 *   viewHand(playerId):     call level-3 RPC
 *   swapCard(idx):          call level-4 RPC (idx 0|1)
 */
export function useTraitor({ roomId, roundId, settings = {}, myPlayerId, onReveal }) {
  const [state, setState] = useState(null)
  const [actions, setActions] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // --- traitor_state subscription (per room) ---
  useEffect(() => {
    if (!roomId) return
    let cancelled = false
    setState(null)
    setActions([])

    async function load() {
      const { data } = await supabase
        .from('traitor_state')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle()
      if (!cancelled) setState(data || null)
    }
    load()

    const ch = supabase
      .channel(`use-traitor-state:${roomId}:${roundId ?? 'lobby'}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'traitor_state', filter: `room_id=eq.${roomId}` },
          load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [roomId, roundId])

  // --- traitor_actions subscription (per round) ---
  useEffect(() => {
    if (!roundId) { setActions([]); return }
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('traitor_actions')
        .select('*')
        .eq('round_id', roundId)
        .order('created_at')
      if (!cancelled) setActions(data || [])
    }
    load()
    const ch = supabase
      .channel(`use-traitor-actions:${roundId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'traitor_actions', filter: `round_id=eq.${roundId}` },
          load)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [roundId])

  // --- derived values ---
  const isTraitor = !!(state && state.current_traitor_player_id === myPlayerId)
  const roundsSurvived = state?.rounds_survived ?? 0

  const effectiveLevel = useMemo(() => {
    const currentRound = roundsSurvived + 1
    const inf = 999999
    const l2 = settings.enableAbility2 !== false ? (settings.level2Rounds ?? 2) : inf
    const l3 = settings.enableAbility3 !== false ? (settings.level3Rounds ?? 3) : inf
    const l4 = settings.enableAbility4 !== false ? (settings.level4Rounds ?? 4) : inf
    if (currentRound >= l4) return 4
    if (currentRound >= l3) return 3
    if (currentRound >= l2) return 2
    return 1
  }, [roundsSurvived, settings.enableAbility2, settings.enableAbility3, settings.enableAbility4,
      settings.level2Rounds, settings.level3Rounds, settings.level4Rounds])

  const usedPeek = actions.some((a) => a.action_type === 'peek_random' || a.action_type === 'peek_player')
  const usedView = actions.some((a) => a.action_type === 'view_hand')
  const usedSwap = actions.some((a) => a.action_type === 'swap_card')

  // --- RPC caller helper ---
  const callRpc = useCallback(async (name, args, revealMapper) => {
    setError('')
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw error
      if (onReveal && data && revealMapper) revealMapper(data)
      return data
    } catch (e) {
      setError(e.message || 'שגיאה')
      return null
    } finally {
      setBusy(false)
    }
  }, [onReveal])

  // --- public action handlers ---
  const peekRandom = useCallback(async () => {
    if (!roundId) return
    return callRpc('traitor_peek_random', { p_round_id: roundId }, (data) => {
      if (data.card && data.target_player_id) {
        // server-side random card index — UI picks one to reveal
        onReveal(data.target_player_id, Math.random() < 0.5 ? 0 : 1, data.card)
      }
    })
  }, [roundId, callRpc, onReveal])

  const peekCard = useCallback(async (targetPlayerId, cardIndex) => {
    if (!roundId || !targetPlayerId) return
    return callRpc('traitor_peek_player',
      { p_round_id: roundId, p_target_player_id: targetPlayerId },
      (data) => { if (data.card) onReveal(targetPlayerId, cardIndex, data.card) })
  }, [roundId, callRpc, onReveal])

  const viewHand = useCallback(async (targetPlayerId) => {
    if (!roundId || !targetPlayerId) return
    return callRpc('traitor_view_hand',
      { p_round_id: roundId, p_target_player_id: targetPlayerId },
      (data) => {
        if (Array.isArray(data.cards)) {
          data.cards.forEach((c, i) => onReveal(targetPlayerId, i, c))
        }
      })
  }, [roundId, callRpc, onReveal])

  const swapCard = useCallback(async (cardIndex) => {
    if (!roundId) return
    return callRpc('traitor_swap_card',
      { p_round_id: roundId, p_card_index: cardIndex },
      (data) => { if (data.new) onReveal(myPlayerId, cardIndex, data.new) })
  }, [roundId, callRpc, onReveal, myPlayerId])

  return {
    isTraitor,
    effectiveLevel,
    roundsSurvived,
    state,
    actions,
    usedPeek, usedView, usedSwap,
    busy, error,
    peekRandom, peekCard, viewHand, swapCard,
  }
}
