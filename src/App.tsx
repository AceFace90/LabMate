import { useEffect, useMemo, useRef, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Icon } from './components/Icon'
import { MarkerDetail } from './components/MarkerDetail'
import { MarkerGrid } from './components/MarkerGrid'
import { Settings } from './components/Settings'
import { Splash } from './components/Splash'
import { TestPlan } from './components/TestPlan'
import { UploadFlow } from './components/UploadFlow'
import {
  deleteAccountCloud,
  deleteAllCloudData,
  deleteResultCloud,
  migrateLocalDataToCloud,
  saveCustomMarkerCloud,
  saveProfileCloud,
  saveResultCloud,
  subscribeCustomMarkers,
  subscribeProfile,
  subscribeResults,
  updateResultCloud,
} from './lib/cloudStorage'
import { deriveComputedMarkers } from './lib/derivedMarkers'
import { signInWithGoogle, signOutUser } from './lib/firebase'
import {
  clearAllData,
  clearCloudCache,
  getLastUid,
  hasLocalOnlyData,
  hasOnboarded,
  loadCloudCache,
  loadCustomMarkers,
  loadProfile,
  loadResults,
  mergeResults,
  removeResult,
  saveCloudCache,
  saveCustomMarkers,
  saveProfile,
  saveResults,
  setOnboarded,
  updateResult,
} from './lib/storage'
import type { CustomMarker, MarkerResult, Profile } from './types'
import { useAuthUser } from './lib/useAuthUser'

type Tab = 'dashboard' | 'markers' | 'testplan' | 'upload' | 'settings'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// Mirrors GymMate: no persistent app-name header - each non-Home tab gets its
// own accent-coloured title instead (Dashboard's greeting plays that role there).
function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2 className="page-title">
        {title}
      </h2>
      <p className="page-subtitle">{subtitle}</p>
    </div>
  )
}

export default function App() {
  const { user, initializing } = useAuthUser()
  // If a user was signed in last time, paint their cached cloud data immediately
  // (before auth restores); otherwise fall back to the local-only storage.
  const [initialCache] = useState(() => loadCloudCache())
  const [results, setResults] = useState<MarkerResult[]>(() => initialCache?.results ?? loadResults())
  const [profile, setProfile] = useState<Profile>(() => initialCache?.profile ?? loadProfile())
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(
    () => initialCache?.customMarkers ?? loadCustomMarkers(),
  )
  const cacheRef = useRef({ results, profile, customMarkers })
  const cacheTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Dev-only deep link (?tab=testplan) so screenshots can open a tab directly.
  const [tab, setTab] = useState<Tab>(
    () => ((import.meta.env.DEV && new URLSearchParams(location.search).get('tab')) as Tab) || 'dashboard',
  )
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null)
  const [scrollToCategory, setScrollToCategory] = useState<string | null>(null)

  const goToMarkers = (categoryKey?: string) => {
    setSelectedMarker(null)
    setTab('markers')
    setScrollToCategory(categoryKey ?? null)
  }

  useEffect(() => {
    if (tab !== 'markers' || !scrollToCategory) return
    const el = document.getElementById(`category-${scrollToCategory}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setScrollToCategory(null)
  }, [tab, scrollToCategory])
  const [cloudReady, setCloudReady] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [dismissedSplash, setDismissedSplash] = useState(() => hasOnboarded() || (import.meta.env.DEV && new URLSearchParams(location.search).has('tab')))
  // Transient override so "Log out" can always return to the splash screen, even
  // for a returning local user with data (who wouldn't otherwise see it again).
  const [forceSplash, setForceSplash] = useState(false)

  // Cloud writes are fire-and-forget from the UI's perspective, but a rejected
  // promise must still surface somewhere - otherwise a failed write looks
  // indistinguishable from "did nothing" (this is what silently broke profile
  // saves before ignoreUndefinedProperties was set on the Firestore client).
  function reportCloudError(err: unknown) {
    console.error('Cloud write failed', err)
    setAuthError('Could not save your change. Please try again.')
  }

  // Cloud sync is opt-in per browser. Signed in, Firestore (with its persistent
  // IndexedDB cache) is the source of truth and listeners attach right away; a
  // per-user snapshot in localStorage lets the first paint show data before auth
  // even restores. Local-only data from signed-out use is merged into the account
  // once (only if any exists) and then cleared. Signing out clears the snapshot so
  // a shared device doesn't keep showing the previous user's data.
  useEffect(() => {
    if (initializing) return // keep the cached first paint until auth settles
    if (!user) {
      clearCloudCache()
      setCloudReady(false)
      setResults(loadResults())
      setProfile(loadProfile())
      setCustomMarkers(loadCustomMarkers())
      return
    }
    const lastUid = getLastUid()
    if (lastUid && lastUid !== user.uid) {
      // Different account than the one cached: don't show their data.
      clearCloudCache()
      setResults([])
      setProfile({ birthDate: null, sex: null })
      setCustomMarkers([])
    }
    setCloudReady(false)
    if (!hasLocalOnlyData()) {
      setCloudReady(true)
      return
    }
    // Migration runs while cached data stays visible.
    let cancelled = false
    setMigrating(true)
    migrateLocalDataToCloud(user)
      .then(() => {
        if (!cancelled) setCloudReady(true)
      })
      .catch((err) => {
        console.error('Cloud sync failed', err)
        if (!cancelled) setAuthError('Could not sync to the cloud. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setMigrating(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, initializing])

  useEffect(() => {
    if (!user || !cloudReady) return
    const uid = user.uid
    // Mirror listener data into the localStorage snapshot (debounced).
    const persist = () => {
      clearTimeout(cacheTimer.current)
      cacheTimer.current = setTimeout(() => saveCloudCache(uid, cacheRef.current), 300)
    }
    const unsubResults = subscribeResults(uid, (r) => {
      cacheRef.current.results = r
      setResults(r)
      persist()
    })
    const unsubProfile = subscribeProfile(uid, (p) => {
      cacheRef.current.profile = p
      setProfile(p)
      persist()
    })
    const unsubCustomMarkers = subscribeCustomMarkers(uid, (m) => {
      cacheRef.current.customMarkers = m
      setCustomMarkers(m)
      persist()
    })
    return () => {
      clearTimeout(cacheTimer.current)
      unsubResults()
      unsubProfile()
      unsubCustomMarkers()
    }
  }, [user, cloudReady])

  useEffect(() => {
    const theme = profile.theme ?? 'auto'
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [profile.theme])

  // Values computed from other results (e.g. Lymphocytes % from Lymphocytes/WCC) are
  // derived fresh from the stored data on every change, rather than persisted, so they
  // can never go stale after a source value is edited or deleted.
  const displayResults = useMemo(() => [...results, ...deriveComputedMarkers(results)], [results])

  function handleImport(newResults: MarkerResult[], removeIds: string[] = []) {
    const base = results.filter((r) => !removeIds.includes(r.id))
    const merged = mergeResults(base, newResults)
    if (user) {
      for (const id of removeIds) deleteResultCloud(user.uid, id).catch(reportCloudError)
      const added = merged.filter((r) => !results.some((existing) => existing.id === r.id))
      for (const result of added) saveResultCloud(user.uid, result).catch(reportCloudError)
    } else {
      setResults(merged)
      saveResults(merged)
    }
    setTab('dashboard')
  }

  function handleAddManualResult(input: Omit<MarkerResult, 'id' | 'createdAt'>) {
    const withMeta: MarkerResult = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    const merged = mergeResults(results, [withMeta])
    if (user) {
      if (merged.length !== results.length + 1) return // exact duplicate, same as local path
      saveResultCloud(user.uid, withMeta).catch(reportCloudError)
    } else {
      setResults(merged)
      saveResults(merged)
    }
  }

  function handleDeleteResult(id: string) {
    if (user) {
      deleteResultCloud(user.uid, id).catch(reportCloudError)
    } else {
      const next = removeResult(results, id)
      setResults(next)
      saveResults(next)
    }
  }

  function handleEditResult(
    id: string,
    patch: Pick<MarkerResult, 'date' | 'displayValue' | 'rangeLow' | 'rangeHigh' | 'rangeText'> & { value: number },
  ) {
    if (user) {
      updateResultCloud(user.uid, id, patch).catch(reportCloudError)
    } else {
      const next = updateResult(results, id, patch)
      setResults(next)
      saveResults(next)
    }
  }

  function handleAddCustomMarker(input: { label: string; unit: string }) {
    const key = `custom_${slugify(input.label)}`
    if (customMarkers.some((m) => m.key === key)) return
    const marker: CustomMarker = {
      key,
      label: input.label,
      unit: input.unit,
      createdAt: new Date().toISOString(),
    }
    if (user) {
      saveCustomMarkerCloud(user.uid, marker).catch(reportCloudError)
    } else {
      const next = [...customMarkers, marker]
      setCustomMarkers(next)
      saveCustomMarkers(next)
    }
  }

  function handleSaveProfile(next: Profile) {
    if (user) {
      saveProfileCloud(user.uid, next).catch(reportCloudError)
    } else {
      setProfile(next)
      saveProfile(next)
    }
  }

  function handleDeleteAllData() {
    if (user) {
      deleteAllCloudData(user.uid).catch(reportCloudError)
    } else {
      clearAllData()
      setResults([])
      setProfile({ birthDate: null, sex: null })
      setCustomMarkers([])
    }
    setSelectedMarker(null)
    setTab('upload')
  }

  async function handleSignIn() {
    setAuthError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('Sign-in failed', err)
      setAuthError('Sign-in failed. Please try again.')
    }
  }

  // Always returns to the splash/welcome screen, whether the browser was signed
  // into Google or just running in local Quick Start mode - mirrors GymMate's
  // "Log Out" button, which isn't conditional on how you got logged in.
  async function handleLogOut() {
    setAuthError(null)
    if (user) {
      try {
        await signOutUser()
      } catch (err) {
        console.error('Sign-out failed', err)
        setAuthError('Sign-out failed. Please try again.')
        return
      }
    }
    setForceSplash(true)
  }

  async function handleDeleteAccount() {
    if (!user) return
    setAuthError(null)
    try {
      await deleteAccountCloud(user)
    } catch (err) {
      console.error('Account deletion failed', err)
      setAuthError('Could not delete your account. Please try again.')
    }
  }

  function handleQuickStart(name: string) {
    handleSaveProfile({ ...profile, name })
    setOnboarded()
    setDismissedSplash(true)
    setForceSplash(false)
  }

  function handleSkipSplash() {
    setOnboarded()
    setDismissedSplash(true)
    setForceSplash(false)
  }

  if (initializing && !initialCache) {
    return <div style={{ padding: 20 }}>Loading...</div>
  }

  // First-run only: existing local users (results.length > 0) or anyone signed in
  // never see this, so it never gets in the way of local mode's zero-friction start.
  // forceSplash overrides that once, for the explicit "Log out" action.
  if (!user && (forceSplash || (!dismissedSplash && results.length === 0))) {
    return (
      <Splash
        migrating={migrating}
        authError={authError}
        onQuickStart={handleQuickStart}
        onSkip={handleSkipSplash}
        onSignIn={handleSignIn}
      />
    )
  }

  return (
    <>
      <main className="page">
        {tab === 'dashboard' && (
          <Dashboard
            results={displayResults}
            profile={profile}
            nameFallback={user?.displayName ?? null}
            onGoToUpload={() => setTab('upload')}
            onGoToSettings={() => setTab('settings')}
            onGoToMarkers={goToMarkers}
          />
        )}

        {tab === 'markers' && (
          <div className="content-column">
          {selectedMarker ? (
            <MarkerDetail
              markerKey={selectedMarker}
              results={displayResults}
              customMarkers={customMarkers}
              onBack={() => setSelectedMarker(null)}
              onAddManualResult={handleAddManualResult}
              onDeleteResult={handleDeleteResult}
              onEditResult={handleEditResult}
            />
          ) : (
            <>
              <PageHeader title="Markers" subtitle="Every marker you've imported or logged manually." />
              <MarkerGrid
                results={displayResults}
                customMarkers={customMarkers}
                profile={profile}
                onSelectMarker={setSelectedMarker}
                onAddCustomMarker={handleAddCustomMarker}
              />
            </>
          )}
          </div>
        )}

        {tab === 'testplan' && (
          <div className="content-column">
            <PageHeader title="Test Plan" subtitle="What's due next, based on your results and their usual cadence." />
            <TestPlan results={displayResults} profile={profile} />
          </div>
        )}

        {tab === 'upload' && (
          <>
            <PageHeader title="Import PDF" subtitle="Add a new pathology report - import the PDF or paste its text." />
            <UploadFlow existing={results} onImport={handleImport} />
          </>
        )}

        {tab === 'settings' && (
          <div className="form-column">
            <PageHeader title="Settings" subtitle="Your profile, appearance and account." />
            <Settings
              profile={profile}
              onSaveProfile={handleSaveProfile}
              onDeleteAllData={handleDeleteAllData}
              user={user}
              migrating={migrating}
              authError={authError}
              onSignIn={handleSignIn}
              onLogOut={handleLogOut}
              onDeleteAccount={handleDeleteAccount}
            />
          </div>
        )}
      </main>

      <nav className="tabs">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          <Icon name="heart" className="tab-icon" />
          <span className="tab-label">Insights</span>
        </button>
        <button
          className={tab === 'markers' ? 'active' : ''}
          onClick={() => {
            setSelectedMarker(null)
            setTab('markers')
          }}
        >
          <Icon name="drop" className="tab-icon" />
          <span className="tab-label">Markers</span>
        </button>
        <button className={tab === 'testplan' ? 'active' : ''} onClick={() => setTab('testplan')}>
          <Icon name="calendar" className="tab-icon" />
          <span className="tab-label">Test Plan</span>
        </button>
        <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>
          <Icon name="doc" className="tab-icon" />
          <span className="tab-label">Import</span>
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          <Icon name="gear" className="tab-icon" />
          <span className="tab-label">Settings</span>
        </button>
      </nav>
    </>
  )
}
