// Per-level instruction the player sees in the status bar.
function instructionFor(level, used) {
  if (level === 1) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על "הצץ אקראי" כדי להציץ בקלף אקראי'
  if (level === 2) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על קלף של שחקן אחר כדי להציץ בו'
  if (level === 3) return used ? 'השתמשת ביכולת הסיבוב' : 'לחץ על שחקן אחר כדי לראות את היד שלו'
  if (level === 4) return 'לחץ על שחקן לראות יד · על קלף שלך להחליף'
  return ''
}

export default function TraitorPanel({ traitor }) {
  if (!traitor?.isTraitor) return null

  const { effectiveLevel: lvl, usedPeek, usedView, usedSwap, busy, error,
          peekRandom } = traitor

  const used = (lvl === 1 || lvl === 2) ? usedPeek
            : lvl === 3 ? usedView
            : lvl === 4 ? (usedView && usedSwap) : false

  return (
    <div style={{ borderTop: '1px solid rgba(255,100,100,0.2)', paddingTop: '4px' }}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: '#ef4444' }}>🕵️ רמה {lvl}</span>
        <span className="text-[10px] text-white/40 truncate">{instructionFor(lvl, used)}</span>
        {/* Level 1 — inline compact button */}
        {lvl === 1 && (
          <button
            disabled={busy || usedPeek}
            onClick={peekRandom}
            className="px-2 py-1 rounded text-[11px] font-bold mr-auto whitespace-nowrap"
            style={{
              background: usedPeek ? '#3a1515' : '#7f1d1d',
              color: usedPeek ? '#666' : 'white',
              border: '1px solid #ef4444',
              flexShrink: 0,
            }}
          >
            {usedPeek ? '✓ הצצת' : '👁 הצץ אקראי'}
          </button>
        )}
        {error && <span className="text-[9px] text-red-400 mr-auto">{error}</span>}
      </div>

      {/* No persistent history row — revealed cards display via the flip animation
          on the table (duration controlled by settings.revealDurationSeconds). */}
    </div>
  )
}
