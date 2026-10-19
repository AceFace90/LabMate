import { useRef, useState } from 'react'
import { getMarker } from '../data/markerCatalog'
import { formatIsoDate } from '../lib/dates'
import { PdfPasswordNeededError, PdfWrongPasswordError, parsePdf, runStateMachine, type ParseOutcome } from '../lib/pdfParser'
import { textToLines } from '../lib/textLines'
import type { MarkerResult } from '../types'

interface Props {
  onImport: (results: MarkerResult[]) => void
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'needs_password'; file: File; error?: string }
  | { kind: 'parsing' }
  | { kind: 'paste' }
  | { kind: 'review'; sourceName: string; outcome: ParseOutcome }
  | { kind: 'error'; message: string }

export function UploadFlow({ onImport }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [pastedText, setPastedText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function tryParse(file: File, pw?: string) {
    setStage({ kind: 'parsing' })
    try {
      const buf = await file.arrayBuffer()
      const outcome = await parsePdf(file.name, buf, pw)
      setStage({ kind: 'review', sourceName: file.name, outcome })
    } catch (err) {
      if (err instanceof PdfPasswordNeededError) {
        setStage({ kind: 'needs_password', file })
      } else if (err instanceof PdfWrongPasswordError) {
        setStage({ kind: 'needs_password', file, error: 'That password did not work - try again.' })
      } else {
        console.error(err)
        setStage({ kind: 'error', message: 'Could not read that PDF. It may not be a supported pathology report.' })
      }
    }
  }

  function parsePastedText() {
    setStage({ kind: 'review', sourceName: 'Pasted text', outcome: runStateMachine('Pasted text', textToLines(pastedText)) })
  }

  return (
    <div>
      {stage.kind === 'idle' && (
        <div className="card upload-drop">
          <p>Import a pathology report PDF. Password-protected files will prompt for the password - it's used once, in your browser, and never stored.</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void tryParse(file)
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="primary" onClick={() => inputRef.current?.click()}>
              Choose PDF
            </button>
            <button className="secondary" onClick={() => setStage({ kind: 'paste' })}>
              Paste text
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'paste' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Paste report text</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Copy the results from a PDF or your lab's web portal and paste them below. Include the collection date
            line (e.g. "Collected" or "Date of Observation") so results are filed under the right date.
          </p>
          <textarea
            autoFocus
            rows={12}
            value={pastedText}
            placeholder="Paste results here"
            onChange={(e) => setPastedText(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="primary" disabled={!pastedText.trim()} onClick={parsePastedText}>
              Read results
            </button>
            <button className="secondary" onClick={() => setStage({ kind: 'idle' })}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'parsing' && <div className="card">Reading PDF…</div>}

      {stage.kind === 'error' && (
        <div className="card">
          <p>{stage.message}</p>
          <button className="secondary" onClick={() => setStage({ kind: 'idle' })}>
            Try another file
          </button>
        </div>
      )}

      {stage.kind === 'needs_password' && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Password required</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stage.file.name}</p>
            {stage.error && <p style={{ fontSize: 12, color: 'var(--status-critical)' }}>{stage.error}</p>}
            <input
              type="password"
              autoFocus
              value={password}
              placeholder="PDF password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void tryParse(stage.file, password)
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={() => void tryParse(stage.file, password)}>
                Unlock
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setPassword('')
                  setStage({ kind: 'idle' })
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {stage.kind === 'review' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Review before saving</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stage.sourceName}</p>
          {stage.outcome.results.length === 0 ? (
            <p>No recognisable results found.</p>
          ) : (
            <table className="results-table">
              <thead>
                <tr>
                  <th>Marker</th>
                  <th>Date</th>
                  <th>Value</th>
                  <th>Range</th>
                </tr>
              </thead>
              <tbody>
                {stage.outcome.results.map((r) => {
                  const known = !r.markerKey.startsWith('unmatched:')
                  return (
                    <tr key={r.id}>
                      <td>
                        {known ? getMarker(r.markerKey)?.label ?? r.rawName : r.rawName}
                        {!known && <span className="badge">unrecognised</span>}
                      </td>
                      <td>{formatIsoDate(r.date)}</td>
                      <td>
                        {r.displayValue} {r.unit}
                        {r.flag && <span className="badge">flagged</span>}
                      </td>
                      <td>{r.rangeText || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {stage.outcome.warnings.length > 0 && (
            <div className="warning-list">
              {stage.outcome.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="primary"
              disabled={stage.outcome.results.length === 0}
              onClick={() => {
                onImport(stage.outcome.results.filter((r) => !r.markerKey.startsWith('unmatched:')))
                setStage({ kind: 'idle' })
                setPassword('')
                setPastedText('')
              }}
            >
              Save recognised results
            </button>
            <button className="secondary" onClick={() => setStage({ kind: 'idle' })}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
