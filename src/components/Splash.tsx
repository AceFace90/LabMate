import { useState } from 'react'

interface Props {
  migrating: boolean
  authError: string | null
  onQuickStart: (name: string) => void
  onSkip: () => void
  onSignIn: () => void
}

const FEATURES = [
  { icon: '📄', title: 'Import lab PDFs', desc: 'Drop in a pathology report and every marker is parsed automatically' },
  { icon: '📈', title: 'Track trends over time', desc: 'See how each marker moves across every test you\'ve ever had' },
  { icon: '🧬', title: 'Biological age estimate', desc: 'A PhenoAge-based estimate from your own routine bloodwork' },
]

export function Splash({ migrating, authError, onQuickStart, onSkip, onSignIn }: Props) {
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState('')

  function handleContinue() {
    const trimmed = name.trim()
    if (!trimmed) return
    onQuickStart(trimmed)
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h1 style={{ marginBottom: 4 }}>LabMate</h1>
        <div className="subtitle">Blood test tracking, over time</div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        {FEATURES.map((f) => (
          <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ fontSize: 22, width: 28, textAlign: 'center' }}>{f.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{f.title}</div>
              <div className="caveat" style={{ marginTop: 2 }}>{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {authError && (
        <p className="caveat" style={{ color: 'var(--status-critical)', textAlign: 'center' }}>
          {authError}
        </p>
      )}

      {!showNameInput ? (
        <>
          <button className="primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => setShowNameInput(true)}>
            🚀 Quick Start
          </button>
          <button className="google" style={{ marginBottom: 10 }} onClick={onSignIn} disabled={migrating}>
            <span className="g-icon">G</span>
            {migrating ? 'Signing in...' : 'Sign in with Google'}
          </button>
          <p className="caveat" style={{ textAlign: 'center', marginBottom: 16 }}>
            Sync across devices - secure cloud backup
          </p>
          <p style={{ textAlign: 'center' }}>
            <button className="back-link" onClick={onSkip}>
              Skip for now - use LabMate without a name
            </button>
          </p>
        </>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Welcome to LabMate 🩺</h3>
          <p className="caveat" style={{ marginBottom: 12 }}>What should we call you?</p>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 15,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--page-plane)',
              color: 'var(--text-primary)',
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />
          <button className="primary" style={{ width: '100%', marginBottom: 8 }} onClick={handleContinue}>
            Continue
          </button>
          <button className="back-link" onClick={() => setShowNameInput(false)}>
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}
