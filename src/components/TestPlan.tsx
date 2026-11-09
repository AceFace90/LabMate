import { formatIsoDate } from '../lib/dates'
import { actionableOnly, buildTestPlan, type TestRecommendation } from '../lib/testPlanner'
import type { MarkerResult, Profile } from '../types'
import { Icon, type IconName } from './Icon'

interface Props {
  results: MarkerResult[]
  profile: Profile
}

type Reason = TestRecommendation['reason']

const REASON_LABEL: Record<Reason, string> = {
  missing: 'Never tested',
  overdue: 'Overdue',
  out_of_range_followup: 'Follow-up',
  due_soon: 'Due soon',
  tested_recently: 'Up to date',
}

const REASON_COLOR: Record<Reason, string> = {
  missing: 'var(--status-serious)',
  overdue: 'var(--status-warning)',
  out_of_range_followup: 'var(--status-critical)',
  due_soon: 'var(--text-secondary)',
  tested_recently: 'var(--status-good)',
}

const REASON_ICON: Record<Reason, IconName> = {
  missing: 'qCircle',
  overdue: 'clockCircle',
  out_of_range_followup: 'refreshCircle',
  due_soon: 'calendarCircle',
  tested_recently: 'checkCircle',
}

export function TestPlan({ results, profile }: Props) {
  const plan = buildTestPlan(results, profile)
  const gp = actionableOnly(plan.gp)
  const priv = actionableOnly(plan.private)
  const total = gp.length + priv.length

  return (
    <div className="marker-list">
      <h2 className="story-headline">{total === 0 ? 'All Up to Date' : `${total} ${total === 1 ? 'Test' : 'Tests'} Due`}</h2>
      <p className="story-narrative">
        {total === 0
          ? "Nothing is due right now based on what's been imported so far."
          : "A scheduling heuristic, not medical advice: it combines what you've never tested, what's overdue for its usual cadence, and what was last out of range and worth rechecking sooner. Your GP may reasonably order things differently based on your actual history."}
      </p>
      {total > 0 && (
        <>
          <PlanGroup title="From your GP" icon="stethoscope" recs={gp} />
          <PlanGroup title="Private / specialist" icon="caseCross" recs={priv} />
        </>
      )}
    </div>
  )
}

function PlanGroup({ title, icon, recs }: { title: string; icon: IconName; recs: TestRecommendation[] }) {
  return (
    <section className="cat-block">
      <header className="cat-head">
        <Icon name={icon} className="cat-icon" style={{ color: 'var(--accent)' }} />
        <div>
          <h3>{title}</h3>
        </div>
      </header>
      <div className="list-card">
        {recs.length === 0 ? (
          <div className="list-row static">
            <div className="list-sub">Nothing due.</div>
          </div>
        ) : (
          recs.map((r) => <TestRow key={r.key} rec={r} />)
        )}
      </div>
    </section>
  )
}

function TestRow({ rec }: { rec: TestRecommendation }) {
  const color = REASON_COLOR[rec.reason]
  return (
    <div className="list-row static plan-row">
      <Icon name={REASON_ICON[rec.reason]} className="plan-icon" style={{ color }} />
      <div className="list-main">
        <div className="plan-top">
          <span className="list-name">{rec.label}</span>
          <span style={{ color, fontSize: 12, fontWeight: 600 }}>{REASON_LABEL[rec.reason]}</span>
        </div>
        <div className="list-sub">{rec.detail}</div>
        <div className="list-sub">
          {rec.reason === 'missing' ? 'Recommended now' : `Next due: ${formatIsoDate(rec.dueDate)}`}
          {rec.wellnessCore && ' · core wellness check'}
        </div>
        <div className="list-sub" style={{ fontStyle: 'italic' }}>{rec.note}</div>
      </div>
    </div>
  )
}
