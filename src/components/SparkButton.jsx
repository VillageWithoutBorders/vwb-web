import { SPARK_NAME, SPARK_HINT } from '../utils/spark'

// A small sparkle under a message. Tap once for "I saw this", tap again to take it back.
// Shows a plain count, never who.
export default function SparkButton({ count = 0, mine = false, onToggle, align = 'flex-end' }) {
  return (
    <div style={{ display: 'flex', justifyContent: align }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        aria-pressed={mine}
        aria-label={SPARK_NAME + ': ' + SPARK_HINT + (count ? '. ' + count + ' so far' : '')}
        title={SPARK_NAME + ': ' + SPARK_HINT}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', minWidth: '44px', minHeight: '32px', margin: '-0.2rem 0 -0.4rem', padding: '0 0.4rem', borderRadius: '999px', border: 'none', background: mine ? 'rgba(255,200,60,0.28)' : 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', opacity: mine || count ? 1 : 0.55 }}
      >
        <span aria-hidden="true" style={{ filter: mine ? 'none' : 'grayscale(1)' }}>&#10024;</span>
        {count > 0 && <span>{count}</span>}
      </button>
    </div>
  )
}
