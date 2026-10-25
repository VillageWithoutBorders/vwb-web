// What kind of organization this is (Oct 25). Optional, picked on the
// "Bring your organization" form. The database checks the same list
// (organizations_org_type_check in vwb-org-type.sql).
export const ORG_TYPES = [
  { value: 'nonprofit', label: 'Official organization: nonprofit (501c3)' },
  { value: 'faith', label: 'Official organization: church or faith community' },
  { value: 'mutual_aid', label: 'Mutual aid or community group (not official is fine)' },
  { value: 'club', label: 'Club or hobby group' },
  { value: 'business', label: 'Official organization: business or co-op' },
  { value: 'other', label: 'Other' },
]

export function orgTypeLabel(value) {
  return ORG_TYPES.find((t) => t.value === value)?.label || ''
}
