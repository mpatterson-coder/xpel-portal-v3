import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { COLOR as X, FONT, CARD } from '../lib/theme'

// =============================================================================
// One confirmation system for the whole portal.
//
//   const confirm = useConfirm()
//   const ok = await confirm({
//     title: 'Submit this order?',
//     message: 'optional sentence',
//     summary: [['Customer', 'Jane D'], ['Total', '$2,495']],   // review rows
//     confirmLabel: 'Submit order',
//     tone: 'default' | 'danger',
//     typeToConfirm: 'delete',   // hard gate: user must type the word
//   })
//
// Two tiers, per the UX spec: a review-summary modal for meaningful actions,
// and a type-the-word gate reserved for permanent destruction.
// =============================================================================

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null)
  const [typed, setTyped] = useState('')
  const resolver = useRef(null)

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve
    setTyped('')
    setReq(opts)
  }), [])

  const finish = (answer) => {
    resolver.current?.(answer)
    resolver.current = null
    setReq(null)
  }

  const danger = req?.tone === 'danger'
  const gateOpen = !req?.typeToConfirm || typed.trim().toLowerCase() === req.typeToConfirm.toLowerCase()

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <div onClick={() => finish(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,18,19,0.5)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="x-fade" onClick={(e) => e.stopPropagation()}
            style={{ ...CARD, width: 'min(480px, 100%)', padding: 0, overflow: 'hidden' }}>
            <div style={{ background: danger ? X.red : X.black, color: X.white, padding: '14px 18px', fontWeight: 800, fontSize: 15 }}>
              {req.title}
            </div>
            <div style={{ padding: '16px 18px' }}>
              {req.message && <div style={{ fontSize: 13.5, color: X.slate, lineHeight: 1.5, marginBottom: req.summary?.length ? 12 : 0 }}>{req.message}</div>}
              {req.summary?.length > 0 && (
                <div style={{ border: `1px solid ${X.line}`, borderRadius: 10, padding: '4px 12px', marginBottom: 4 }}>
                  {req.summary.map(([label, value], i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderTop: i ? `1px dashed ${X.line}` : 'none', fontSize: 13 }}>
                      <span style={{ color: X.slate, flexShrink: 0 }}>{label}</span>
                      <span style={{ fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
              {req.typeToConfirm && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12.5, color: X.red, fontWeight: 700, marginBottom: 6 }}>
                    This is permanent and cannot be undone. Type "{req.typeToConfirm}" to continue.
                  </div>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus
                    placeholder={`Type ${req.typeToConfirm} here`}
                    style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${gateOpen ? X.green : X.gray}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: FONT.body, outline: 'none' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => finish(false)} style={cancelBtn}>Cancel</button>
                <button onClick={() => finish(true)} disabled={!gateOpen}
                  style={{ ...goBtn, background: danger ? X.red : X.yellow, color: danger ? X.white : X.black, opacity: gateOpen ? 1 : 0.45, cursor: gateOpen ? 'pointer' : 'not-allowed' }}>
                  {req.confirmLabel || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx
}

const cancelBtn = { background: 'transparent', color: X.slate, border: `1px solid ${X.gray}`, borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: FONT.body }
const goBtn = { border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT.body }
