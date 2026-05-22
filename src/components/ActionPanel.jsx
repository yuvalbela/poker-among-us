import { useState } from 'react'
import { HAND_CATEGORIES } from '../lib/pokerLogic.js'
import { bestHandFor } from '../lib/pokerLogic.js'

// Small chat button used inline in action rows (replaces the floating bubble).
function ChatButton({ onChat, unreadCount }) {
  return (
    <button
      onClick={onChat}
      className="relative rounded-lg flex items-center justify-center transition-all active:scale-95"
      style={{
        background: '#0e4d33', color: 'white',
        border: '1px solid rgba(255,255,255,0.15)',
        width: '46px', flexShrink: 0,
      }}
      aria-label="פתח צ'אט"
      title="צ'אט"
    >
      💬
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}

export default function ActionPanel({
  round,
  myHand,
  myCards,
  me,
  turnSecondsLeft,
  onAction,
  busy,
  onChat,        // open chat overlay
  unreadCount,   // unread message count for chat badge
}) {
  const [showBet, setShowBet] = useState(false)
  const [betAmt, setBetAmt] = useState(0)

  if (!myHand || !round) return null

  const callAmount = Math.max(0, round.current_bet - myHand.current_bet)
  const chipsLeft = myHand.chips_at_start - myHand.total_bet_in_round
  const pot = round.pot
  const minRaise = round.current_bet + round.big_blind
  const maxRaise = myHand.current_bet + chipsLeft

  // Hand eval
  const handEval = myCards && round.community_cards?.length >= 3
    ? bestHandFor(myCards, round.community_cards) : null

  // Presets for bet panel
  const presets = [
    { label: callAmount > 0 ? 'MIN RAISE' : 'MIN BET', value: minRaise },
    { label: '1/2 POT', value: Math.floor(pot / 2) },
    { label: '3/4 POT', value: Math.floor(pot * 0.75) },
    { label: 'POT', value: pot },
    { label: 'ALL IN', value: maxRaise },
  ].map(p => ({ ...p, value: Math.min(Math.max(p.value, minRaise), maxRaise) }))

  function initBet() {
    setBetAmt(minRaise)
    setShowBet(true)
  }

  function confirmBet() {
    setShowBet(false)
    if (betAmt >= maxRaise) onAction('all_in')
    else onAction('raise', betAmt)
  }

  const btnBase = 'flex-1 py-2 rounded-lg font-bold uppercase tracking-wide text-sm transition-all active:scale-95 disabled:opacity-40'

  // ── BET PANEL ────────────────────────────────────────────
  if (showBet) {
    const pct = maxRaise > minRaise ? (betAmt - minRaise) / (maxRaise - minRaise) : 0
    return (
      <div className="rounded-xl overflow-hidden"
        style={{ background: '#1e1e28', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Top info row */}
        <div className="flex items-center px-3 pt-3 pb-2 gap-3">
          <div>
            <div className="text-xs text-white/40 uppercase tracking-wider">Your bet</div>
            <div className="text-3xl font-bold text-white leading-none">
              {betAmt}
              <span className="text-xs text-amber-400 ml-1">
                {(betAmt / round.big_blind).toFixed(1)}BB
              </span>
            </div>
          </div>
          <div className="mr-auto" />
          <div className="rounded-lg px-3 py-1.5 text-center"
            style={{ background: '#2a2a3a', minWidth: '80px' }}>
            <div className="text-white text-sm font-bold">{me?.name}</div>
            <div className="text-amber-400 text-xs font-bold">{me?.chips}</div>
          </div>
          {handEval && (
            <div className="rounded px-2 py-1 text-xs font-bold uppercase"
              style={{ background: '#c0392b', color: 'white' }}>
              {HAND_CATEGORIES[handEval.category]}
            </div>
          )}
        </div>

        {/* Preset buttons */}
        <div className="flex gap-1 px-3 pb-2">
          {presets.map((p) => (
            <button key={p.label} onClick={() => setBetAmt(p.value)}
              disabled={busy}
              className="flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all active:scale-95"
              style={{
                background: betAmt === p.value ? '#3d8b40' : '#2a2a3a',
                color: betAmt === p.value ? 'white' : 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Slider */}
        <div className="flex items-center gap-2 px-3 pb-3">
          <button onClick={() => setBetAmt(Math.max(minRaise, betAmt - round.big_blind))}
            className="w-8 h-8 rounded-full font-bold text-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: '#2a2a3a', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
            −
          </button>
          <input type="range" min={minRaise} max={maxRaise} step={round.big_blind || 20}
            value={betAmt} onChange={(e) => setBetAmt(Number(e.target.value))}
            className="flex-1 h-2 rounded-full accent-amber-400 cursor-pointer" />
          <button onClick={() => setBetAmt(Math.min(maxRaise, betAmt + round.big_blind))}
            className="w-8 h-8 rounded-full font-bold text-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: '#2a2a3a', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
            +
          </button>
        </div>

        {/* Back + Bet */}
        <div className="flex gap-2 px-3 pb-3">
          <button onClick={() => setShowBet(false)}
            className="flex-1 py-3 rounded-lg font-bold uppercase text-sm"
            style={{ background: '#2a2a3a', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>
            BACK
          </button>
          <button onClick={confirmBet} disabled={busy}
            className="flex-1 py-3 rounded-lg font-bold uppercase text-sm transition-all active:scale-95"
            style={{ background: '#3d8b40', color: 'white' }}>
            BET {betAmt}
          </button>
        </div>
      </div>
    )
  }

  // ── DEFAULT ACTION BAR ────────────────────────────────────
  return (
    <div className="space-y-1">
      {/* YOUR TURN indicator + timer — tight single-line */}
      <div className="flex items-center justify-end gap-2 px-1" style={{ minHeight: '14px' }}>
        <span className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: '#4caf50' }}>● YOUR TURN</span>
        {turnSecondsLeft !== null && (
          <span className={`font-mono font-bold text-xs ${turnSecondsLeft <= 5 ? 'text-red-400' : 'text-white/60'}`}>
            {turnSecondsLeft}s
          </span>
        )}
      </div>

      {/* Action buttons.
          Visual order RIGHT→LEFT (page is dir=rtl, so first JSX child = right):
          FOLD · CHECK · RAISE/CALL · CHAT */}
      <div className="flex gap-2" style={{ minHeight: '44px' }}>
        {/* FOLD — rightmost */}
        <button onClick={() => onAction('fold')} disabled={busy}
          className={btnBase}
          style={{ background: 'transparent', color: '#e74c3c', border: '2px solid #e74c3c' }}>
          FOLD
        </button>

        {/* CHECK (when no call needed) */}
        {callAmount === 0 && (
          <button onClick={() => onAction('check')} disabled={busy}
            className={btnBase}
            style={{ background: '#2a2a3a', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}>
            CHECK
          </button>
        )}

        {/* RAISE (only when there's a call AND we have chips beyond it) */}
        {callAmount > 0 && chipsLeft > callAmount && (
          <button onClick={initBet} disabled={busy}
            className={btnBase}
            style={{ background: 'transparent', color: '#4caf50', border: '2px solid #3d8b40' }}>
            RAISE
          </button>
        )}

        {/* CALL / BET — leftmost of the action triplet.
            When the call amount exceeds the chips we actually have, the action
            becomes an all-in for whatever's left. Show that on the button so
            the player isn't misled into thinking they're paying the full call. */}
        {callAmount > 0 ? (
          (() => {
            const isAllInCall = callAmount >= chipsLeft && chipsLeft > 0
            return (
              <button onClick={() => onAction('call')} disabled={busy || chipsLeft <= 0}
                className={btnBase}
                style={{
                  background: isAllInCall ? '#9333ea' : '#2d7a3c',
                  color: 'white', border: 'none',
                }}>
                {isAllInCall ? `ALL-IN ${chipsLeft}` : `CALL ${callAmount}`}
              </button>
            )
          })()
        ) : (
          <button onClick={initBet} disabled={busy || chipsLeft <= 0}
            className={btnBase}
            style={{ background: '#2d7a3c', color: 'white', border: 'none' }}>
            BET {minRaise}
          </button>
        )}

        {/* CHAT — leftmost */}
        {onChat && <ChatButton onChat={onChat} unreadCount={unreadCount} />}
      </div>
    </div>
  )
}

// Re-export for other consumers (Game.jsx pre-action row + showdown rows).
export { ChatButton }
