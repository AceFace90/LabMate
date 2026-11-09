import { useState } from 'react'
import { CATEGORIES, MARKER_CATALOG } from '../data/markerCatalog'
import { CATEGORY_STYLE, categoryColor } from '../data/categoryStyle'
import { effectiveRange, latestResultByMarker, markerStatus } from '../lib/healthScore'
import type { CustomMarker, MarkerResult, Profile } from '../types'
import { Icon } from './Icon'
import { RangeBar } from './RangeBar'

interface Props {
  results: MarkerResult[]
  customMarkers: CustomMarker[]
  profile: Profile
  onSelectMarker: (markerKey: string) => void
  onAddCustomMarker: (marker: { label: string; unit: string }) => void
}

function statusColor(status: string | null): string {
  if (status === 'in_range') return 'var(--status-good)'
  if (status === 'low' || status === 'high') return 'var(--status-serious)'
  return 'var(--text-secondary)'
}

export function MarkerGrid({ results, customMarkers, profile, onSelectMarker, onAddCustomMarker }: Props) {
  const latest = latestResultByMarker(results)
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customUnit, setCustomUnit] = useState('')

  return (
    <div className="marker-list">
      {CATEGORIES.filter((c) => c.key !== 'custom').map((cat) => {
        const markers = MARKER_CATALOG.filter(
          (m) => m.category === cat.key && (!m.sexSpecific || !profile.sex || m.sexSpecific === profile.sex),
        )
        if (markers.length === 0) return null
        const style = CATEGORY_STYLE[cat.key]
        return (
          <section className="cat-block" key={cat.key} id={`category-${cat.key}`}>
            <header className="cat-head">
              <Icon name={style.icon} className="cat-icon" style={{ color: style.color }} />
              <div>
                <h3>{cat.label}</h3>
                <p>{cat.description}</p>
              </div>
            </header>
            <div className="list-card">
              {markers.map((m) => {
                const r = latest.get(m.key)
                const status = r ? markerStatus(r, m) : null
                const range = r ? effectiveRange(r, m) : null
                const isStandard = range?.isStandard ?? false
                return (
                  <button key={m.key} className="list-row" onClick={() => onSelectMarker(m.key)} title={m.description}>
                    <div className="list-main">
                      <div className="list-name">{m.label}</div>
                      {r && r.value !== null && range && (range.low !== null || range.high !== null) && status ? (
                        <RangeBar value={r.value} low={range.low} high={range.high} status={status} isStandard={isStandard} compact />
                      ) : (
                        !r && <div className="list-sub">{m.manualOnly ? 'Log manually' : 'Not tested yet'}</div>
                      )}
                    </div>
                    {r && (
                      <div className="list-value">
                        <span className="dot" style={{ background: statusColor(status) }} />
                        <span className="v" style={{ color: statusColor(status) }}>{r.displayValue}</span>
                        <span className="u">{r.unit || m.defaultUnit}</span>
                      </div>
                    )}
                    <Icon name="chevronRight" className="chev" />
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <section className="cat-block">
        <header className="cat-head">
          <Icon name={CATEGORY_STYLE.custom.icon} className="cat-icon" style={{ color: categoryColor('custom') }} />
          <div>
            <h3>Custom Metrics</h3>
            <p>Anything else you want to track that is not in the built-in list.</p>
          </div>
        </header>
        <div className="list-card">
          {customMarkers.map((m) => {
            const r = latest.get(m.key)
            return (
              <button key={m.key} className="list-row" onClick={() => onSelectMarker(m.key)}>
                <div className="list-main">
                  <div className="list-name">{m.label}</div>
                  {!r && <div className="list-sub">Log manually</div>}
                </div>
                {r && (
                  <div className="list-value">
                    <span className="v">{r.displayValue}</span>
                    <span className="u">{r.unit || m.unit}</span>
                  </div>
                )}
                <Icon name="chevronRight" className="chev" />
              </button>
            )
          })}
          {!showCustomForm ? (
            <button className="list-row add-row" onClick={() => setShowCustomForm(true)}>
              <Icon name="plusCircle" className="add-icon" />
              <span>Add custom metric</span>
            </button>
          ) : (
            <div className="list-form">
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
      </section>
    </div>
  )
}
