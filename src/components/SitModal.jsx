import { useState } from 'react'

export default function SitModal({ seatNumber, currentName, onSit, onCancel, lockStack, defaultChips, isSpectator = false }) {
  const [name, setName] = useState(currentName || '')
  const [chips, setChips] = useState(defaultChips || 1000)

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSit(seatNumber, name.trim(), lockStack ? defaultChips : chips)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onCancel}>
      <div className="w-80 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: '#1e1e28', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="text-white font-bold text-lg">מושב {seatNumber}</div>
          <div className="text-white/40 text-xs">בחר שם וסכום כניסה</div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-white/60 text-xs uppercase tracking-wider block mb-1.5">
              שם שחקן
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="השם שלך"
              maxLength={16}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-white font-medium focus:outline-none"
              style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.15)' }}
            />
          </div>

          {/* Stack */}
          <div>
            <label className="text-white/60 text-xs uppercase tracking-wider block mb-1.5">
              סכום כניסה
            </label>
            {lockStack ? (
              <div className="px-3 py-2.5 rounded-lg font-bold"
                style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.08)', color: '#e8c44a' }}>
                {defaultChips} <span className="text-white/30 text-xs font-normal">(נקבע ע"י האדמין)</span>
              </div>
            ) : (
              <input
                type="number"
                value={chips}
                onChange={e => setChips(Math.max(1, parseInt(e.target.value) || 0))}
                min={1}
                max={100000}
                className="w-full px-3 py-2.5 rounded-lg text-white font-medium focus:outline-none"
                style={{ background: '#2a2a3a', border: '1px solid rgba(255,255,255,0.15)', color: '#e8c44a' }}
              />
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold"
              style={{ background: '#2a2a3a', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
              ביטול
            </button>
            <button type="submit" disabled={!name.trim()}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold"
              style={{ background: isSpectator ? '#b8860b' : '#2d7a3c', color: 'white' }}>
              {isSpectator ? 'בקש להצטרף' : 'שב במושב'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
