/**
 * How-to-play modal — explains the game flow + the traitor's per-level abilities.
 * Triggered from Home.jsx via a "?" button.
 */
export default function HowToPlayModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/70"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{
          background: 'linear-gradient(180deg, #0f1a14 0%, #0a0d12 100%)',
          border: '1px solid rgba(234,179,8,0.35)',
        }}
      >
        <div className="sticky top-0 px-4 py-3 flex items-center justify-between"
          style={{
            background: 'linear-gradient(180deg, rgba(234,179,8,0.18), rgba(234,179,8,0.05))',
            borderBottom: '1px solid rgba(234,179,8,0.3)',
            backdropFilter: 'blur(6px)',
          }}>
          <span className="text-amber-300 font-bold">איך משחקים?</span>
          <button onClick={onClose}
            className="text-amber-300/70 hover:text-amber-200 text-lg leading-none">×</button>
        </div>

        <div className="p-4 space-y-4 text-sm text-emerald-50/90">
          <section>
            <h3 className="font-bold text-amber-200 mb-1">🎲 המשחק הבסיסי</h3>
            <p className="text-emerald-100/80 leading-relaxed">
              פוקר טקסס הולדם רגיל. כל סיבוב: בלינדים, חלוקת שני קלפים לכל שחקן,
              שלוש שכבות הימור (Flop, Turn, River), והמנצח לוקח את הקופה.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-red-300 mb-1">🕵️ אבל יש בוגד</h3>
            <p className="text-emerald-100/80 leading-relaxed">
              שחקן אחד נבחר באקראי בכל משחק להיות הבוגד — בסוד. אף אחד לא יודע מי,
              גם לא האדמין. ככל שהבוגד שורד יותר סיבובים, הוא מקבל יכולות חזקות יותר.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-red-300 mb-2">🎴 יכולות הבוגד</h3>
            <div className="space-y-1.5">
              <Ability lvl="1" title="הצץ אקראי">
                כפתור בתחתית — קלף אחד נבחר אקראית מקלפי שחקן אקראי.
              </Ability>
              <Ability lvl="2" title="הצצה ממוקדת">
                לחיצה על קלף ספציפי של שחקן מסוים — הוא נחשף לבוגד.
              </Ability>
              <Ability lvl="3" title="ראה יד מלאה">
                לחיצה על שחקן — שתי הקלפים שלו נחשפים לבוגד.
              </Ability>
              <Ability lvl="4" title="ראה + החלף קלף">
                גם רואה יד מלאה וגם יכול להחליף אחד מהקלפים שלו בקלף מהדק.
              </Ability>
            </div>
            <p className="text-emerald-100/60 text-xs mt-2">
              היכולות "חד-פעמיות" בכל סיבוב. הקלף שמתגלה רואים רק על המסך של הבוגד.
              משך התצוגה ניתן לכוונון בהגדרות (ברירת מחדל: 5 שניות).
            </p>
          </section>

          <section>
            <h3 className="font-bold text-yellow-300 mb-1">🗳️ אחרי כל סיבוב — הצבעה</h3>
            <p className="text-emerald-100/80 leading-relaxed">
              כל השחקנים מצביעים מי הבוגד לדעתם. ההצבעה גלויה.
              <br />
              <span className="text-green-300">✅ תפסתם:</span> הבוגד נחשף, בוגד חדש ייבחר בסיבוב הבא.
              <br />
              <span className="text-red-300">❌ פספסתם:</span> הבוגד שורד ומקבל רמה גבוהה יותר.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-amber-200 mb-1">💡 טיפים</h3>
            <ul className="list-disc list-inside space-y-1 text-emerald-100/80 text-xs">
              <li>הבוגד יכול לבלף יותר טוב כשהוא יודע את הקלפים של האחרים.</li>
              <li>שיגעון לראות מי "תמיד שיחק נכון" — אולי זה הוא.</li>
              <li>פעולות הבוגד מתעדכנות רק על המסך שלו — אין שום סימן גלוי לאחרים.</li>
            </ul>
          </section>
        </div>

        <div className="px-4 py-3 sticky bottom-0"
          style={{ background: 'rgba(15,26,20,0.95)', borderTop: '1px solid rgba(234,179,8,0.2)' }}>
          <button onClick={onClose}
            className="w-full py-2 rounded-lg font-bold text-sm bg-amber-500 hover:bg-amber-400 text-emerald-950">
            הבנתי, בוא נשחק
          </button>
        </div>
      </div>
    </div>
  )
}

function Ability({ lvl, title, children }) {
  return (
    <div className="flex items-start gap-2 p-2 rounded-md"
      style={{ background: 'rgba(127,29,29,0.18)', border: '1px solid rgba(239,68,68,0.25)' }}>
      <span className="flex-shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center"
        style={{ background: '#7f1d1d', color: 'white', border: '1px solid #ef4444' }}>
        {lvl}
      </span>
      <div className="flex-1">
        <div className="text-red-200 font-bold text-xs">{title}</div>
        <div className="text-emerald-100/80 text-xs leading-snug">{children}</div>
      </div>
    </div>
  )
}
