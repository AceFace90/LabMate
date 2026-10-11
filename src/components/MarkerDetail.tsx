import { useState } from 'react'
import { findCustomMarker, getMarker } from '../data/markerCatalog'
import { formatIsoDate } from '../lib/dates'
import { effectiveRange, markerStatus } from '../lib/healthScore'
import type { CustomMarker, MarkerResult } from '../types'
import { RangeBar } from './RangeBar'
import { TrendChart } from './TrendChart'

type RangePatch = Pick<MarkerResult, 'rangeLow' | 'rangeHigh' | 'rangeText'>

/** Turns the optional low/high inputs into stored range fields, e.g. "0.70 - 1.10", "< 3.0", "> 60". */
function rangeFromInputs(low: string, high: string): RangePatch {
  const lo = low.trim() === '' ? null : Number(low)
  const hi = high.trim() === '' ? null : Number(high)
  const rangeLow = lo !== null && !Number.isNaN(lo) ? lo : null
  const rangeHigh = hi !== null && !Number.isNaN(hi) ? hi : null
  const rangeText =
    rangeLow !== null && rangeHigh !== null
      ? `${low.trim()} - ${high.trim()}`
      : rangeLow !== null
        ? `> ${low.trim()}`
        : rangeHigh !== null
          ? `< ${high.trim()}`
          : ''
  return { rangeLow, rangeHigh, rangeText }
}

interface Props {
  markerKey: string
  results: MarkerResult[]
  customMarkers: CustomMarker[]
  onBack: () => void
  onAddManualResult: (result: Omit<MarkerResult, 'id' | 'createdAt'>) => void
  onDeleteResult: (id: string) => void
  onEditResult: (id: string, patch: { date: string; value: number; displayValue: string } & RangePatch) => void
}

export function MarkerDetail({
  markerKey,
  results,
  customMarkers,
  onBack,
  onAddManualResult,
  onDeleteResult,
  onEditResult,
}: Props) {
  const marker = getMarker(markerKey)
  const custom = marker ? undefined : findCustomMarker(customMarkers, markerKey)
  const markerResults = results
    .filter((r) => r.markerKey === markerKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const unit = markerResults[0]?.unit || marker?.defaultUnit || custom?.unit || ''

  const [showForm, setShowForm] = useState(false)
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [rangeLow, setRangeLow] = useState('')
  const [rangeHigh, setRangeHigh] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editValue, setEditValue] = useState('')
  const [editRangeLow, setEditRangeLow] = useState('')
  const [editRangeHigh, setEditRangeHigh] = useState('')

  if (!marker && !custom) return null

  // Prefill a new manual result's range from the most recent result that has a printed one.
  const lastPrintedRange = markerResults.find((r) => r.rangeLow !== null || r.rangeHigh !== null)
  const openAddForm = () => {
    setRangeLow(lastPrintedRange?.rangeLow != null ? String(lastPrintedRange.rangeLow) : '')
    setRangeHigh(lastPrintedRange?.rangeHigh != null ? String(lastPrintedRange.rangeHigh) : '')
    setShowForm(true)
  }

  const label = marker?.label ?? custom?.label ?? ''
  const description = marker?.description ?? ''

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← Back
      </button>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{label}</h3>
        {description && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: -4 }}>{description}</p>}
        <TrendChart results={markerResults} unit={unit} marker={marker} />
      </div>

      <div className="card">
        <table className="results-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Value</th>
              <th>Range</th>
              <th>Visual range</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {markerResults.map((r) => {
              const range = effectiveRange(r, marker)
              const status = markerStatus(r, marker)
              const isEditing = editingId === r.id
              return (
                <tr key={r.id}>
                  {isEditing ? (
                    <>
                      <td>
                        <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          style={{ width: 90 }}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />{' '}
                        {r.unit}
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          placeholder="low"
                          aria-label="Range low"
                          style={{ width: 60 }}
                          value={editRangeLow}
                          onChange={(e) => setEditRangeLow(e.target.value)}
                        />{' '}
                        –{' '}
                        <input
                          type="number"
                          step="any"
                          placeholder="high"
                          aria-label="Range high"
                          style={{ width: 60 }}
                          value={editRangeHigh}
                          onChange={(e) => setEditRangeHigh(e.target.value)}
                        />
                      </td>
                      <td></td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.addedManually ? 'Manual entry' : r.sourceFile}</td>
                      <td className="result-actions">
                        <button
                          onClick={() => {
                            const numeric = Number(editValue)
                            if (!editDate || Number.isNaN(numeric)) return
                            onEditResult(r.id, {
                              date: editDate,
                              value: numeric,
                              displayValue: editValue,
                              ...rangeFromInputs(editRangeLow, editRangeHigh),
                            })
                            setEditingId(null)
                          }}
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{formatIsoDate(r.date)}</td>
                      <td>
                        <span className={`status-dot ${status}${range.isStandard ? ' is-standard' : ''}`} />
                        {r.displayValue} {r.unit}
                        {r.flag && <span className="badge">flagged</span>}
                      </td>
                      <td>
                        {r.rangeText || (range.isStandard ? (
                          <span>
                            {marker?.standardRangeText}
                            <span className="range-caveat"> (general)</span>
                          </span>
                        ) : (
                          '—'
                        ))}
                      </td>
                      <td>
                        {r.value !== null && <RangeBar value={r.value} low={range.low} high={range.high} status={status} isStandard={range.isStandard} />}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {r.derived ? 'Calculated' : r.addedManually ? 'Manual entry' : r.sourceFile}
                      </td>
                      <td className="result-actions">
                        {!r.derived && (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(r.id)
                                setEditDate(r.date)
                                setEditValue(r.value !== null ? String(r.value) : '')
                                setEditRangeLow(r.rangeLow !== null ? String(r.rangeLow) : '')
                                setEditRangeHigh(r.rangeHigh !== null ? String(r.rangeHigh) : '')
                              }}
                            >
                              Edit
                            </button>
                            <button onClick={() => onDeleteResult(r.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>

        {!showForm ? (
          <button className="secondary" style={{ marginTop: 12 }} onClick={openAddForm}>
            + Add a result by hand
          </button>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="form-row">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Value ({unit || 'no unit'})</label>
              <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Reference range (optional - as printed on your report)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  step="any"
                  placeholder="Low"
                  aria-label="Range low"
                  value={rangeLow}
                  onChange={(e) => setRangeLow(e.target.value)}
                />
                –
                <input
                  type="number"
                  step="any"
                  placeholder="High"
                  aria-label="Range high"
                  value={rangeHigh}
                  onChange={(e) => setRangeHigh(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={() => {
                  const numeric = Number(value)
                  if (!date || Number.isNaN(numeric)) return
                  onAddManualResult({
                    markerKey,
                    rawName: label,
                    date,
                    value: numeric,
                    displayValue: value,
                    flag: '',
                    ...rangeFromInputs(rangeLow, rangeHigh),
                    unit,
                    sourceFile: 'manual entry',
                    panel: 'Manual',
                    addedManually: true,
                  })
                  setShowForm(false)
                  setDate('')
                  setValue('')
                }}
              >
                Save
              </button>
              <button className="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
