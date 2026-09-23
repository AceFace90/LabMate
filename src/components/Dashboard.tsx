import { useState } from 'react'
import { computeBioAge, isBioAgeAvailable } from '../lib/bioAge'
import { formatIsoDate } from '../lib/dates'
import { firstNameOf, timeOfDayGreeting } from '../lib/greeting'
import { coverageByCategory, lastUpdatedDate, latestResultByMarker, overallCoverage } from '../lib/healthScore'
import type { MarkerResult, Profile } from '../types'
import { Findings } from './Findings'

interface Props {
  results: MarkerResult[]
  profile: Profile
  /** Google display name, used only when no profile.name has been set. */
  nameFallback: string | null
  onGoToUpload: () => void
  onGoToSettings: () => void
}

export function Dashboard({ results, profile, nameFallback, onGoToUpload, onGoToSettings }: Props) {
  const [showBioAgeInfo, setShowBioAgeInfo] = useState(false)
  const [showCreatineInfo, setShowCreatineInfo] = useState(false)
  const overall = overallCoverage(results, profile.sex)
  const lastUpdated = lastUpdatedDate(results)
  const byCategory = coverageByCategory(results, profile.sex)
  const latest = latestResultByMarker(results)
  const bioAge = profile.birthDate
    ? computeBioAge(latest, profile.birthDate, { takesCreatineSupplement: profile.takesCreatineSupplement, sex: profile.sex })
    : null
  const firstName = firstNameOf(profile.name, nameFallback)

  const greeting = (
    <div style={{ marginBottom: 16 }}>
      <div className="caveat" style={{ fontSize: 14 }}>{timeOfDayGreeting()},</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{firstName} 👋</div>
    </div>
  )

  if (results.length === 0) {
    return (
      <div>
        {greeting}
        <div className="card upload-drop">
          <p>No results yet. Import a pathology PDF to get started.</p>
          <button className="primary" onClick={onGoToUpload}>
            Import a PDF
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {greeting}
      <div className="grid cols-3">
        <div className="card stat-tile">
          <div className="label">Markers with data</div>
          <div className="value">
            {overall.testedMarkers}
            <span className="value small"> / {overall.totalMarkers}</span>
          </div>
          <div className="delta">
            {lastUpdated ? `Last result ${formatIsoDate(lastUpdated)}` : 'No results yet'}
          </div>
          <div className="caveat">Everything else is a tracked gap - see below.</div>
        </div>
        <div className="card stat-tile">
          <div className="label">In range (of tested)</div>
          <div className="value">{overall.percentInRange ?? '—'}%</div>
          {overall.testedMarkers > 0 && (
            <div
              className="delta"
              style={{ color: overall.outOfRangeCount > 0 ? 'var(--status-serious)' : 'var(--status-good)' }}
            >
              {overall.outOfRangeCount > 0
                ? `${overall.outOfRangeCount} marker${overall.outOfRangeCount === 1 ? '' : 's'} out of range`
                : 'All tested markers in range'}
            </div>
          )}
        </div>
        <div className="card stat-tile">
          <div className="label">
            Estimated biological age{' '}
            <button
              type="button"
              className="info-tip"
              aria-expanded={showBioAgeInfo}
              aria-label="About this estimate"
              onClick={() => setShowBioAgeInfo((v) => !v)}
            >
              ⓘ
            </button>
          </div>
          {!profile.birthDate ? (
            <div>
              <div className="caveat" style={{ marginBottom: 4 }}>Set your date of birth in Settings to see this.</div>
              <button className="secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onGoToSettings}>
                Go to Settings
              </button>
            </div>
          ) : bioAge && isBioAgeAvailable(bioAge) ? (
            <>
              <div className="value">{bioAge.phenoAge.toFixed(1)}</div>
              <div className="delta" style={{ color: bioAge.delta <= 0 ? 'var(--status-good)' : 'var(--status-serious)' }}>
                {bioAge.delta <= 0 ? '−' : '+'}
                {Math.abs(bioAge.delta).toFixed(1)} yrs vs chronological age ({bioAge.chronologicalAge}) as of{' '}
                {formatIsoDate(bioAge.asOfDate)}
              </div>
              {bioAge.phenoAgeCreatineAdjusted !== undefined && (
                <div
                  className="delta"
                  style={{
                    marginTop: 4,
                    color: bioAge.phenoAgeCreatineAdjusted < bioAge.phenoAge ? 'var(--status-good)' : 'var(--status-serious)',
                  }}
                >
                  Creatine-adjusted: <strong>{bioAge.phenoAgeCreatineAdjusted.toFixed(1)}</strong>{' '}
                  <button
                    type="button"
                    className="info-tip"
                    aria-expanded={showCreatineInfo}
                    aria-label="How the creatine-adjusted figure is derived"
                    onClick={() => setShowCreatineInfo((v) => !v)}
                  >
                    ⓘ
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="value small">Need {bioAge?.missing.length} more markers</div>
              <div className="caveat">Missing: {bioAge?.missing.map((m) => m.label).join(', ')}</div>
            </>
          )}
        </div>
      </div>

      {profile.birthDate && (
        <>
          {showBioAgeInfo && (
            <div className="card" style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5 }}>
              PhenoAge (Levine et al., 2018, published in <em>Aging</em>) - derived from ~9,900 adults in the NHANES
              III cohort and validated against 10-year all-cause mortality risk. Estimates biological age from 9
              routine blood markers (albumin, creatinine, glucose, hs-CRP, lymphocyte %, MCV, RDW, ALP, white cell
              count) plus your chronological age. See the{' '}
              <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5940111/" target="_blank" rel="noreferrer">
                primary paper
              </a>
              . This app's implementation is reproduced from general knowledge of the published coefficients, not
              independently re-derived or audited line-by-line against it here - treat the result as illustrative,
              not diagnostic or medical advice.
            </div>
          )}

          {profile.takesCreatineSupplement && !profile.sex && (
            <div className="card" style={{ marginTop: 12, fontSize: 12, color: 'var(--status-serious)' }}>
              Set your sex in Settings to enable the Cystatin C-based adjustment above - the eGFR equations differ
              by sex.
            </div>
          )}

          {showCreatineInfo &&
            bioAge &&
            isBioAgeAvailable(bioAge) &&
            bioAge.phenoAgeCreatineAdjusted !== undefined && (
              <div className="card" style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5 }}>
                How the creatine-adjusted figure is derived: your Cystatin C result gives an eGFR that doesn't
                depend on creatinine at all (~{bioAge.cystatinCEgfr?.toFixed(0)} mL/min/1.73m²
                {bioAge.cystatinCEgfr !== undefined && bioAge.cystatinCEgfr < 60
                  ? ', below the usual 60 cutoff - worth discussing with your doctor'
                  : ', normal range'}
                ). We invert the standard creatinine-based eGFR equation to find the creatinine your age and sex
                would be expected to produce at that same filtration rate (~{bioAge.normalisedCreatinine?.toFixed(0)}{' '}
                umol/L, vs your actual reading) - that normalised creatinine replaces your real reading in the same
                PhenoAge formula to get the figure above. The headline number keeps using your real, unmodified
                reading. Both eGFR equations (CKD-EPI 2012 Cystatin C, CKD-EPI 2021 creatinine) are verified against{' '}
                <a href="https://www.kidney.org/professionals/gfr_calculator" target="_blank" rel="noreferrer">
                  kidney.org's published coefficients
                </a>
                , so the adjustment itself is exact algebra - but PhenoAge is only illustrative, not diagnostic.
              </div>
            )}

          {!showCreatineInfo &&
            bioAge &&
            isBioAgeAvailable(bioAge) &&
            bioAge.phenoAgeCreatineAdjusted === undefined &&
            bioAge.phenoAgeExcludingCreatinine !== undefined && (
              <div className="card" style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5 }}>
                The headline number above still uses your real creatinine reading, on purpose - the published
                formula was validated against actual serum creatinine, and we won't substitute an unverified
                "corrected" value into it. For reference only: if creatinine sat in the middle of its normal range
                instead, this same formula would give <strong>{bioAge.phenoAgeExcludingCreatinine.toFixed(1)}</strong>{' '}
                - about {Math.abs(bioAge.phenoAge - bioAge.phenoAgeExcludingCreatinine).toFixed(1)} years lower. Want
                a more grounded adjustment instead of this placeholder? Add a Cystatin C result - see the Test Plan
                tab, it's now listed under Private tests.
              </div>
            )}
        </>
      )}

      <Findings results={results} />

      {bioAge && isBioAgeAvailable(bioAge) && (bioAge.topContributors.length > 0 || bioAge.excludedNote) && (
        <div className="card category-section" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>What's most influencing your biological age</h3>
          <p className="cat-desc">
            For each marker below, we compare your estimate to what it would be if that one value sat in the middle
            of its normal range, everything else unchanged - the biggest gaps are ranked first.
          </p>
          {bioAge.excludedNote && <p className="caveat">{bioAge.excludedNote}</p>}
          <div className="contributor-list">
            {bioAge.topContributors.slice(0, 5).map((c) => (
              <div key={c.key} className="contributor-row">
                <div className="contributor-main">
                  <strong>{c.label}</strong>
                  <span
                    className="contributor-impact"
                    style={{ color: c.contributionYears > 0 ? 'var(--status-serious)' : 'var(--status-good)' }}
                  >
                    {c.contributionYears > 0 ? '+' : '−'}
                    {Math.abs(c.contributionYears).toFixed(1)} yrs
                  </span>
                </div>
                <div className="caveat">
                  Your value: {c.value} {c.unit} (normal: {c.referenceDescription}). {c.direction === 'lower' ? 'Lowering' : 'Raising'}{' '}
                  this toward that range would reduce its effect on the estimate - it {c.tip}
                </div>
              </div>
            ))}
          </div>
          <div className="caveat" style={{ marginTop: 8 }}>
            General information, not personalised medical advice - talk to your doctor before changing anything based
            on this.
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Coverage by category</h3>
        <div className="grid cols-3">
          {byCategory.map((c) => (
            <div key={c.category} className="stat-tile">
              <div className="label">{c.label}</div>
              <div className="value small">
                {c.testedMarkers}/{c.totalMarkers} tested
              </div>
              {c.testedMarkers > 0 && (
                <div className="caveat">{c.percentInRange}% in range</div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        Roadmap: staying focused on blood/pathology tracking and biological age - next up is a productised build
        (cloud sync via Firestore, GitHub Pages hosting, iOS app). This build is the local-only prototype.
      </div>

    </div>
  )
}
