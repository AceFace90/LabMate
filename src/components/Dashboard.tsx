import { useRef, useState } from 'react'
import { computeBioAge, isBioAgeAvailable } from '../lib/bioAge'
import { formatIsoDate } from '../lib/dates'
import { firstNameOf, timeOfDayGreeting } from '../lib/greeting'
import { coverageByCategory, lastUpdatedDate, latestResultByMarker, overallCoverage } from '../lib/healthScore'
import * as N from '../lib/insightsNarrative'
import { CATEGORY_STYLE } from '../data/categoryStyle'
import type { MarkerResult, Profile } from '../types'
import { Findings } from './Findings'
import { Icon } from './Icon'
import { GaugeArc } from './GaugeArc'
import { ScoreRing } from './ScoreRing'

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const GOOD = 'var(--status-good)'
const SERIOUS = 'var(--status-serious)'
const VITALS = '#337aff'

interface Props {
  results: MarkerResult[]
  profile: Profile
  /** Google display name, used only when no profile.name has been set. */
  nameFallback: string | null
  onGoToUpload: () => void
  onGoToSettings: () => void
  /** Jump to the Markers tab, optionally scrolled to a specific category. */
  onGoToMarkers: (categoryKey?: string) => void
}

function DetailTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="detail-table">
      {rows.map(([k, v]) => (
        <div key={k} className="detail-row">
          <span>{k}</span>
          <strong>{v}</strong>
        </div>
      ))}
    </div>
  )
}

export function Dashboard({ results, profile, nameFallback, onGoToUpload, onGoToSettings, onGoToMarkers }: Props) {
  const [showInfo, setShowInfo] = useState(false)
  const [showCreatine, setShowCreatine] = useState(false)
  const refs = useRef<Record<string, HTMLElement | null>>({})
  const scrollTo = (k: string) => refs.current[k]?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const overall = overallCoverage(results, profile.sex)
  const lastUpdated = lastUpdatedDate(results)
  const byCategory = coverageByCategory(results, profile.sex)
  const latest = latestResultByMarker(results)
  const outcome = profile.birthDate
    ? computeBioAge(latest, profile.birthDate, { takesCreatineSupplement: profile.takesCreatineSupplement, sex: profile.sex })
    : null
  const bioAge = outcome && isBioAgeAvailable(outcome) ? outcome : null
  const missingBio = outcome && !isBioAgeAvailable(outcome) ? outcome.missing : []
  const hasBirthDate = !!profile.birthDate
  const firstName = firstNameOf(profile.name, nameFallback)

  const greeting = (
    <div className="dash-greeting">
      {timeOfDayGreeting()}, {firstName}
    </div>
  )

  if (results.length === 0) {
    return (
      <div className="content-column">
        <h2 className="page-title">Insights</h2>
        {greeting}
        <h2 className="story-headline">Nothing To Show Yet</h2>
        <p className="story-narrative">{N.emptyNarrative}</p>
        <div className="card detail-card">
          <div className="card-eyebrow">Get started</div>
          <div className="card-title-row">
            <h3>Import Your Results</h3>
            <Icon name="docPlus" className="cat-icon" style={{ color: VITALS }} />
          </div>
          <button className="primary" onClick={onGoToUpload}>
            Import a PDF
          </button>
        </div>
      </div>
    )
  }

  const hero = { bioAge, hasBirthDate, overall }
  const inRangeColor = overall.outOfRangeCount > 0 ? SERIOUS : GOOD
  const bioColor = bioAge && bioAge.delta > 0 ? SERIOUS : GOOD
  const tested = Math.max(overall.testedMarkers, 1)
  const findingsCount = Findings.count(results)

  return (
    <div className="content-column">
      <h2 className="page-title">Insights</h2>
      <div className="chip-strip">
        <button className="chip" onClick={() => scrollTo(hasBirthDate ? 'bioAge' : 'hero')}>
          <ScoreRing size={30} lineWidth={5} segments={[{ fraction: bioAge ? clamp01(0.5 + bioAge.delta / 20) : 0, color: bioColor }]} />
          <span>
            <small>Bio Age</small>
            <b>{bioAge ? N.decimal(bioAge.phenoAge) : '–'}</b>
          </span>
        </button>
        <button className="chip" onClick={() => scrollTo('inRange')}>
          <ScoreRing size={30} lineWidth={5} segments={[{ fraction: (overall.percentInRange ?? 0) / 100, color: inRangeColor }]} />
          <span>
            <small>In Range</small>
            <b>{overall.percentInRange !== null ? `${overall.percentInRange}%` : '–'}</b>
          </span>
        </button>
        <button className="chip" onClick={() => scrollTo('coverage')}>
          <ScoreRing size={30} lineWidth={5} segments={[{ fraction: overall.totalMarkers ? overall.testedMarkers / overall.totalMarkers : 0, color: VITALS }]} />
          <span>
            <small>Coverage</small>
            <b>
              {overall.testedMarkers} of {overall.totalMarkers}
            </b>
          </span>
        </button>
        <button className="chip" onClick={() => scrollTo('findings')}>
          <Icon name="clipboard" size={30} style={{ color: findingsCount ? SERIOUS : GOOD }} />
          <span>
            <small>Findings</small>
            <b>{findingsCount ? findingsCount : 'None'}</b>
          </span>
        </button>
      </div>

      {greeting}

      <section ref={(el) => (refs.current.hero = el)}>
        <div className="hero-visual">
          {bioAge ? (
            <GaugeArc progress={clamp01(0.5 + bioAge.delta / 20)} label={N.decimal(bioAge.phenoAge)} color={bioColor} />
          ) : (
            <ScoreRing
              size={200}
              lineWidth={22}
              label={overall.percentInRange !== null ? `${overall.percentInRange}%` : '–'}
              segments={[
                { fraction: overall.inRangeCount / tested, color: GOOD },
                { fraction: overall.outOfRangeCount / tested, color: SERIOUS },
              ]}
            />
          )}
        </div>
        <h2 className="story-headline">{N.heroHeadline(hero)}</h2>
        <p className="story-narrative">{N.heroNarrative(hero)}</p>
        {lastUpdated && <p className="story-footnote">Last result {formatIsoDate(lastUpdated)}</p>}
      </section>

      <div className="dash-columns">
      {!hasBirthDate && (
        <div className="card detail-card">
          <div className="card-eyebrow">Biological age</div>
          <div className="card-title-row">
            <h3>Add Your Date Of Birth</h3>
          </div>
          <p className="card-narrative">
            Your date of birth lets LabMate compare your blood markers with your calendar age. Add it in Settings to see an
            estimate.
          </p>
          <button className="secondary" onClick={onGoToSettings}>
            Go to Settings
          </button>
        </div>
      )}

      {bioAge && (bioAge.topContributors.length > 0 || bioAge.excludedNote) && (
        <section className="dash-section">
          <h3 className="section-title">What's Moving Your Age</h3>
          <p className="section-sub">
            Each marker is compared with where your estimate would land if that one value sat mid-range. The biggest gaps come
            first.
          </p>
          {bioAge.excludedNote && <p className="section-sub">{bioAge.excludedNote}</p>}
          <div className="list-card">
            {bioAge.topContributors.slice(0, 5).map((c) => {
              const col = c.contributionYears > 0 ? SERIOUS : GOOD
              return (
                <div key={c.key} className="list-row static contributor">
                  <div className="list-main">
                    <div className="list-name">{c.label}</div>
                    <div className="contrib-status" style={{ color: col }}>
                      {N.contributorStatus(c)}
                    </div>
                    <div className="list-sub">
                      {c.value} {c.unit}, typical {c.referenceDescription}
                    </div>
                    <div className="list-sub">
                      {c.direction === 'lower' ? 'Lowering' : 'Raising'} this toward that range would reduce its effect on the
                      estimate - it {c.tip}
                    </div>
                  </div>
                  <ScoreRing size={54} lineWidth={6} label={N.years(c.contributionYears)} segments={[{ fraction: clamp01(Math.abs(c.contributionYears) / 3), color: col }]} />
                </div>
              )
            })}
          </div>
          <p className="section-sub small">
            General information, not personal medical advice. Talk to your doctor before changing anything based on this.
          </p>
        </section>
      )}

      {hasBirthDate && (
        <section ref={(el) => (refs.current.bioAge = el)} className="dash-section">
          <div className="card detail-card">
            <div className="card-eyebrow">Estimated biological age</div>
            {bioAge ? (
              <>
                <div className="card-title-row">
                  <h3 style={{ color: bioColor }}>{N.signedYears(bioAge.delta)} years</h3>
                  <ScoreRing size={84} lineWidth={9} label={N.decimal(bioAge.phenoAge)} segments={[{ fraction: clamp01(0.5 + bioAge.delta / 20), color: bioColor }]} />
                </div>
                <DetailTable
                  rows={[
                    ['Biological age', N.decimal(bioAge.phenoAge)],
                    ['Calendar age', String(bioAge.chronologicalAge)],
                    ['As of', formatIsoDate(bioAge.asOfDate)],
                    ...(bioAge.phenoAgeCreatineAdjusted !== undefined ? ([['Creatine-adjusted', N.decimal(bioAge.phenoAgeCreatineAdjusted)]] as [string, string][]) : []),
                  ]}
                />
                <p className="card-narrative">{N.bioAgeNarrative(bioAge)}</p>
              </>
            ) : (
              <>
                <div className="card-title-row">
                  <h3>Need {missingBio.length} More Markers</h3>
                </div>
                <p className="card-narrative">Missing: {missingBio.map((m) => m.label).join(', ')}.</p>
              </>
            )}
            <div className="info-links">
              <button type="button" onClick={() => setShowInfo((v) => !v)}>
                ⓘ About this estimate
              </button>
              {bioAge?.phenoAgeCreatineAdjusted !== undefined && (
                <button type="button" onClick={() => setShowCreatine((v) => !v)}>
                  ⓘ Creatine adjustment
                </button>
              )}
            </div>
          </div>

          {showInfo && (
            <div className="card info-card">
              PhenoAge (Levine et al., 2018, published in <em>Aging</em>) was derived from about 9,900 adults in the NHANES III
              cohort and validated against 10-year all-cause mortality. It estimates biological age from nine routine blood
              markers (albumin, creatinine, glucose, hs-CRP, lymphocyte %, MCV, RDW, ALP, white cell count) plus your
              chronological age. Coefficients are checked against the paper and the BioAge R package. Treat the result as
              illustrative, not diagnostic or medical advice.{' '}
              <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5940111/" target="_blank" rel="noreferrer">
                Primary paper
              </a>
            </div>
          )}
          {profile.takesCreatineSupplement && !profile.sex && (
            <div className="card info-card" style={{ color: SERIOUS }}>
              Set your sex in Settings to enable the Cystatin C based adjustment. The eGFR equations differ by sex.
            </div>
          )}
          {showCreatine && bioAge?.phenoAgeCreatineAdjusted !== undefined && (
            <div className="card info-card">
              Your Cystatin C result gives an eGFR that does not depend on creatinine (about {bioAge.cystatinCEgfr?.toFixed(0)}{' '}
              mL/min/1.73m²
              {bioAge.cystatinCEgfr !== undefined && bioAge.cystatinCEgfr < 60
                ? ', below the usual 60 cutoff, which is worth discussing with your doctor'
                : ', in the normal range'}
              ). LabMate inverts the standard creatinine-based eGFR equation to find the creatinine your age and sex would be
              expected to produce at that same filtration rate (about {bioAge.normalisedCreatinine?.toFixed(0)} umol/L), and
              uses it in the same PhenoAge formula. The headline number keeps your real reading. Both eGFR equations (CKD-EPI
              2012 Cystatin C, CKD-EPI 2021 creatinine) are checked against published coefficients, but PhenoAge itself is only
              illustrative.{' '}
              <a href="https://www.kidney.org/professionals/gfr_calculator" target="_blank" rel="noreferrer">
                kidney.org published coefficients
              </a>
            </div>
          )}
          {!showCreatine &&
            bioAge &&
            bioAge.phenoAgeCreatineAdjusted === undefined &&
            bioAge.phenoAgeExcludingCreatinine !== undefined && (
              <div className="card info-card">
                The headline number uses your real creatinine reading, on purpose, because the published formula was validated
                against it. For reference only: if creatinine sat mid-range, the same formula would give{' '}
                {N.decimal(bioAge.phenoAgeExcludingCreatinine)}, about{' '}
                {N.years(bioAge.phenoAge - bioAge.phenoAgeExcludingCreatinine)} years lower. A Cystatin C result would allow a
                better grounded adjustment; see the Test Plan tab.
              </div>
            )}
        </section>
      )}

      <section ref={(el) => (refs.current.inRange = el)} className="dash-section">
        <h3 className="section-title">Overview</h3>
        <div className="card detail-card">
          <div className="card-eyebrow">In range, of tested</div>
          <div className="card-title-row">
            <h3 style={{ color: overall.testedMarkers > 0 ? inRangeColor : undefined }}>
              {overall.outOfRangeCount === 0 && overall.testedMarkers > 0
                ? 'All In Range'
                : overall.percentInRange !== null
                  ? `${overall.percentInRange}% In Range`
                  : 'No Results'}
            </h3>
            <ScoreRing
              size={90}
              lineWidth={10}
              label={overall.percentInRange !== null ? `${overall.percentInRange}%` : '–'}
              segments={[
                { fraction: overall.inRangeCount / tested, color: GOOD },
                { fraction: overall.outOfRangeCount / tested, color: SERIOUS },
              ]}
            />
          </div>
          <DetailTable
            rows={[
              ['In range', String(overall.inRangeCount)],
              ['Outside range', String(overall.outOfRangeCount)],
              ['Markers with data', `${overall.testedMarkers} of ${overall.totalMarkers}`],
              ['Last result', lastUpdated ? formatIsoDate(lastUpdated) : 'None yet'],
            ]}
          />
          <p className="card-narrative">{N.overallNarrative(overall, lastUpdated)}</p>
          <button type="button" className="link-btn" onClick={() => onGoToMarkers()}>
            View all markers
          </button>
        </div>
      </section>

      <section ref={(el) => (refs.current.coverage = el)} className="dash-section">
        <h3 className="section-title">Coverage By Category</h3>
        <p className="section-sub">{N.coverageNarrative(overall)}</p>
        <div className="list-card">
          {byCategory.map((c) => {
            const style = CATEGORY_STYLE[c.category]
            const t = Math.max(c.testedMarkers, 1)
            return (
              <button key={c.category} className="list-row" onClick={() => onGoToMarkers(c.category)}>
                <Icon name={style.icon} className="plan-icon" style={{ color: style.color }} />
                <div className="list-main">
                  <div className="list-name">{c.label}</div>
                  <div className="list-sub">{N.categoryNarrative(c)}</div>
                  <div className="list-sub">
                    {c.testedMarkers} of {c.totalMarkers} tested
                  </div>
                </div>
                <ScoreRing
                  size={48}
                  lineWidth={6}
                  label={c.percentInRange !== null ? `${c.percentInRange}%` : '–'}
                  segments={
                    c.testedMarkers > 0
                      ? [
                          { fraction: c.inRangeCount / t, color: style.color },
                          { fraction: c.outOfRangeCount / t, color: SERIOUS },
                        ]
                      : []
                  }
                />
                <Icon name="chevronRight" className="chev" />
              </button>
            )
          })}
        </div>
      </section>

      <section ref={(el) => (refs.current.findings = el)} className="dash-section">
        <Findings results={results} onGoToMarkers={onGoToMarkers} />
      </section>
      </div>
    </div>
  )
}
