import type { User } from 'firebase/auth'
import { useState } from 'react'
import type { Profile } from '../types'

interface Props {
  profile: Profile
  onSaveProfile: (profile: Profile) => void
  onDeleteAllData: () => void
  user: User | null
  migrating: boolean
  authError: string | null
  onSignIn: () => void
  onSignOut: () => void
  onDeleteAccount: () => void
}

export function Settings({
  profile,
  onSaveProfile,
  onDeleteAllData,
  user,
  migrating,
  authError,
  onSignIn,
  onSignOut,
  onDeleteAccount,
}: Props) {
  const [birthDateInput, setBirthDateInput] = useState(profile.birthDate ?? '')

  function handleDeleteAllData() {
    const ok = window.confirm(
      user
        ? 'Delete all LabMate data? This removes every result, your profile and custom metrics from your account. This cannot be undone.'
        : 'Delete all LabMate data? This removes every imported/manual result, your profile and custom metrics from this browser. This cannot be undone.',
    )
    if (ok) onDeleteAllData()
  }

  function handleDeleteAccount() {
    const ok = window.confirm(
      'Permanently delete your LabMate account and all its data? This cannot be undone - export a backup first if you might want this data again.',
    )
    if (ok) onDeleteAccount()
  }

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Account</h3>
        {authError && (
          <p className="caveat" style={{ color: 'var(--status-critical)' }}>
            {authError}
          </p>
        )}
        {user ? (
          <>
            <p className="caveat" style={{ marginBottom: 10 }}>
              Signed in as {user.email}. Your data syncs to this account and is available on any device you sign
              into.
            </p>
            <button className="secondary" onClick={onSignOut} disabled={migrating}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="caveat" style={{ marginBottom: 10 }}>
              Sign in to sync your data across devices. Without signing in, everything stays local to this browser
              only - it's gone if you clear your browser data or uninstall the app.
            </p>
            <button onClick={onSignIn} disabled={migrating}>
              {migrating ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <div className="form-row">
          <label>Date of birth</label>
          <input
            type="date"
            value={birthDateInput}
            onChange={(e) => setBirthDateInput(e.target.value)}
            onBlur={() => onSaveProfile({ ...profile, birthDate: birthDateInput || null })}
          />
        </div>
        <p className="caveat" style={{ marginBottom: 10 }}>
          Used to calculate your chronological age for the biological age comparison.
        </p>

        <div className="form-row">
          <label>Sex</label>
          <select
            value={profile.sex ?? ''}
            onChange={(e) => onSaveProfile({ ...profile, sex: (e.target.value || null) as 'M' | 'F' | null })}
          >
            <option value="">Not set</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </div>
        <p className="caveat" style={{ marginBottom: 10 }}>
          Only used for kidney-function equations (eGFR/Cystatin C) - those equations differ by sex.
        </p>

        <label className="caveat" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!profile.takesCreatineSupplement}
            onChange={(e) => onSaveProfile({ ...profile, takesCreatineSupplement: e.target.checked })}
          />
          I take a creatine supplement
        </label>
        <p className="caveat" style={{ marginTop: 4 }}>
          Creatine raises serum creatinine independent of kidney function. When set, the biological age breakdown
          stops treating creatinine as something to act on, and (if you have a Cystatin C result) shows a
          creatine-adjusted estimate alongside the real one.
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Appearance</h3>
        <div className="form-row">
          <label>Theme</label>
          <select
            value={profile.theme ?? 'auto'}
            onChange={(e) => onSaveProfile({ ...profile, theme: e.target.value as 'light' | 'dark' | 'auto' })}
          >
            <option value="auto">Auto (match system)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Danger zone</h3>
        <p className="cat-desc">
          {user
            ? "Permanently delete every result, your profile and custom metrics from your account. Your sign-in itself stays active - use \"Delete account\" below to remove that too."
            : "Permanently delete every result, your profile and custom metrics from this browser's storage."}
          {' '}There is no undo and no server copy to restore from - export a backup first if you might want this
          data again.
        </p>
        <button
          className="secondary"
          style={{ color: 'var(--status-critical)', borderColor: 'var(--status-critical)' }}
          onClick={handleDeleteAllData}
        >
          Delete all data
        </button>

        {user && (
          <>
            <p className="cat-desc" style={{ marginTop: 16 }}>
              Delete your LabMate account entirely, including all synced data. You'll need to sign in again to use
              cloud sync afterwards, as a brand-new account.
            </p>
            <button
              className="secondary"
              style={{ color: 'var(--status-critical)', borderColor: 'var(--status-critical)' }}
              onClick={handleDeleteAccount}
            >
              Delete account
            </button>
          </>
        )}
      </div>
    </div>
  )
}
