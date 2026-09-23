import { useEffect, useMemo, useState } from 'react'
import { Dashboard } from './components/Dashboard'
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
  hasOnboarded,
  loadCustomMarkers,
  loadProfile,
  loadResults,
  mergeResults,
  removeResult,
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
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export default function App() {
  const { user, initializing } = useAuthUser()
  const [results, setResults] = useState<MarkerResult[]>(() => loadResults())
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(() => loadCustomMarkers())
  const [tab, setTab] = useState<Tab>(results.length ? 'dashboard' : 'upload')
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null)
  const [cloudReady, setCloudReady] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [dismissedSplash, setDismissedSplash] = useState(() => hasOnboarded())

  // Cloud sync is opt-in per browser: signing in merges this browser's local data
  // into the account (once), after which Firestore is the source of truth and the
  // local copy is cleared. Signing out drops back to whatever's now in local storage
  // (empty, post-migration) rather than leaving cloud data cached for the next person
  // on a shared device.
  useEffect(() => {
    if (!user) {
      setCloudReady(false)
      setResults(loadResults())
      setProfile(loadProfile())
      setCustomMarkers(loadCustomMarkers())
      return
    }
    let cancelled = false
    setCloudReady(false)
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
  }, [user])

  useEffect(() => {
    if (!user || !cloudReady) return
    const unsubResults = subscribeResults(user.uid, setResults)
    const unsubProfile = subscribeProfile(user.uid, setProfile)
    const unsubCustomMarkers = subscribeCustomMarkers(user.uid, setCustomMarkers)
    return () => {
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

  function handleImport(newResults: MarkerResult[]) {
    const merged = mergeResults(results, newResults)
    if (user) {
      const added = merged.filter((r) => !results.some((existing) => existing.id === r.id))
      for (const result of added) void saveResultCloud(user.uid, result)
    } else {
      setResults(merged)
      saveResults(merged)
    }
    setTab('dashboard')
  }

  function handleAddManualResult(input: Omit<MarkerResult, 'id' | 'createdAt'>) {
    const withMeta: MarkerResult = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const merged = mergeResults(results, [withMeta])
    if (user) {
      if (merged.length !== results.length + 1) return // exact duplicate, same as local path
      void saveResultCloud(user.uid, withMeta)
    } else {
      setResults(merged)
      saveResults(merged)
    }
  }

  function handleDeleteResult(id: string) {
    if (user) {
      void deleteResultCloud(user.uid, id)
    } else {
      const next = removeResult(results, id)
      setResults(next)
      saveResults(next)
    }
  }

  function handleEditResult(id: string, patch: { date: string; value: number; displayValue: string }) {
    if (user) {
      void updateResultCloud(user.uid, id, patch)
    } else {
      const next = updateResult(results, id, patch)
      setResults(next)
      saveResults(next)
    }
  }

  function handleAddCustomMarker(input: { label: string; unit: string }) {
    const key = `custom_${slugify(input.label)}`
    if (customMarkers.some((m) => m.key === key)) return
    const marker: CustomMarker = { key, label: input.label, unit: input.unit, createdAt: new Date().toISOString() }
    if (user) {
      void saveCustomMarkerCloud(user.uid, marker)
    } else {
      const next = [...customMarkers, marker]
      setCustomMarkers(next)
      saveCustomMarkers(next)
    }
  }

  function handleSaveProfile(next: Profile) {
    if (user) {
      void saveProfileCloud(user.uid, next)
    } else {
      setProfile(next)
      saveProfile(next)
    }
  }

  function handleDeleteAllData() {
    if (user) {
      void deleteAllCloudData(user.uid)
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

  async function handleSignOut() {
    await signOutUser()
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
  }

  function handleSkipSplash() {
    setOnboarded()
    setDismissedSplash(true)
  }

  if (initializing) {
    return <div className="app-header">Loading...</div>
  }

  // First-run only: existing local users (results.length > 0) or anyone signed in
  // never see this, so it never gets in the way of local mode's zero-friction start.
  if (!user && !dismissedSplash && results.length === 0) {
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
      <header className="app-header">
        <div>
          <h1>LabMate</h1>
          <div className="subtitle">
            {user
              ? `Signed in as ${user.email} - synced to your account.`
              : 'Your pathology results, tracked over time - stored only in this browser.'}
          </div>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button
          className={tab === 'markers' ? 'active' : ''}
          onClick={() => {
            setSelectedMarker(null)
            setTab('markers')
          }}
        >
          Markers
        </button>
        <button className={tab === 'testplan' ? 'active' : ''} onClick={() => setTab('testplan')}>
          Test Plan
        </button>
        <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>
          Import PDF
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          Settings
        </button>
      </nav>

      {tab === 'dashboard' && (
        <Dashboard
          results={displayResults}
          profile={profile}
          nameFallback={user?.displayName ?? null}
          onGoToUpload={() => setTab('upload')}
          onGoToSettings={() => setTab('settings')}
        />
      )}

      {tab === 'markers' &&
        (selectedMarker ? (
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
          <MarkerGrid
            results={displayResults}
            customMarkers={customMarkers}
            profile={profile}
            onSelectMarker={setSelectedMarker}
            onAddCustomMarker={handleAddCustomMarker}
          />
        ))}

      {tab === 'testplan' && <TestPlan results={displayResults} profile={profile} />}

      {tab === 'upload' && <UploadFlow onImport={handleImport} />}

      {tab === 'settings' && (
        <Settings
          profile={profile}
          onSaveProfile={handleSaveProfile}
          onDeleteAllData={handleDeleteAllData}
          user={user}
          migrating={migrating}
          authError={authError}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
          onDeleteAccount={handleDeleteAccount}
        />
      )}
    </>
  )
}
