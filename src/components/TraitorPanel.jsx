// Per-level instruction the player sees in the status bar.
function instructionFor(level, used, roundOver) {
  if (roundOver) return 'הסיבוב נגמר — היכולת תחזור בסיבוב הבא'
  if (level === 1) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על "הצץ אקראי" כדי להציץ בקלף אקראי'
  if (level === 2) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על קלף של שחקן אחר כדי להציץ בו'
  if (level === 3) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על שחקן אחר כדי לראות את היד שלו'
  if (level === 4) return 'לחץ על שחקן לראות יד · על קלף שלך להחליף'
  return ''
}

export default function TraitorPanel({ traitor, roundOver = false }) {
  if (!traitor?.isTraitor) return null

  const { effectiveLevel: lvl, usedPeek, usedView, usedSwap, busy, error,
          peekRandom } = traitor

  const used = (lvl === 1 || lvl === 2) ? usedPeek
            : lvl === 3 ? usedView
            : lvl === 4 ? (usedView && usedSwap) : false

  // Level-1 button: disabled when ability already used, busy, OR round is over.
  const peekDisabled = busy || usedPeek || roundOver

  return (
    <div style={{ borderTop: '1px solid rgba(255,100,100,0.2)', paddingTop: '4px' }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: '#ef4444' }}>🕵️ רמה {lvl}</span>
        <span className="text-[10px] text-white/40 truncate flex-1">{instructionFor(lvl, used, roundOver)}</span>
        {/* Level 1 — inline compact button (always rendered at the end so it doesn't jump) */}
        {lvl === 1 && (
          <button
            disabled={peekDisabled}
            onClick={peekRandom}
            className="px-2 py-1 rounded text-[11px] font-bold whitespace-nowrap"
            style={{
              background: peekDisabled ? '#3a1515' : '#7f1d1d',
              color: peekDisabled ? '#666' : 'white',
              border: '1px solid #ef4444',
              flexShrink: 0,
              opacity: peekDisabled ? 0.6 : 1,
              cursor: peekDisabled ? 'default' : 'pointer',
            }}
          >
            {usedPeek ? '✓ הצצת' : '👁 הצץ אקראי'}
          </button>
        )}
      </div>
      {/* Error row — sits below to avoid pushing the action button around */}
      {error && !roundOver && (
        <div className="text-[9px] text-red-400 mt-0.5">{error}</div>
      )}
    </div>
  )
}
