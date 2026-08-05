import { COLOR as X, FONT, CARD } from '../lib/theme'

// =============================================================================
// The guided-module shell: a modal that walks the user through steps in order,
// asking only for what's needed. Each step declares whether it's complete
// (`valid`), which gates the Continue button — the software leads, the user
// never has to wonder what's next.
//
//   <Wizard title="New Order" step={i} steps={[{key, label, valid, render}]}
//           onStep={setI} onClose={...} footer={customFinalButton} />
// =============================================================================
export default function Wizard({ title, subtitle, steps, step, onStep, onClose, footer }) {
  const cur = steps[step]
  const canNext = cur?.valid !== false
  const last = step === steps.length - 1

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,19,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 20px', overflowY: 'auto' }}>
      <div className="x-fade" onClick={(e) => e.stopPropagation()}
        style={{ ...CARD, width: 'min(860px, 100%)', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }}>

        {/* Header: title + step rail */}
        <div style={{ background: X.black, padding: '16px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: X.white, fontWeight: 800, fontSize: 17 }}>{title}</div>
              {subtitle && <div style={{ color: 'rgba(255,255,253,0.6)', fontSize: 12, marginTop: 2 }}>{subtitle}</div>}
            </div>
            <button onClick={onClose} title="Close (your draft is saved)" style={{ background: 'transparent', color: 'rgba(255,255,253,0.7)', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {steps.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <button key={s.key} onClick={() => i < step && onStep(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 999,
                    padding: '6px 13px', fontSize: 11.5, fontWeight: 700, fontFamily: FONT.body,
                    letterSpacing: '0.03em', cursor: done ? 'pointer' : 'default',
                    background: active ? X.yellow : done ? 'rgba(253,181,33,0.16)' : 'rgba(255,255,253,0.08)',
                    color: active ? X.black : done ? X.yellow : 'rgba(255,255,253,0.55)',
                  }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, background: active ? X.black : done ? X.yellow : 'rgba(255,255,253,0.14)', color: active ? X.yellow : done ? X.black : 'rgba(255,255,253,0.6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                    {done ? '✓' : i + 1}
                  </span>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          {cur?.render()}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 22px', borderTop: `1px solid ${X.line}`, background: '#FBFAF6' }}>
          <button onClick={() => (step === 0 ? onClose() : onStep(step - 1))} style={backBtn}>
            {step === 0 ? 'Cancel' : '← Back'}
          </button>
          {!last && (
            <button onClick={() => canNext && onStep(step + 1)} disabled={!canNext}
              style={{ ...nextBtn, opacity: canNext ? 1 : 0.45, cursor: canNext ? 'pointer' : 'not-allowed' }}>
              Continue →
            </button>
          )}
          {last && footer}
        </div>
      </div>
    </div>
  )
}

const backBtn = { background: 'transparent', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '11px 18px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: FONT.body }
const nextBtn = { background: X.black, color: X.white, border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT.body }
