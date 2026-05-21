import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

const DEFAULTS = {
  smallBlind: 10,
  bigBlind: 20,
  startingChips: 1000,
  lockStack: false,
  level2Rounds: 2,
  level3Rounds: 3,
  level4Rounds: 4,
  enableAbility1: true,
  enableAbility2: true,
  enableAbility3: true,
  enableAbility4: true,
  votingTime: 60,
  playerTimerSeconds: 0,
  traitorLoseOnCaught: false,
  traitorPenaltyAmount: 200,
}

// Slider with manual number input (allows values outside range)
function Slider({ label, hint, value, min, max, step = 1, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-emerald-50 text-sm font-bold">{label}</div>
          {hint && <div className="text-emerald-100/50 text-xs">{hint}</div>}
        </div>
        <input
          type="number"
          value={value}
          min={1}
          onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-14 text-center font-mono font-bold text-sm rounded px-1 py-0.5 focus:outline-none"
          style={{ background: '#1a2a1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fbbf24' }}
        />
      </div>
      <input
        type="range" min={min} max={max} step={step} value={Math.min(value, max)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-400"
      />
      <div className="flex justify-between text-emerald-100/30 text-xs">
        <span>{min}</span><span>{max}+</span>
      </div>
    </div>
  )
}

// Toggle: ON = circle LEFT (green), OFF = circle RIGHT (gray)
function Toggle({ label, hint, value, onChange, compact = false }) {
  const btn = (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative', width: '44px', height: '24px',
        borderRadius: '999px',
        background: value ? '#22c55e' : '#4b5563',
        transition: 'background 0.2s',
        border: 'none', cursor: 'pointer', flexShrink: 0,
      }}>
      <span style={{
        position: 'absolute',
        top: '2px',
        left: value ? '2px' : '22px',   // ON=left, OFF=right
        width: '20px', height: '20px',
        borderRadius: '50%',
        background: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        transition: 'left 0.2s',
      }} />
    </button>
  )

  if (compact) return btn

  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-emerald-50 text-sm font-bold">{label}</div>
        {hint && <div className="text-emerald-100/50 text-xs">{hint}</div>}
      </div>
      {btn}
    </div>
  )
}

// Combined ability row: [toggle] [label] [rounds input+slider]
function AbilityRow({ label, enabled, rounds, onToggle, onRounds, maxRounds = 20 }) {
  return (
    <div className="space-y-1.5 py-1.5 border-b border-emerald-800/50 last:border-0">
      <div className="flex items-center gap-2">
        <Toggle value={enabled} onChange={onToggle} compact />
        <span className={`text-sm font-bold flex-1 ${enabled ? 'text-emerald-50' : 'text-emerald-100/40'}`}>{label}</span>
        {enabled && (
          <div className="flex items-center gap-1">
            <input
              type="number" value={rounds} min={1}
              onChange={(e) => onRounds(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 text-center font-mono font-bold text-sm rounded px-1 py-0.5 focus:outline-none"
              style={{ background: '#1a2a1a', border: '1px solid rgba(255,255,255,0.15)', color: '#fbbf24' }}
            />
            <span className="text-emerald-100/40 text-xs">סיבובים</span>
          </div>
        )}
      </div>
      {enabled && (
        <input type="range" min={1} max={maxRounds} value={Math.min(rounds, maxRounds)}
          onChange={(e) => onRounds(Number(e.target.value))}
          className="w-full accent-amber-400 h-1"
        />
      )}
    </div>
  )
}

export default function SettingsPanel({ room, onClose }) {
  const [s, setS] = useState({ ...DEFAULTS, ...(room?.settings || {}) })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(key, val) { setS((prev) => ({ ...prev, [key]: val })) }

  async function save() {
    setSaving(true)
    await supabase.from('rooms').update({ settings: s }).eq('id', room.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-sm bg-emerald-950 border-2 border-emerald-600 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 bg-emerald-900 border-b border-emerald-700">
          <span className="text-amber-300 font-bold">⚙️ הגדרות משחק</span>
          <button onClick={onClose} className="text-emerald-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Blinds */}
          <div className="text-emerald-100/60 text-xs font-bold uppercase tracking-wider">בלינדים</div>
          <Slider label="Small Blind" value={s.smallBlind} min={5} max={100} step={5} onChange={(v) => set('smallBlind', v)} />
          <Slider label="Big Blind" value={s.bigBlind} min={10} max={200} step={10} onChange={(v) => set('bigBlind', v)} />
          <Slider label="צ'יפים התחלתיים" value={s.startingChips} min={50} max={5000} step={50} onChange={(v) => set('startingChips', v)} />
          <Toggle label="נעל סכום כניסה" hint="שחקנים לא יוכלו לבחור כמה להכניס" value={s.lockStack ?? false} onChange={(v) => set('lockStack', v)} />

          {/* Traitor */}
          <div className="border-t border-emerald-800 pt-3 text-emerald-100/60 text-xs font-bold uppercase tracking-wider">בוגד</div>
          <Toggle label="בוגד מפסיד אם נתפס" hint="ניכוי כספי בתפיסה" value={s.traitorLoseOnCaught ?? false} onChange={(v) => set('traitorLoseOnCaught', v)} />
          {s.traitorLoseOnCaught && (
            <Slider label="קנס לבוגד שנתפס" value={s.traitorPenaltyAmount} min={50} max={500} step={50} onChange={(v) => set('traitorPenaltyAmount', v)} />
          )}

          {/* Traitor abilities */}
          <div className="border-t border-emerald-800 pt-3 text-emerald-100/60 text-xs font-bold uppercase tracking-wider">
            יכולות הבוגד
          </div>
          <div className="text-emerald-100/40 text-xs -mt-2">פעיל + כמה סיבובים להפעלה</div>

          <AbilityRow
            label="יכולת 1 — הצצה אקראית"
            enabled={s.enableAbility1 ?? true}
            rounds={1}
            onToggle={(v) => set('enableAbility1', v)}
            onRounds={() => {}}
          />
          <AbilityRow
            label="יכולת 2 — הצצה בחירה"
            enabled={s.enableAbility2 ?? true}
            rounds={s.level2Rounds ?? 2}
            onToggle={(v) => set('enableAbility2', v)}
            onRounds={(v) => set('level2Rounds', v)}
            maxRounds={20}
          />
          <AbilityRow
            label="יכולת 3 — ראה יד מלאה"
            enabled={s.enableAbility3 ?? true}
            rounds={s.level3Rounds ?? 3}
            onToggle={(v) => set('enableAbility3', v)}
            onRounds={(v) => set('level3Rounds', v)}
            maxRounds={30}
          />
          <AbilityRow
            label="יכולת 4 — החלף קלף"
            enabled={s.enableAbility4 ?? true}
            rounds={s.level4Rounds ?? 4}
            onToggle={(v) => set('enableAbility4', v)}
            onRounds={(v) => set('level4Rounds', v)}
            maxRounds={40}
          />

          {/* Timers */}
          <div className="border-t border-emerald-800 pt-3 text-emerald-100/60 text-xs font-bold uppercase tracking-wider">טיימרים</div>
          <Slider label="זמן הצבעה (שניות)" value={s.votingTime} min={15} max={180} step={15} onChange={(v) => set('votingTime', v)} />
          <Slider label="טיימר לתור שחקן (שניות)" hint="0 = כבוי" value={s.playerTimerSeconds} min={0} max={120} step={5} onChange={(v) => set('playerTimerSeconds', v)} />
        </div>

        <div className="px-4 py-3 border-t border-emerald-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm">ביטול</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-emerald-950 font-bold text-sm disabled:opacity-50">
            {saved ? '✓ נשמר' : saving ? '...' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}
