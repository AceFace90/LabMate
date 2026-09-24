import { useState } from 'react'
import { CATEGORIES, MARKER_CATALOG } from '../data/markerCatalog'
import { effectiveRange, latestResultByMarker, markerStatus } from '../lib/healthScore'
import type { CustomMarker, MarkerResult, Profile } from '../types'
import { RangeBar } from './RangeBar'

interface Props {
  results: MarkerResult[]
  customMarkers: CustomMarker[]
  profile: Profile
  onSelectMarker: (markerKey: string) => void
  onAddCustomMarker: (marker: { label: string; unit: string }) => void
}

export function MarkerGrid({ results, customMarkers, profile, onSelectMarker, onAddCustomMarker }: Props) {
  const latest = latestResultByMarker(results)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState('')

  return (
    <div>
      {CATEGORIES.filter((c) => c.key !== 'custom').map((cat) => {
        const markers = MARKER_CATALOG.filter(
          (m) => m.category === cat.key && (!m.sexSpecific || !profile.sex || m.sexSpecific === profile.sex),
        )
        if (markers.length === 0) return null
        return (
          <div className="category-section card" key={cat.key} id={`category-${cat.key}`}>
            <h3>{cat.label}</h3>
            <p className="cat-desc">{cat.description}</p>
            <div className="marker-grid">
              {markers.map((m) => {
                const r = latest.get(m.key)
                const isGap = !r
                const status = r ? markerStatus(r, m) : null
                const range = r ? effectiveRange(r, m) : null
                const isStandard = range?.isStandard ?? false
                return (
                  <button
                    key={m.key}
                    className={`marker-card${isGap ? ' gap' : ''}`}
                    onClick={() => onSelectMarker(m.key)}
                    title={m.description}
                  >
                    <div className="name">{m.label}</div>
                    {r ? (
                      <>
                        <div className="value-row">
                          <span className={`status-dot ${status}${isStandard ? ' is-standard' : ''}`} />
                          <span className="value">{r.displayValue}</span>
                          <span className="unit">{r.unit || m.defaultUnit}</span>
                        </div>
                        {r.value !== null && range && (range.low !== null || range.high !== null) && status && (
                          <RangeBar value={r.value} low={range.low} high={range.high} status={status} isStandard={isStandard} />
                        )}
                      </>
                    ) : (
                      <div className="value">{m.manualOnly ? 'Log manually' : 'Not tested yet'}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="category-section card">
        <h3>Custom Metrics</h3>
        <p className="cat-desc">Anything else you want to track that is not in the built-in list.</p>
        <div className="marker-grid">
          {customMarkers.map((m) => {
            const r = latest.get(m.key)
            const isGap = !r
            return (
              <button
                key={m.key}
                className={`marker-card${isGap ? ' gap' : ''}`}
                onClick={() => onSelectMarker(m.key)}
                title={m.label}
              >
                <div className="name">{m.label}</div>
                {r ? (
                  <div className="value-row">
                    <span className={`status-dot unknown`} />
                    <span className="value">{r.displayValue}</span>
                    <span className="unit">{r.unit || m.unit}</span>
                  </div>
                ) : (
                  <div className="value">Log manually</div>
                )}
              </button>
            )
          })}
        </div>

        {!showCustomForm ? (
          <button className="secondary" style={{ marginTop: 12 }} onClick={() => setShowCustomForm(true)}>
            + Add custom metric
          </button>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="form-row">
              <label>Name</label>
              <input type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. Sleep score" />
            </div>
            <div className="form-row">
              <label>Unit (optional)</label>
              <input type="text" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)} placeholder="e.g. /100" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="primary"
                onClick={() => {
                  if (!customLabel.trim()) return
                  onAddCustomMarker({ label: customLabel.trim(), unit: customUnit.trim() })
                  setCustomLabel('')
                  setCustomUnit('')
                  setShowCustomForm(false)
                }}
              >
                Add
              </button>
              <button className="secondary" onClick={() => setShowCustomForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
