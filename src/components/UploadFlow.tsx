import { Icon } from './Icon'
import { useRef, useState } from 'react'
import { classifyImport } from '../lib/storage'
import { getMarker } from '../data/markerCatalog'
import { formatIsoDate } from '../lib/dates'
import { PdfPasswordNeededError, PdfWrongPasswordError, parsePdf, runStateMachine, type ParseOutcome } from '../lib/pdfParser'
import { textToLines } from '../lib/textLines'
import type { MarkerResult } from '../types'

interface Props {
  /** Results already stored, used to spot repeats and conflicts in a new report. */
  existing: MarkerResult[]
  /** `removeIds` are stored results the user chose to replace with the report's value. */
  onImport: (results: MarkerResult[], removeIds?: string[]) => void
}

type ConflictChoice = 'keep' | 'replace' | 'both'

type Stage =
  | { kind: 'idle' }
  | { kind: 'needs_password'; file: File; error?: string }
  | { kind: 'parsing' }
  | { kind: 'paste' }
  | { kind: 'review'; sourceName: string; outcome: ParseOutcome }
  | { kind: 'error'; message: string }

export function UploadFlow({ existing, onImport }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [password, setPassword] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [pastedDate, setPastedDate] = useState('')
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
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
    setStage({ kind: 'review', sourceName: 'Pasted text', outcome: runStateMachine('Pasted text', textToLines(pastedText), pastedDate) })
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
            Copy the results from a PDF or your lab's web portal and paste them below. If the text doesn't include
            the collection date, set it here.
          </p>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
            Collection date{' '}
            <input type="date" value={pastedDate} onChange={(e) => setPastedDate(e.target.value)} />
          </label>
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

      {stage.kind === 'review' && (() => {
        const all = stage.outcome.results
        const recognised = all.filter((r) => !r.markerKey.startsWith('unmatched:'))
        const unrecognised = all.filter((r) => r.markerKey.startsWith('unmatched:'))
        const { added, unchanged, conflicts } = classifyImport(existing, recognised)
        const choiceFor = (id: string): ConflictChoice => choices[id] ?? 'keep'
        const replaced = conflicts.filter((c) => choiceFor(c.incoming.id) === 'replace')
        const keptBoth = conflicts.filter((c) => choiceFor(c.incoming.id) === 'both')
        const toSave = [...added, ...replaced.map((c) => c.incoming), ...keptBoth.map((c) => c.incoming)]
        const reset = () => {
          setStage({ kind: 'idle' })
          setChoices({})
        }
        const row = (r: MarkerResult) => (
          <tr key={r.id}>
            <td>{getMarker(r.markerKey)?.label ?? r.rawName}</td>
            <td>{formatIsoDate(r.date)}</td>
            <td>
              {r.displayValue} {r.unit}
              {r.flag && <span className="badge">flagged</span>}
            </td>
            <td>{r.rangeText || '—'}</td>
          </tr>
        )
        const head = (
          <thead>
            <tr>
              <th>Marker</th>
              <th>Date</th>
              <th>Value</th>
              <th>Range</th>
            </tr>
          </thead>
        )
        const summary = [
          `${added.length} new`,
          `${unchanged.length} already imported`,
          ...(conflicts.length ? [`${conflicts.length} differ${conflicts.length === 1 ? 's' : ''} from what's saved`] : []),
        ].join(' · ')

        return (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Review before saving</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{stage.sourceName}</p>

            {all.length === 0 ? (
              <p>
                No results recognised. Check the file is a pathology report with a results table, or paste the
                results text instead. If the text has no collection date, set one before reading it.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{summary}</p>

                {conflicts.length > 0 && (
                  <>
                    <h4 style={{ marginBottom: 4 }}>Different from what's saved</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
                      Same marker and date, but a different value. Nothing is overwritten unless you choose to.
                    </p>
                    <table className="results-table">
                      <thead>
                        <tr>
                          <th>Marker</th>
                          <th>Date</th>
                          <th>Saved</th>
                          <th>Report</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {conflicts.map(({ incoming, existing: stored }) => (
                          <tr key={incoming.id}>
                            <td>{getMarker(incoming.markerKey)?.label ?? incoming.rawName}</td>
                            <td>{formatIsoDate(incoming.date)}</td>
                            <td>{stored.displayValue} {stored.unit}</td>
                            <td>{incoming.displayValue} {incoming.unit}</td>
                            <td>
                              <select
                                value={choiceFor(incoming.id)}
                                onChange={(e) => setChoices({ ...choices, [incoming.id]: e.target.value as ConflictChoice })}
                              >
                                <option value="keep">Keep saved</option>
                                <option value="replace">Use report value</option>
                                <option value="both">Keep both</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {(added.length > 0 || unrecognised.length > 0) && (
                  <>
                    <h4 style={{ marginBottom: 4 }}>New results</h4>
                    <table className="results-table">
                      {head}
                      <tbody>
                        {added.map(row)}
                        {unrecognised.map((r) => (
                          <tr key={r.id}>
                            <td>
                              {r.rawName}
                              <span className="badge">unrecognised</span>
                            </td>
                            <td>{formatIsoDate(r.date)}</td>
                            <td>{r.displayValue} {r.unit}</td>
                            <td>{r.rangeText || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {added.length === 0 && conflicts.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Everything in this report is already saved - nothing new to add.
                  </p>
                )}

                {unchanged.length > 0 && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 13, cursor: 'pointer' }}>
                      Show {unchanged.length} already imported
                    </summary>
                    <table className="results-table">
                      {head}
                      <tbody>{unchanged.map(row)}</tbody>
                    </table>
                  </details>
                )}
              </>
            )}

            {stage.outcome.warnings.length > 0 && (
              <div className="warning-list">
                {stage.outcome.warnings.map((w, i) => (
                  <div key={i}><Icon name="warning" className="warn-icon" /> {w}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="primary"
                disabled={toSave.length === 0}
                onClick={() => {
                  onImport(toSave, replaced.map((c) => c.existing.id))
                  reset()
                  setPassword('')
                  setPastedText('')
                  setPastedDate('')
                }}
              >
                {toSave.length === 0 ? 'Nothing to save' : `Save ${toSave.length} result${toSave.length === 1 ? '' : 's'}`}
              </button>
              {stage.sourceName === 'Pasted text' && (
                <button className="secondary" onClick={() => setStage({ kind: 'paste' })}>
                  Edit text
                </button>
              )}
              <button className="secondary" onClick={reset}>
                Discard
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
