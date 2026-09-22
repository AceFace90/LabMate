import { useEffect, useMemo, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { MarkerDetail } from './components/MarkerDetail'
import { MarkerGrid } from './components/MarkerGrid'
import { Settings } from './components/Settings'
import { TestPlan } from './components/TestPlan'
import { UploadFlow } from './components/UploadFlow'
import { deriveComputedMarkers } from './lib/derivedMarkers'
import {
  clearAllData,
  loadCustomMarkers,
  loadProfile,
  loadResults,
  mergeResults,
  removeResult,
  saveCustomMarkers,
  saveProfile,
  saveResults,
  updateResult,
} from './lib/storage'
import type { CustomMarker, MarkerResult, Profile } from './types'

type Tab = 'dashboard' | 'markers' | 'testplan' | 'upload' | 'settings'

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

export default function App() {
  const [results, setResults] = useState<MarkerResult[]>(() => loadResults())
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(() => loadCustomMarkers())
  const [tab, setTab] = useState<Tab>(results.length ? 'dashboard' : 'upload')
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null)

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
    setResults(merged)
    saveResults(merged)
    setTab('dashboard')
  }

  function handleAddManualResult(input: Omit<MarkerResult, 'id' | 'createdAt'>) {
    const withMeta: MarkerResult = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const merged = mergeResults(results, [withMeta])
    setResults(merged)
    saveResults(merged)
  }

  function handleDeleteResult(id: string) {
    const next = removeResult(results, id)
    setResults(next)
    saveResults(next)
  }

  function handleEditResult(id: string, patch: { date: string; value: number; displayValue: string }) {
    const next = updateResult(results, id, patch)
    setResults(next)
    saveResults(next)
  }

  function handleAddCustomMarker(input: { label: string; unit: string }) {
    const key = `custom_${slugify(input.label)}`
    if (customMarkers.some((m) => m.key === key)) return
    const marker: CustomMarker = { key, label: input.label, unit: input.unit, createdAt: new Date().toISOString() }
    const next = [...customMarkers, marker]
    setCustomMarkers(next)
    saveCustomMarkers(next)
  }

  function handleSaveProfile(next: Profile) {
    setProfile(next)
    saveProfile(next)
  }

  function handleDeleteAllData() {
    clearAllData()
    setResults([])
    setProfile({ birthDate: null, sex: null })
    setCustomMarkers([])
    setSelectedMarker(null)
    setTab('upload')
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>LabMate</h1>
          <div className="subtitle">Your pathology results, tracked over time - stored only in this browser.</div>
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
        <Settings profile={profile} onSaveProfile={handleSaveProfile} onDeleteAllData={handleDeleteAllData} />
      )}
    </>
  )
}
