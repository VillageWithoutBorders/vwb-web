import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const BASE = 'https://api.dicebear.com/7.x/avataaars/svg'

// Shape/style options — verified against the live DiceBear 7.x avataaars
// schema (api.dicebear.com/7.x/avataaars/schema.json). A few of these had
// drifted from an older API version: "clothes" isn't a real field (it's
// "clothing"), "froAndBand" should be "froBand", "winterHat01" should be
// "winterHat1", "eyepatch" belongs under accessories not top, and "dizzy"
// under eyes was never a valid value at all (only "xDizzy" is).
const OPTIONS = {
  top: ['bigHair','bob','bun','curly','curvy','dreads','frida','fro','froBand','miaWallace','longButNotTooLong','shavedSides','straight01','straight02','straightAndStrand','dreads01','dreads02','frizzle','shaggy','shaggyMullet','shortCurly','shortFlat','shortRound','shortWaved','sides','theCaesar','theCaesarAndSidePart','winterHat1','winterHat02','winterHat03','winterHat04','hat','hijab','turban'],
  accessories: ['kurt','prescription01','prescription02','round','sunglasses','wayfarers','eyepatch'],
  facialHair: ['beardLight','beardMajestic','beardMedium','moustacheFancy','moustacheMagnum'],
  clothing: ['blazerAndShirt','blazerAndSweater','collarAndSweater','graphicShirt','hoodie','overall','shirtCrewNeck','shirtScoopNeck','shirtVNeck'],
  eyes: ['closed','cry','default','eyeRoll','happy','hearts','side','squint','surprised','wink','winkWacky','xDizzy'],
  eyebrows: ['angry','angryNatural','default','defaultNatural','flatNatural','frownNatural','raisedExcited','raisedExcitedNatural','sadConcerned','sadConcernedNatural','unibrowNatural','upDown','upDownNatural'],
  mouth: ['concerned','default','disbelief','eating','grimace','sad','screamOpen','serious','smile','tongue','twinkle','vomit'],
}

// Color options — the live schema requires raw hex codes here, not named
// enums (that's the other half of why customization was silently failing:
// every one of these was sending a word like "auburn" or "tanned" where
// DiceBear expects "a55728" or "fd9841"). Names below are for the picker UI
// only; the hex is what actually gets sent.
const COLOR_OPTIONS = {
  hairColor: [
    { name: 'Auburn', hex: 'a55728' }, { name: 'Black', hex: '2c1b18' }, { name: 'Blonde', hex: 'b58143' },
    { name: 'Blonde Golden', hex: 'd6b370' }, { name: 'Brown', hex: '724133' }, { name: 'Brown Dark', hex: '4a312c' },
    { name: 'Pastel Pink', hex: 'f59797' }, { name: 'Platinum', hex: 'ecdcbf' }, { name: 'Red', hex: 'c93305' }, { name: 'Silver Gray', hex: 'e8e1e1' },
  ],
  facialHairColor: [
    { name: 'Auburn', hex: 'a55728' }, { name: 'Black', hex: '2c1b18' }, { name: 'Blonde', hex: 'b58143' },
    { name: 'Blonde Golden', hex: 'd6b370' }, { name: 'Brown', hex: '724133' }, { name: 'Brown Dark', hex: '4a312c' },
    { name: 'Pastel Pink', hex: 'f59797' }, { name: 'Platinum', hex: 'ecdcbf' }, { name: 'Red', hex: 'c93305' }, { name: 'Silver Gray', hex: 'e8e1e1' },
  ],
  clothesColor: [
    { name: 'Black', hex: '262e33' }, { name: 'Blue', hex: '65c9ff' }, { name: 'Navy', hex: '5199e4' }, { name: 'Dark Blue', hex: '25557c' },
    { name: 'Light Gray', hex: 'e6e6e6' }, { name: 'Gray', hex: '929598' }, { name: 'Heather', hex: '3c4f5c' }, { name: 'Pastel Blue', hex: 'b1e2ff' },
    { name: 'Pastel Green', hex: 'a7ffc4' }, { name: 'Pastel Orange', hex: 'ffdeb5' }, { name: 'Pastel Red', hex: 'ffafb9' }, { name: 'Pastel Yellow', hex: 'ffffb1' },
    { name: 'Pink', hex: 'ff488e' }, { name: 'Red', hex: 'ff5c5c' }, { name: 'White', hex: 'ffffff' },
  ],
  skinColor: [
    { name: 'Tanned', hex: 'fd9841' }, { name: 'Yellow', hex: 'f8d25c' }, { name: 'Pale', hex: 'ffdbb4' }, { name: 'Light', hex: 'edb98a' },
    { name: 'Brown', hex: 'd08b5b' }, { name: 'Dark Brown', hex: 'ae5d29' }, { name: 'Black', hex: '614335' },
  ],
}

const LABELS = {
  top: 'Hair / Head', accessories: 'Accessories', hairColor: 'Hair Color',
  facialHair: 'Facial Hair', facialHairColor: 'Facial Hair Color',
  clothing: 'Clothes', clothesColor: 'Clothes Color',
  eyes: 'Eyes', eyebrows: 'Eyebrows', mouth: 'Mouth', skinColor: 'Skin Tone',
}

function buildCustomUrl(config) {
  const params = new URLSearchParams()
  // DiceBear 7.x's avataaars fields are all array-typed in its schema, so
  // each one has to be sent as key[]=value, not a plain key=value.
  Object.entries(config).forEach(([key, val]) => { if (val) params.set(key + '[]', val) })
  // DiceBear only actually draws facial hair or accessories some of the
  // time by default — it has its own hidden "probability" setting that
  // defaults to just 10%, even when a specific beard or a specific pair
  // of glasses has been picked. Without forcing this, a chosen beard
  // would only show up roughly 1 time in 10. Force it fully on when
  // something's picked, and fully off when the section is set to "None".
  params.set('facialHairProbability', config.facialHair ? '100' : '0')
  params.set('accessoriesProbability', config.accessories ? '100' : '0')
  return BASE + '?' + params.toString()
}

function makeSeeds(base, count) {
  const seeds = []
  for (let i = 0; i < count; i++) seeds.push(base + '-' + i)
  return seeds
}

export default function AvatarBuilder({ onSave, onCancel, initialConfig }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState(initialConfig?.custom ? 'customize' : 'pick')
  const [selected, setSelected] = useState(initialConfig?.seed || null)
  const [batch, setBatch] = useState(0)
  const [config, setConfig] = useState(initialConfig?.custom || {})
  const [activeSection, setActiveSection] = useState(Object.keys(OPTIONS)[0])

  const name = user?.email?.split('@')[0] || 'neighbor'
  const seeds = makeSeeds(name + '-' + batch, 12)

  function shuffle() { setBatch(b => b + 1); setSelected(null) }

  function switchMode(next) {
    setMode(next)
    if (next === 'customize' && Object.keys(config).length === 0) randomizeCustom()
  }

  function update(key, value) {
    setConfig(prev => {
      const next = { ...prev }
      if (value === '') delete next[key]; else next[key] = value
      return next
    })
    setSelected(null)
  }

  function randomizeCustom() {
    const rand = {}
    Object.entries(OPTIONS).forEach(([key, vals]) => {
      if (key === 'accessories' || key === 'facialHair') {
        if (Math.random() > 0.5) rand[key] = vals[Math.floor(Math.random() * vals.length)]
      } else {
        rand[key] = vals[Math.floor(Math.random() * vals.length)]
      }
    })
    Object.entries(COLOR_OPTIONS).forEach(([key, vals]) => {
      rand[key] = vals[Math.floor(Math.random() * vals.length)].hex
    })
    setConfig(rand)
    setSelected(null)
  }

  function getPreviewUrl() {
    if (mode === 'pick' && selected) return BASE + '?seed=' + encodeURIComponent(selected)
    if (mode === 'customize') return buildCustomUrl(config)
    return null
  }

  async function handleSave() {
    const url = getPreviewUrl()
    if (!url) return
    setSaving(true)
    const saveData = mode === 'pick' ? { seed: selected } : { custom: config }
    const { error } = await supabase.from('helper_profiles').update({
      avatar_url: url, avatar_config: saveData,
    }).eq('user_id', user.id)
    if (error) alert('Could not save avatar. Try again.')
    else if (onSave) onSave(url, saveData)
    setSaving(false)
  }

  const previewUrl = getPreviewUrl()
  const canSave = mode === 'pick' ? !!selected : Object.keys(config).length > 0
  const sectionKeys = [...Object.keys(OPTIONS), ...Object.keys(COLOR_OPTIONS)]
  const tabStyle = (active) => ({ padding: '0.4rem 0.65rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: active ? '#4ecca3' : '#2a2a2a', color: active ? '#1a1a1a' : '#aaa', whiteSpace: 'nowrap' })

  return (
    <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{mode === 'pick' ? 'Pick Your Avatar' : 'Customize Avatar'}</h2>
        {onCancel && <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.3rem', cursor: 'pointer' }}>{'✕'}</button>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => switchMode('pick')} style={tabStyle(mode === 'pick')}>Quick Pick</button>
        <button onClick={() => switchMode('customize')} style={tabStyle(mode === 'customize')}>Customize</button>
      </div>

      {mode === 'pick' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {seeds.map(seed => (
              <div key={seed} onClick={() => setSelected(seed)} style={{
                width: '100%', aspectRatio: '1', borderRadius: '50%', overflow: 'hidden',
                border: selected === seed ? '3px solid #4ecca3' : '3px solid transparent',
                background: '#2a2a2a', cursor: 'pointer',
                boxShadow: selected === seed ? '0 0 12px rgba(78,204,163,0.4)' : 'none',
              }}>
                <img src={BASE + '?seed=' + encodeURIComponent(seed)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
          <button onClick={shuffle} style={{ display: 'block', width: '100%', marginBottom: '1rem', padding: '0.6rem', borderRadius: '20px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.9rem' }}>{'🎲'} Shuffle for more</button>
        </>
      )}

      {mode === 'customize' && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ width: '120px', height: '120px', margin: '0 auto', borderRadius: '50%', overflow: 'hidden', background: '#2a2a2a', border: '3px solid #4ecca3' }}>
              {previewUrl && <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <button onClick={randomizeCustom} style={{ marginTop: '0.5rem', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}>{'🎲'} Randomize</button>
          </div>

          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem', justifyContent: 'center' }}>
            {sectionKeys.map(key => (
              <button key={key} style={tabStyle(activeSection === key)} onClick={() => setActiveSection(key)}>{LABELS[key]}</button>
            ))}
          </div>

          <div style={{ background: '#1e1e1e', borderRadius: '10px', padding: '0.75rem', border: '1px solid #333', marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, color: '#ccc', fontSize: '0.85rem' }}>{LABELS[activeSection]}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {COLOR_OPTIONS[activeSection] ? (
                COLOR_OPTIONS[activeSection].map(({ name: colorName, hex }) => {
                  const isActive = config[activeSection] === hex
                  return (
                    <button key={hex} onClick={() => update(activeSection, hex)} style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.3rem 0.6rem', borderRadius: '8px',
                      border: isActive ? '2px solid #4ecca3' : '1px solid #444',
                      background: isActive ? '#1a3a2a' : '#2a2a2a', color: isActive ? '#4ecca3' : '#ccc',
                      cursor: 'pointer', fontSize: '0.78rem', fontWeight: isActive ? 700 : 400,
                    }}>
                      <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#' + hex, border: '1px solid #555', flexShrink: 0 }} />
                      {colorName}
                    </button>
                  )
                })
              ) : (
                <>
                  {(activeSection === 'accessories' || activeSection === 'facialHair') && (
                    <button onClick={() => update(activeSection, '')} style={{
                      padding: '0.35rem 0.6rem', borderRadius: '8px',
                      border: !config[activeSection] ? '2px solid #4ecca3' : '1px solid #444',
                      background: !config[activeSection] ? '#1a3a2a' : '#2a2a2a',
                      color: !config[activeSection] ? '#4ecca3' : '#ccc',
                      cursor: 'pointer', fontSize: '0.78rem', fontWeight: !config[activeSection] ? 700 : 400,
                    }}>None</button>
                  )}
                  {OPTIONS[activeSection].map(val => {
                    const isActive = config[activeSection] === val
                    const label = val.replace(/([A-Z0-9])/g, ' $1').replace(/^\s/, '')
                    return (
                      <button key={val} onClick={() => update(activeSection, val)} style={{
                        padding: '0.35rem 0.6rem', borderRadius: '8px',
                        border: isActive ? '2px solid #4ecca3' : '1px solid #444',
                        background: isActive ? '#1a3a2a' : '#2a2a2a', color: isActive ? '#4ecca3' : '#ccc',
                        cursor: 'pointer', fontSize: '0.78rem', fontWeight: isActive ? 700 : 400,
                      }}>{label}</button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {onCancel && <button onClick={onCancel} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #444', background: 'none', color: '#aaa', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>}
        <button onClick={handleSave} disabled={saving || !canSave} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '1rem', opacity: saving || !canSave ? 0.5 : 1 }}>
          {saving ? 'Saving...' : 'Save Avatar'}
        </button>
      </div>
    </div>
  )
}

// Renamed from AvatarDisplay (Sep 12): this is a plain static image/placeholder
// renderer with no fetch, no userId, no reputation or vouch data — a totally
// different component from the interactive components/AvatarDisplay.jsx that
// shares that name. Same name, different component was a maintainability
// trap, so this one is now AvatarPreview.
export function AvatarPreview({ url, size = 40, style = {} }) {
  if (!url) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: size * 0.5, flexShrink: 0, ...style }}>
        {'👤'}
      </div>
    )
  }
  return <img src={url} alt="Avatar" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#2a2a2a', ...style }} />
}