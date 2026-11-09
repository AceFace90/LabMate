import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import type { Profile } from '../types'
import { Icon, type IconName } from './Icon'

const THEME_OPTIONS: { value: 'auto' | 'light' | 'dark'; icon: IconName; label: string }[] = [
  { value: 'auto', icon: 'phone', label: 'System' },
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
]

interface Props {
  profile: Profile
  onSaveProfile: (profile: Profile) => void
  onDeleteAllData: () => void
  user: User | null
  migrating: boolean
  authError: string | null
  onSignIn: () => void
  onLogOut: () => void
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
  onLogOut,
  onDeleteAccount,
}: Props) {
  const [birthDateInput, setBirthDateInput] = useState(profile.birthDate ?? '')
  const [nameInput, setNameInput] = useState(profile.name ?? '')

  // Cloud profile data arrives asynchronously (Firestore subscription, after the
  // initial migration), so these text inputs need to resync once it lands - not
  // just take profile as their initial value at mount.
  useEffect(() => {
    setBirthDateInput(profile.birthDate ?? '')
    setNameInput(profile.name ?? '')
  }, [profile.birthDate, profile.name])

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

  const base = import.meta.env.BASE_URL
  const theme = profile.theme ?? 'auto'

  return (
    <div>
      <section className="ios-section">
        <div className="ios-group">
          <div className="ios-profile">
            <picture>
              <source srcSet={`${base}logo-dark.svg`} media="(prefers-color-scheme: dark)" />
              <img src={`${base}logo-light.svg`} alt="" />
            </picture>
            <div>
              <div className="name">{profile.name?.trim() || 'LabMate'}</div>
              <div className="email">{user?.email ?? 'Stored in this browser'}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="ios-section">
        <h3 className="ios-section-header">Account</h3>
        <div className="ios-group">
          {authError && (
            <div className="ios-row destructive" role="alert">
              {authError}
            </div>
          )}
          {user ? (
            <>
              <div className="ios-row">
                <span className="ios-row-label">
                  {user.displayName && <strong>{user.displayName}</strong>}
                  <span className="ios-row-sub">{user.email ?? 'Signed in'}</span>
                </span>
              </div>
              <button className="ios-row destructive" onClick={onLogOut} disabled={migrating}>
                Log Out
              </button>
            </>
          ) : (
            <button className="ios-row tint has-icon" onClick={onSignIn} disabled={migrating}>
              <span className="row-icon">
                <span className="g-icon">G</span>
              </span>
              <span className="ios-row-label">{migrating ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
        <p className="ios-section-footer">
          {user
            ? 'Your data syncs to this account and is available on any device you sign into.'
            : "Sign in to sync your data across devices. Without signing in, everything stays in this browser only - it's gone if you clear your browser data."}
        </p>
      </section>

      <section className="ios-section">
        <h3 className="ios-section-header">About You</h3>
        <div className="ios-group">
          <label className="ios-row">
            <input
              type="text"
              aria-label="Name"
              placeholder="What should we call you?"
              value={nameInput}
              disabled={migrating}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => onSaveProfile({ ...profile, name: nameInput.trim() || undefined })}
            />
          </label>
          <label className="ios-row">
            <span className="ios-row-label">Date of birth</span>
            <input
              type="date"
              value={birthDateInput}
              disabled={migrating}
              onChange={(e) => setBirthDateInput(e.target.value)}
              onBlur={() => onSaveProfile({ ...profile, birthDate: birthDateInput || null })}
            />
          </label>
          <label className="ios-row">
            <span className="ios-row-label">Sex</span>
            <select
              value={profile.sex ?? ''}
              disabled={migrating}
              onChange={(e) => onSaveProfile({ ...profile, sex: (e.target.value || null) as Profile['sex'] })}
            >
              <option value="">Not set</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            <Icon name="chevronUpDown" className="chevrons" />
          </label>
          <label className="ios-row">
            <span className="ios-row-label">I take a creatine supplement</span>
            <span className="ios-switch">
              <input
                type="checkbox"
                role="switch"
                checked={!!profile.takesCreatineSupplement}
                disabled={migrating}
                onChange={(e) => onSaveProfile({ ...profile, takesCreatineSupplement: e.target.checked })}
              />
              <span />
            </span>
          </label>
        </div>
        <p className="ios-section-footer">
          Name is used for the greeting. Date of birth gives your age for the biological age comparison. Sex is only
          used for kidney-function equations (eGFR / Cystatin C), which differ by sex. Creatine raises serum
          creatinine independent of kidney function: when set, the biological age breakdown stops treating
          creatinine as something to act on, and (if you have a Cystatin C result) shows a creatine-adjusted
          estimate alongside the real one.
        </p>
      </section>

      <section className="ios-section">
        <h3 className="ios-section-header">Appearance</h3>
        <div className="ios-group">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="ios-row has-icon"
              aria-pressed={theme === opt.value}
              onClick={() => onSaveProfile({ ...profile, theme: opt.value })}
            >
              <span className="row-icon" style={{ color: 'var(--accent)' }}>
                <Icon name={opt.icon} />
              </span>
              <span className="ios-row-label">{opt.label}</span>
              {theme === opt.value && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      <section className="ios-section">
        <h3 className="ios-section-header">Your Data</h3>
        <div className="ios-group">
          <button className="ios-row destructive has-icon" onClick={handleDeleteAllData} disabled={migrating}>
            <span className="row-icon">
              <Icon name="trash" />
            </span>
            <span className="ios-row-label">Delete All Data</span>
          </button>
          {user && (
            <button className="ios-row destructive has-icon" onClick={handleDeleteAccount} disabled={migrating}>
              <span className="row-icon">
                <Icon name="warning" />
              </span>
              <span className="ios-row-label">Delete Account</span>
            </button>
          )}
        </div>
        <p className="ios-section-footer">
          {user
            ? 'Delete All Data permanently removes every result, your profile and custom metrics from your account (your sign-in stays active). Delete Account removes the account itself and all synced data. There is no undo.'
            : 'Delete All Data permanently removes every result, your profile and custom metrics from this browser. There is no undo and no server copy to restore from.'}
        </p>
      </section>

      <section className="ios-section">
        <h3 className="ios-section-header">About</h3>
        <div className="ios-group">
          <div className="ios-row" style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            LabMate tracks your blood test results over time. Biological age, scores and the test plan are
            illustrative scheduling and wellness heuristics, not diagnostic or medical advice. General information
            only - talk to your doctor before changing anything based on these results.
          </div>
          <a className="ios-row" href={`${base}privacy.html`} target="_blank" rel="noopener noreferrer">
            <span className="ios-row-label">Privacy Policy</span>
          </a>
        </div>
      </section>
    </div>
  )
}
