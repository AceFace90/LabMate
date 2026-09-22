import { useState } from 'react'
import type { Profile } from '../types'

interface Props {
  profile: Profile
  onSaveProfile: (profile: Profile) => void
  onDeleteAllData: () => void
}

export function Settings({ profile, onSaveProfile, onDeleteAllData }: Props) {
  const [birthDateInput, setBirthDateInput] = useState(profile.birthDate ?? '')

  function handleDeleteAllData() {
    const ok = window.confirm(
      'Delete all LabMate data? This removes every imported/manual result, your profile and custom metrics from this browser. This cannot be undone.',
    )
    if (ok) onDeleteAllData()
  }

  return (
    <div>
      <div className="card">
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
          Permanently delete every result, your profile and custom metrics from this browser's storage. There is no
          undo and no server copy to restore from - export a backup first if you might want this data again.
        </p>
        <button className="secondary" style={{ color: 'var(--status-critical)', borderColor: 'var(--status-critical)' }} onClick={handleDeleteAllData}>
          Delete all data
        </button>
      </div>
    </div>
  )
}
