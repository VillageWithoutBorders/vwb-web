import { groupSkills } from '../utils/skillGroups'

// Renders skill chips under small headers ("Everyday Help", "Trades and
// Trained Skills", ...). Each page keeps its own chip button and selection
// logic and passes it in as renderChip, so this only handles the layout.
export default function GroupedSkillChips({ skills, renderChip, gridClassName = 'skill-grid', gridStyle }) {
  return (
    <div className="skill-groups">
      {groupSkills(skills).map((g) => (
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
