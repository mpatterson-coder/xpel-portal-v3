// =============================================================================
// Dealership staff titles — REPORTING LABELS ONLY (Top sellers, By department).
// Since migration 6, permissions come from the explicit is_store_admin flag on
// each profile, NOT from the title. MANAGER_TITLES remains only because
// migration 6 grandfathered those titles into the flag once.
// =============================================================================
export const TITLES = [
  'General Manager',
  'General Sales Manager',
  'Sales Manager',
  'Finance Manager',
  'Fixed Operations Manager',
  'Sales Advisor',
  'Service Manager',
  'Service Advisor',
  'Used Car Sales Manager',
]

export const MANAGER_TITLES = TITLES.filter((t) => t.includes('Manager'))

export const isManagerTitle = (t) => !!t && MANAGER_TITLES.includes(t)
