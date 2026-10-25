// What kind of organization this is (Oct 25). Optional, picked on the
// "Bring your organization" form. The database checks the same list
// (organizations_org_type_check in vwb-org-type.sql).
export const ORG_TYPES = [
  { value: 'nonprofit', label: 'Nonprofit (501c3)' },
  { value: 'faith', label: 'Church or faith community' },
  { value: 'mutual_aid', label: 'Mutual aid or community group (unofficial is welcome)' },
  { value: 'club', label: 'Club or hobby group' },
  { value: 'business', label: 'Business or co-op' },
  { value: 'other', label: 'Other' },
]

export function orgTypeLabel(value) {
  return ORG_TYPES.find((t) => t.value === value)?.label || ''
}
