// What kind of organization this is (Oct 25). Optional, picked on the
// "Bring your organization" form. The database checks the same list
// (organizations_org_type_check in vwb-org-type.sql).
export const ORG_TYPES = [
  { value: 'nonprofit', label: 'Official organization: nonprofit (501c3)' },
  { value: 'faith', label: 'Official organization: church or faith community' },
  { value: 'mutual_aid', label: 'Mutual aid or community group (not official is fine)' },
  { value: 'club', label: 'Club or hobby group' },
  { value: 'tenant_workers', label: "Tenant union or workers' group" },
  { value: 'disability_support', label: 'Disability-led or support group' },
  { value: 'business', label: 'Official organization: business or co-op' },
  { value: 'other', label: 'Other' },
]

export function orgTypeLabel(value) {
  return ORG_TYPES.find((t) => t.value === value)?.label || ''
}

// Round E (Nov 10): the first question when someone brings a group. Each kind
// sets starting choices, shown in plain words before saving. All can change later.
//   hidePublic: only people with a VWB account can see the group
//   joinOpen:   the Ask to join button shows
//   membersSee: members can see each other's names (otherwise only leaders)
// Never ask for a workplace or building.
export const GROUP_KINDS = [
  { value: 'mutual_aid', label: 'Mutual aid or volunteer group', hidePublic: false, joinOpen: true, membersSee: true },
  { value: 'crew', label: 'Emergency crew', crew: true },
  { value: 'tenant_workers', label: "Tenant union or workers' group", hidePublic: true, joinOpen: false, membersSee: true },
  { value: 'disability_support', label: 'Disability-led or support group', hidePublic: true, joinOpen: true, membersSee: true },
  { value: 'faith', label: 'Faith community or club', hidePublic: false, joinOpen: true, membersSee: false },
  { value: 'other', label: 'Other', hidePublic: false, joinOpen: true, membersSee: false },
]
