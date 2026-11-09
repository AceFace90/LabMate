import type { IconName } from '../components/Icon'
import type { MarkerCategory } from '../types'

/** Per-category colour + icon, mirroring HealthColor.category / categorySymbol in the iOS app. */
export const CATEGORY_STYLE: Record<MarkerCategory, { color: string; icon: IconName }> = {
  electrolytes_kidney: { color: '#30d1bf', icon: 'drop' },
  liver: { color: '#ff734d', icon: 'vial' },
  iron: { color: '#bf5940', icon: 'atom' },
  metabolic: { color: '#ff9e0a', icon: 'flame' },
  heart_lipids: { color: '#ff2e54', icon: 'heart' },
  blood_marrow: { color: '#ff3b30', icon: 'dropCircle' },
  hormones: { color: '#b052de', icon: 'molecule' },
  nutrition: { color: '#33c759', icon: 'leaf' },
  gut_health: { color: '#8cb333', icon: 'bacteria' },
  autoimmunity: { color: '#545cf2', icon: 'shield' },
  cancer_screening: { color: '#e659a6', icon: 'asterisk' },
  muscle: { color: '#337aff', icon: 'dumbbell' },
  aerobic_fitness: { color: '#fa124f', icon: 'runner' },
  body_composition: { color: '#598cf2', icon: 'figure' },
  custom: { color: '#8e8e93', icon: 'grid' },
}

/** Colour used for a marker's value and chart. Custom metrics use the vitals blue, not neutral grey. */
export function categoryColor(category?: MarkerCategory): string {
  return !category || category === 'custom' ? '#337aff' : CATEGORY_STYLE[category].color
}
