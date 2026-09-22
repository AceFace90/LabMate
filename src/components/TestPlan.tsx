import { formatIsoDate } from '../lib/dates'
import { actionableOnly, buildTestPlan, type TestRecommendation } from '../lib/testPlanner'
import type { MarkerResult, Profile } from '../types'

interface Props {
  results: MarkerResult[]
  profile: Profile
}

const REASON_LABEL: Record<TestRecommendation['reason'], string> = {
  missing: 'Never tested',
  overdue: 'Overdue',
  out_of_range_followup: 'Follow-up',
  due_soon: 'Due soon',
  tested_recently: 'Up to date',
}

const REASON_COLOR: Record<TestRecommendation['reason'], string> = {
  missing: 'var(--status-serious)',
  overdue: 'var(--status-warning)',
  out_of_range_followup: 'var(--status-critical)',
  due_soon: 'var(--text-secondary)',
  tested_recently: 'var(--status-good)',
}

export function TestPlan({ results, profile }: Props) {
  const plan = buildTestPlan(results, profile)
  const gp = actionableOnly(plan.gp)
  const priv = actionableOnly(plan.private)

  if (gp.length === 0 && priv.length === 0) {
    return (
      <div className="card">
        <p>Nothing due right now based on what's been imported so far.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Your test plan</h3>
        <p className="cat-desc">
          A scheduling heuristic, not medical advice: combines what you've never tested, what's overdue for its
          usual cadence, and what was last out of range and worth rechecking sooner - weighted so core wellness
          baselines (FBC, kidney/liver/lipids, thyroid, HbA1c, VO2 max, body composition) rank above niche tests due
          around the same time. Your GP may reasonably order things differently based on your actual history.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>From your GP</h3>
          <div className="test-plan-list">
            {gp.length === 0 ? <p className="caveat">Nothing due.</p> : gp.map((r) => <TestRow key={r.key} rec={r} />)}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Private / specialist</h3>
          <div className="test-plan-list">
            {priv.length === 0 ? <p className="caveat">Nothing due.</p> : priv.map((r) => <TestRow key={r.key} rec={r} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function TestRow({ rec }: { rec: TestRecommendation }) {
  return (
    <div className="test-plan-row">
      <div className="test-plan-row-header">
        <strong>{rec.label}</strong>
        <span style={{ color: REASON_COLOR[rec.reason], fontSize: 12, fontWeight: 600 }}>{REASON_LABEL[rec.reason]}</span>
      </div>
      <div className="caveat">{rec.detail}</div>
      <div className="caveat">
        {rec.reason === 'missing' ? 'Recommended now' : `Next due: ${formatIsoDate(rec.dueDate)}`}
        {rec.wellnessCore && ' · core wellness check'}
      </div>
      <div className="caveat" style={{ fontStyle: 'italic' }}>
        {rec.note}
      </div>
    </div>
  )
}
