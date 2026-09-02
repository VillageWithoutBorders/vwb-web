import { useState, useEffect } from 'react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SPECIAL = ['Flexible', 'Emergencies only']

function parseAvailability(str) {
  if (!str) return { slots: {}, specials: [] }

  try {
    const parsed = JSON.parse(str)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        slots: parsed.slots || {},
        specials: parsed.specials || [],
      }
    }
  } catch {}

  // Legacy plain text
  return { slots: {}, specials: [] }
}

function serializeAvailability(slots, specials) {
  return JSON.stringify({ slots, specials })
}

function toDisplayString(slots, specials) {
  const parts = []

  DAYS.forEach((day) => {
    const times = []
    if (slots[`${day}-AM`]) times.push('AM')
    if (slots[`${day}-PM`]) times.push('PM')
    if (times.length > 0) parts.push(`${day} ${times.join('/')}`)
  })

  specials.forEach((s) => parts.push(s))

  return parts.join(', ') || 'Not set'
}

export function availabilityDisplayString(str) {
  if (!str) return 'Not set'

  try {
    const parsed = JSON.parse(str)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return toDisplayString(parsed.slots || {}, parsed.specials || [])
    }
  } catch {}

  // Legacy plain text
  return str
}

export default function AvailabilityPicker({ value, onChange }) {
  const initial = parseAvailability(value)
  const [slots, setSlots] = useState(initial.slots)
  const [specials, setSpecials] = useState(initial.specials)

  useEffect(() => {
    const updated = parseAvailability(value)
    setSlots(updated.slots)
    setSpecials(updated.specials)
  }, [value])

  function toggleSlot(key) {
    const next = { ...slots, [key]: !slots[key] }
    if (!next[key]) delete next[key]
    setSlots(next)
    onChange(serializeAvailability(next, specials))
  }

  function toggleSpecial(label) {
    const next = specials.includes(label)
      ? specials.filter((s) => s !== label)
      : [...specials, label]
    setSpecials(next)
    onChange(serializeAvailability(slots, next))
  }

  return (
    <div className="availability-picker">
      <div className="avail-grid">
        <div className="avail-header-row">
          <div className="avail-corner" />
          {DAYS.map((day) => (
            <div key={day} className="avail-day-header">{day}</div>
          ))}
        </div>
        {['AM', 'PM'].map((period) => (
          <div key={period} className="avail-row">
            <div className="avail-period-label">{period}</div>
            {DAYS.map((day) => {
              const key = `${day}-${period}`
              const active = !!slots[key]
              return (
                <button
                  key={key}
                  type="button"
                  className={`avail-cell ${active ? 'active' : ''}`}
                  onClick={() => toggleSlot(key)}
                  aria-label={`${day} ${period}`}
                  aria-pressed={active}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="avail-specials">
        {SPECIAL.map((label) => (
          <button
            key={label}
            type="button"
            className={`skill-chip ${specials.includes(label) ? 'active' : ''}`}
            onClick={() => toggleSpecial(label)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
