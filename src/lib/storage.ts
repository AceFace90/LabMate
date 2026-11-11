import type { CustomMarker, MarkerResult, Profile } from '../types'

const RESULTS_KEY = 'labmate:results:v1'
const PROFILE_KEY = 'labmate:profile:v1'
const CUSTOM_MARKERS_KEY = 'labmate:customMarkers:v1'
const ONBOARDED_KEY = 'labmate:onboarded:v1'

// Pre-rename keys (app was called LabTrack). Read once as a fallback so existing
// browsers don't appear to lose their data after the rename.
const LEGACY_RESULTS_KEY = 'labtrack:results:v1'
const LEGACY_PROFILE_KEY = 'labtrack:profile:v1'
const LEGACY_CUSTOM_MARKERS_KEY = 'labtrack:customMarkers:v1'

function readWithLegacyFallback(key: string, legacyKey: string): string | null {
  const current = localStorage.getItem(key)
  if (current !== null) return current
  const legacy = localStorage.getItem(legacyKey)
  if (legacy !== null) {
    localStorage.setItem(key, legacy)
    localStorage.removeItem(legacyKey)
  }
  return legacy
}

export function loadResults(): MarkerResult[] {
  try {
    const raw = readWithLegacyFallback(RESULTS_KEY, LEGACY_RESULTS_KEY)
    return raw ? (JSON.parse(raw) as MarkerResult[]) : []
  } catch {
    return []
  }
}

export function saveResults(results: MarkerResult[]): void {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results))
}

const hasOperator = (r: MarkerResult) => /[<>]/.test(r.displayValue)

/** Same measurement: identical printed value, or the same number ("5.3" vs "5.30"). */
export function sameValue(a: MarkerResult, b: MarkerResult): boolean {
  if (a.displayValue.trim() === b.displayValue.trim()) return true
  if (a.value === null || b.value === null || hasOperator(a) || hasOperator(b)) return false
  return Math.abs(a.value - b.value) < 1e-6
}

const slot = (r: MarkerResult) => `${r.markerKey}|${r.date}`

export interface ImportConflict {
  incoming: MarkerResult
  existing: MarkerResult
}

export interface ImportClassification {
  /** Nothing stored for this marker on this date. */
  added: MarkerResult[]
  /** Already stored with the same value - nothing to do. */
  unchanged: MarkerResult[]
  /** Same marker and date already stored, but with a different value. */
  conflicts: ImportConflict[]
}

/** Sorts incoming results into new, already-imported, and differs-from-what's-stored. */
export function classifyImport(existing: MarkerResult[], incoming: MarkerResult[]): ImportClassification {
  const bySlot = new Map<string, MarkerResult[]>()
  for (const r of existing) bySlot.set(slot(r), [...(bySlot.get(slot(r)) ?? []), r])
  const out: ImportClassification = { added: [], unchanged: [], conflicts: [] }
  for (const r of incoming) {
    const stored = bySlot.get(slot(r)) ?? []
    if (stored.some((e) => sameValue(e, r))) out.unchanged.push(r)
    else if (stored.length > 0) out.conflicts.push({ incoming: r, existing: stored[0] })
    else {
      out.added.push(r)
      bySlot.set(slot(r), [r]) // a repeat of the same row within one report is "unchanged"
    }
  }
  return out
}

/** Adds new results, skipping ones already stored with the same marker, date and value. */
export function mergeResults(existing: MarkerResult[], incoming: MarkerResult[]): MarkerResult[] {
  const merged = [...existing]
  for (const r of incoming) {
    if (merged.some((e) => slot(e) === slot(r) && sameValue(e, r))) continue
    merged.push(r)
  }
  return merged
}

export function removeResult(results: MarkerResult[], id: string): MarkerResult[] {
  return results.filter((r) => r.id !== id)
}

export function updateResult(
  results: MarkerResult[],
  id: string,
  patch: Partial<Pick<MarkerResult, 'date' | 'value' | 'displayValue' | 'rangeLow' | 'rangeHigh' | 'rangeText' | 'unit'>>,
): MarkerResult[] {
  return results.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

export function loadCustomMarkers(): CustomMarker[] {
  try {
    const raw = readWithLegacyFallback(CUSTOM_MARKERS_KEY, LEGACY_CUSTOM_MARKERS_KEY)
    return raw ? (JSON.parse(raw) as CustomMarker[]) : []
  } catch {
    return []
  }
}

export function saveCustomMarkers(markers: CustomMarker[]): void {
  localStorage.setItem(CUSTOM_MARKERS_KEY, JSON.stringify(markers))
}

export function loadProfile(): Profile {
  try {
    const raw = readWithLegacyFallback(PROFILE_KEY, LEGACY_PROFILE_KEY)
    return raw ? (JSON.parse(raw) as Profile) : { birthDate: null, sex: null }
  } catch {
    return { birthDate: null, sex: null }
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function clearAllData(): void {
  localStorage.removeItem(RESULTS_KEY)
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(CUSTOM_MARKERS_KEY)
  localStorage.removeItem(LEGACY_RESULTS_KEY)
  localStorage.removeItem(LEGACY_PROFILE_KEY)
  localStorage.removeItem(LEGACY_CUSTOM_MARKERS_KEY)
}

/** Whether this browser has already been through the welcome splash (via Quick
 * Start, Skip, or Google sign-in) - controls whether it's shown again. Deliberately
 * separate from the profile data itself so it isn't wiped by clearAllData(). */
export function hasOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === '1'
}

export function setOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, '1')
}

export function exportAllData(): string {
  return JSON.stringify(
    { results: loadResults(), profile: loadProfile(), customMarkers: loadCustomMarkers() },
    null,
    2,
  )
}

// --- Per-user cloud snapshot cache -------------------------------------------
// Mirror of the last Firestore data seen for the signed-in user, so the app can
// paint instantly on load (before auth restores / listeners fire). Cleared on
// sign-out. Distinct from the local-only keys above, which hold signed-out data.
const CLOUD_CACHE_PREFIX = 'labmate:cloudCache:v1:'
const LAST_UID_KEY = 'labmate:lastUid:v1'

export interface CloudSnapshotCache {
  results: MarkerResult[]
  profile: Profile
  customMarkers: CustomMarker[]
}

export function getLastUid(): string | null {
  try {
    return localStorage.getItem(LAST_UID_KEY)
  } catch {
    return null
  }
}

export function loadCloudCache(): CloudSnapshotCache | null {
  try {
    const uid = getLastUid()
    if (!uid) return null
    const raw = localStorage.getItem(CLOUD_CACHE_PREFIX + uid)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CloudSnapshotCache>
    return {
      results: parsed.results ?? [],
      profile: parsed.profile ?? { birthDate: null, sex: null },
      customMarkers: parsed.customMarkers ?? [],
    }
  } catch {
    return null
  }
}

export function saveCloudCache(uid: string, cache: CloudSnapshotCache): void {
  try {
    localStorage.setItem(CLOUD_CACHE_PREFIX + uid, JSON.stringify(cache))
    localStorage.setItem(LAST_UID_KEY, uid)
  } catch {
    // Quota or private-mode failure: the cache is only an optimisation.
  }
}

export function clearCloudCache(): void {
  try {
    const uid = getLastUid()
    if (uid) localStorage.removeItem(CLOUD_CACHE_PREFIX + uid)
    localStorage.removeItem(LAST_UID_KEY)
  } catch {
    // ignore
  }
}

/** True if signed-out/local-only storage holds anything worth migrating. */
export function hasLocalOnlyData(): boolean {
  const p = loadProfile()
  const profileHasData = !!(p.name || p.birthDate || p.sex || p.takesCreatineSupplement || p.useLabRanges || p.theme)
  return loadResults().length > 0 || loadCustomMarkers().length > 0 || profileHasData
}
