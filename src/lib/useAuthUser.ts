import { onAuthStateChanged, type User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from './firebase'

interface AuthState {
  user: User | null
  initializing: boolean
}

/** Tracks the signed-in Firebase user. `initializing` is true only during the
 * first check on load, so the app doesn't briefly flash local-only mode before
 * Firebase reports an existing session. */
export function useAuthUser(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, initializing: true })

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setState({ user, initializing: false }))
  }, [])

  return state
}
