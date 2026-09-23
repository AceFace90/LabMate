import type { User } from 'firebase/auth'
import { deleteUser } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import type { CustomMarker, MarkerResult, Profile } from '../types'
import { db } from './firebase'
import { clearAllData, loadCustomMarkers, loadProfile, loadResults, mergeResults } from './storage'

function resultsCol(uid: string) {
  return collection(db, 'users', uid, 'results')
}

function customMarkersCol(uid: string) {
  return collection(db, 'users', uid, 'customMarkers')
}

function userDoc(uid: string) {
  return doc(db, 'users', uid)
}

export function subscribeResults(uid: string, callback: (results: MarkerResult[]) => void) {
  return onSnapshot(resultsCol(uid), (snap) => {
    callback(snap.docs.map((d) => d.data() as MarkerResult))
  })
}

export function subscribeCustomMarkers(uid: string, callback: (markers: CustomMarker[]) => void) {
  return onSnapshot(customMarkersCol(uid), (snap) => {
    callback(snap.docs.map((d) => d.data() as CustomMarker))
  })
}

export function subscribeProfile(uid: string, callback: (profile: Profile) => void) {
  return onSnapshot(userDoc(uid), (snap) => {
    const data = snap.data()
    callback({
      birthDate: data?.birthDate ?? null,
      sex: data?.sex ?? null,
      takesCreatineSupplement: data?.takesCreatineSupplement,
      theme: data?.theme,
    })
  })
}

export async function saveResultCloud(uid: string, result: MarkerResult): Promise<void> {
  await setDoc(doc(resultsCol(uid), result.id), result)
}

export async function deleteResultCloud(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(resultsCol(uid), id))
}

export async function updateResultCloud(
  uid: string,
  id: string,
  patch: Partial<Pick<MarkerResult, 'date' | 'value' | 'displayValue' | 'rangeLow' | 'rangeHigh' | 'rangeText' | 'unit'>>,
): Promise<void> {
  await updateDoc(doc(resultsCol(uid), id), patch)
}

export async function saveCustomMarkerCloud(uid: string, marker: CustomMarker): Promise<void> {
  await setDoc(doc(customMarkersCol(uid), marker.key), marker)
}

export async function saveProfileCloud(uid: string, profile: Profile): Promise<void> {
  await setDoc(userDoc(uid), { ...profile, updatedAt: serverTimestamp() }, { merge: true })
}

/** Runs once right after sign-in. Merges any data from this browser's local-only
 * storage into the cloud account (deduping against whatever's already there via
 * the same fingerprint used for local imports), then clears the local copy so it
 * can't be re-migrated or drift out of sync on a later sign-in. */
export async function migrateLocalDataToCloud(user: User): Promise<void> {
  const uid = user.uid
  const localResults = loadResults()
  const localCustomMarkers = loadCustomMarkers()
  const localProfile = loadProfile()

  const userSnap = await getDoc(userDoc(uid))
  const isFirstSignIn = !userSnap.exists()

  const [existingResultsSnap, existingCustomMarkersSnap] = await Promise.all([
    getDocs(resultsCol(uid)),
    getDocs(customMarkersCol(uid)),
  ])
  const existingResults = existingResultsSnap.docs.map((d) => d.data() as MarkerResult)
  const existingCustomMarkerKeys = new Set(existingCustomMarkersSnap.docs.map((d) => d.id))

  const mergedResults = mergeResults(existingResults, localResults)
  const newCustomMarkers = localCustomMarkers.filter((m) => !existingCustomMarkerKeys.has(m.key))

  const batch = writeBatch(db)
  batch.set(
    userDoc(uid),
    {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      ...(isFirstSignIn ? { ...localProfile, createdAt: serverTimestamp() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  for (const result of mergedResults) {
    batch.set(doc(resultsCol(uid), result.id), result)
  }
  for (const marker of newCustomMarkers) {
    batch.set(doc(customMarkersCol(uid), marker.key), marker)
  }
  await batch.commit()

  clearAllData()
}

/** Deletes every result/custom-marker doc and resets the profile fields on the
 * user doc, but keeps the account itself (email/displayName/createdAt) intact. */
export async function deleteAllCloudData(uid: string): Promise<void> {
  const [resultsSnap, customMarkersSnap] = await Promise.all([getDocs(resultsCol(uid)), getDocs(customMarkersCol(uid))])
  const batch = writeBatch(db)
  for (const d of resultsSnap.docs) batch.delete(d.ref)
  for (const d of customMarkersSnap.docs) batch.delete(d.ref)
  batch.set(
    userDoc(uid),
    {
      birthDate: null,
      sex: null,
      takesCreatineSupplement: deleteField(),
      theme: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  await batch.commit()
}

/** Deletes all Firestore data for this account, then deletes the Firebase Auth
 * account itself. No Cloud Function involved - this is the only cleanup path,
 * so it must run before deleteUser() succeeds, not after. */
export async function deleteAccountCloud(user: User): Promise<void> {
  const uid = user.uid
  const [resultsSnap, customMarkersSnap] = await Promise.all([getDocs(resultsCol(uid)), getDocs(customMarkersCol(uid))])
  const batch = writeBatch(db)
  for (const d of resultsSnap.docs) batch.delete(d.ref)
  for (const d of customMarkersSnap.docs) batch.delete(d.ref)
  batch.delete(userDoc(uid))
  await batch.commit()
  await deleteUser(user)
}
