// Organizer side: add shifts to an event, like "Supply table, 10 to 12, 3 people".
// The parent keeps the list. Times are optional.
const input = { display: 'block', width: '100%', boxSizing: 'border-box', minHeight: '48px', padding: '0.5rem 0.75rem', marginBottom: '0.5rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '1rem', fontFamily: 'inherit' }

export default function ShiftsEditor({ shifts, onChange }) {
  function update(i, key, value) {
    onChange(shifts.map((s, j) => (j === i ? { ...s, [key]: value } : s)))
  }
  function add() {
    onChange([...shifts, { id: null, label: '', start: '', end: '', capacity: '3' }])
  }
  function remove(i) {
    onChange(shifts.filter((_, j) => j !== i))
  }

  return (
    <div style={{ margin: '0.5rem 0 1rem' }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 0.25rem' }}>Shifts (optional)</h3>
      <p className="cal-sub" style={{ margin: '0 0 0.5rem' }}>
        Split the work into jobs or time blocks. Volunteers pick a shift instead of one general sign-up. The spots below count for each shift.
      </p>
      {shifts.map((s, i) => (
        <div key={s.key || s.id || i} role="group" aria-label={'Shift ' + (i + 1)} style={{ marginBottom: '0.75rem', padding: '0.75rem', border: '1px solid #333', borderRadius: '10px', background: '#1e1e1e' }}>
          <label htmlFor={'shift-label-' + i} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>What is the shift?</label>
          <input id={'shift-label-' + i} type="text" maxLength={60} autoComplete="off" value={s.label} onChange={(e) => update(i, 'label', e.target.value)} placeholder="Supply table" style={input} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ flex: 1 }}>
              <label htmlFor={'shift-start-' + i} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>From</label>
              <input id={'shift-start-' + i} type="time" value={s.start} onChange={(e) => update(i, 'start', e.target.value)} style={input} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor={'shift-end-' + i} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>To</label>
              <input id={'shift-end-' + i} type="time" value={s.end} onChange={(e) => update(i, 'end', e.target.value)} style={input} />
            </div>
          </div>
          <label htmlFor={'shift-cap-' + i} style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.2rem' }}>How many people?</label>
          <input id={'shift-cap-' + i} type="number" inputMode="numeric" min={1} max={100} value={s.capacity} onChange={(e) => update(i, 'capacity', e.target.value)} style={input} />
          <button type="button" onClick={() => remove(i)} style={{ minHeight: '44px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #c0392b', background: 'none', color: '#ff7b6b', fontSize: '0.95rem', cursor: 'pointer' }}>Remove this shift</button>
        </div>
      ))}
      {shifts.length < 12 && (
        <button type="button" onClick={add} style={{ minHeight: '48px', padding: '0 1rem', borderRadius: '8px', border: '1px solid #4ecca3', background: 'none', color: '#4ecca3', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>+ Add a shift</button>
      )}
    </div>
  )
}
