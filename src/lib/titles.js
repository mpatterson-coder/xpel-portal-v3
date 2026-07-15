// =============================================================================
// Dealership staff titles — the single source of truth for the preset list and
// the "who is a store manager" rule. Must stay in lockstep with the database's
// is_store_manager() function (migration 5): every title containing "Manager"
// unlocks the sensitive actions (adding users, editing retail, discounts);
// Advisors place orders but can't change pricing.
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
