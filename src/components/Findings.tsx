import { useState } from 'react'
import { buildFindings } from '../lib/findings'
import { findingCaveat, findingsIntro } from '../lib/insightsNarrative'
import type { MarkerResult } from '../types'
import { Icon } from './Icon'
import { RangeBar } from './RangeBar'

interface Props {
  results: MarkerResult[]
  onGoToMarkers?: (categoryKey?: string) => void
}

export function Findings({ results, onGoToMarkers }: Props) {
  const findings = buildFindings(results)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <>
      <h3 className="section-title">Findings</h3>
      <p className="section-sub">{findingsIntro(findings.length)}</p>
      {findings.map((f) => {
        const isOpen = open === f.category
        return (
          <div key={f.category} className="card detail-card finding-card">
            <button type="button" className="finding-toggle" onClick={() => setOpen(isOpen ? null : f.category)} aria-expanded={isOpen}>
              <div>
                <div className="card-eyebrow">{f.categoryLabel}</div>
                <h3>
                  {f.outOfRangeCount} Of {f.testedCount} Outside Range
                </h3>
              </div>
              <Icon name={isOpen ? 'chevronUpDown' : 'chevronRight'} className="chev" />
            </button>
            <p className="card-narrative">
              {f.outOfRangeCount} of {f.testedCount} tested {f.testedCount === 1 ? 'marker is' : 'markers are'} outside range
              {f.markers.length > 0 ? `, including ${f.markers.slice(0, 3).map((m) => m.label).join(', ')}` : ''}. A single reading is
              a snapshot, and many everyday things can nudge a value for a while. Your doctor can help put it in context.
            </p>
            {isOpen && (
              <div className="finding-detail">
                {f.markers.map((m) => (
                  <div key={m.key} className="finding-marker-row">
                    <div className="finding-marker-main">
                      <strong>{m.label}</strong>
                      <strong>
                        {m.value} {m.unit}
                      </strong>
                    </div>
                    <div className="list-sub">
                      {m.status === 'high' ? 'Above' : 'Below'} {m.rangeText || `${m.rangeLow ?? ''} - ${m.rangeHigh ?? ''}`}
                      {m.isStandard ? ', general range' : ''}
                    </div>
                    <RangeBar value={m.value} low={m.rangeLow} high={m.rangeHigh} status={m.status} isStandard={m.isStandard} compact />
                  </div>
                ))}
                <div className="finding-columns">
                  <div>
                    <div className="finding-subhead">Questions to consider asking</div>
                    <ul className="finding-list">
                      {f.askYourDoctor.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="finding-subhead">Possible next steps</div>
                    <ul className="finding-list">
                      {f.possibleNextSteps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {onGoToMarkers && (
                  <button type="button" className="link-btn" onClick={() => onGoToMarkers(f.category)}>
                    View in Markers
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      <p className="section-sub small">{findingCaveat}</p>
    </>
  )
}

Findings.count = (results: MarkerResult[]): number => buildFindings(results).length
