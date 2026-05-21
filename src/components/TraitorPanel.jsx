import { RANK_CHAR, SUIT_SYMBOL } from '../lib/pokerLogic.js'

function cardLabel(c) {
  if (!c) return '?'
  const r = RANK_CHAR[c.rank] || String(c.rank)
  return `${r}${SUIT_SYMBOL[c.suit]}`
}

// Per-level instruction the player sees in the status bar.
function instructionFor(level, used) {
  if (level === 1) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על "הצץ אקראי" כדי להציץ בקלף אקראי'
  if (level === 2) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על קלף של שחקן אחר כדי להציץ בו'
  if (level === 3) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על שחקן אחר כדי לראות את היד שלו'
  if (level === 4) return 'לחץ על שחקן לראות יד · על קלף שלך להחליף'
  return ''
}

export default function TraitorPanel({ traitor, players }) {
  if (!traitor?.isTraitor) return null

  const { effectiveLevel: lvl, usedPeek, usedView, usedSwap, actions, busy, error,
          peekRandom } = traitor

  const used = (lvl === 1 || lvl === 2) ? usedPeek
            : lvl === 3 ? usedView
            : lvl === 4 ? (usedView && usedSwap) : false

  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,100,100,0.2)' }}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[11px] font-bold" style={{ color: '#ef4444' }}>🕵️ רמה {lvl}</span>
        <span className="text-[10px] text-white/40 mr-1">· {instructionFor(lvl, used)}</span>
        {error && <span className="text-[9px] text-red-400 mr-auto">{error}</span>}
      </div>

      {/* Level 1 — single button (the only level still using a button) */}
      {lvl === 1 && (
        <button
          disabled={busy || usedPeek}
          onClick={peekRandom}
          className="w-full px-2 py-1.5 rounded text-xs font-bold"
          style={{
            background: usedPeek ? '#3a1515' : '#7f1d1d',
            color: usedPeek ? '#666' : 'white',
            border: '1px solid #ef4444',
          }}
        >
          {usedPeek ? '✓ הצצת' : '👁 הצץ אקראי'}
        </button>
      )}

      {/* History — what I discovered this round */}
      {actions.length > 0 && (
        <div className="mt-1 text-[10px] text-red-300/70 truncate">
          {actions.map((a, i) => {
            const nm = players.find((p) => p.id === a.target_player_id)?.name
            if (a.payload?.card)
              return <span key={i} className="mr-2">{nm}: <b className="text-amber-400">{cardLabel(a.payload.card)}</b></span>
            if (a.payload?.cards)
              return <span key={i} className="mr-2">{nm}: <b className="text-amber-400">{a.payload.cards.map(cardLabel).join(' ')}</b></span>
            if (a.payload?.new)
              return <span key={i} className="mr-2">החלפת → <b className="text-amber-400">{cardLabel(a.payload.new)}</b></span>
            return null
          })}
        </div>
      )}
    </div>
  )
}
