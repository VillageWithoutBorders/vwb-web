import { useState } from 'react'
import { groupSkills } from '../utils/skillGroups'

// Renders skill chips under small headers ("Everyday Help", "Trades and
// Trained Skills", ...). Each page keeps its own chip button and selection
// logic and passes it in as renderChip, so this only handles the layout.
//
// Every skill picker in the app uses this, so they all look and work the same.
// By default each header is a tap-to-open section, so people see four or five
// short rows instead of 30 chips at once (feedback: the full list was
// overwhelming). Always pass `selected` (the array of picked titles) so each
// header can say how many are picked, and so any section that already has
// picks starts open. collapsible={false} shows everything open, flat.
export default function GroupedSkillChips({ skills, renderChip, gridClassName = 'skill-grid', gridStyle, collapsible = true, selected = [] }) {
  const groups = groupSkills(skills)

  if (!collapsible) {
    return (
      <div className="skill-groups">
        {groups.map((g) => (
          <div key={g.group} className="skill-group" role="group" aria-label={g.group}>
            <p className="skill-group-title">{g.group}</p>
            <div className={gridClassName} style={gridStyle}>
              {g.skills.map((title) => renderChip(title))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="skill-groups skill-groups-collapsible">
      <p className="skill-groups-hint">Tap a group to see the skills in it.</p>
      {groups.map((g) => (
        <CollapsibleGroup
          key={g.group}
          group={g}
          renderChip={renderChip}
          gridClassName={gridClassName}
          gridStyle={gridStyle}
          pickedCount={g.skills.filter((s) => selected.includes(s)).length}
        />
      ))}
    </div>
  )
}

function CollapsibleGroup({ group, renderChip, gridClassName, gridStyle, pickedCount }) {
  // Starts open only if something in it is already picked.
  const [open, setOpen] = useState(pickedCount > 0)
  const panelId = 'skill-group-' + group.group.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return (
    <div className={`skill-group-box ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="skill-group-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="skill-group-name">{group.group}</span>
        <span className="skill-group-meta">
          {pickedCount > 0 && <span className="skill-group-count">{pickedCount} picked</span>}
          <span className="skill-group-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
      </button>
      {open && (
        <div id={panelId} className={gridClassName + ' skill-group-panel'} style={gridStyle} role="group" aria-label={group.group}>
          {group.skills.map((title) => renderChip(title))}
        </div>
      )}
    </div>
  )
}
