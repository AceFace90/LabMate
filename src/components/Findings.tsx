import { buildFindings } from '../lib/findings'
import type { MarkerResult } from '../types'
import { RangeBar } from './RangeBar'

interface Props {
  results: MarkerResult[]
}

export function Findings({ results }: Props) {
  const findings = buildFindings(results)
  if (findings.length === 0) return null

  return (
    <div className="card category-section" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Findings</h3>
      <p className="cat-desc">
        Categories with at least one result currently outside its range, most-affected first. This is general
        education, not a diagnosis - the "ask your doctor" and "possible next steps" items are common questions
        people in this situation raise, not a recommendation specific to you.
      </p>
      <div className="findings-list">
        {findings.map((f) => (
          <div key={f.category} className="finding-block">
            <div className="finding-header">
              <strong>{f.categoryLabel}</strong>
              <span className="badge">
                {f.outOfRangeCount} of {f.testedCount} outside range
              </span>
            </div>

            <div className="finding-markers">
              {f.markers.map((m) => (
                <div key={m.key} className="finding-marker-row">
                  <div className="finding-marker-main">
                    <span className={`status-dot ${m.status}${m.isStandard ? ' is-standard' : ''}`} />
                    <span>
                      <strong>{m.label}</strong> {m.value} {m.unit}
                    </span>
                    <span className="caveat">
                      ({m.status === 'high' ? 'above' : 'below'} {m.rangeText || `${m.rangeLow ?? ''} - ${m.rangeHigh ?? ''}`}
                      {m.isStandard ? ', general range' : ''})
                    </span>
                  </div>
                  <RangeBar value={m.value} low={m.rangeLow} high={m.rangeHigh} status={m.status} isStandard={m.isStandard} />
                </div>
              ))}
            </div>

            <div className="finding-columns">
              <div>
                <div className="finding-subhead">Ask your doctor</div>
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
          </div>
        ))}
      </div>
      <div className="caveat" style={{ marginTop: 8 }}>
        We deliberately don't guess at causes, recovery timelines or supplement doses here - those depend on your
        history and need a clinician, and getting them wrong with false confidence would be worse than not
        answering.
      </div>
    </div>
  )
}
