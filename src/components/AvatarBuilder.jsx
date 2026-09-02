import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const BASE = 'https://api.dicebear.com/7.x/avataaars/svg'

const OPTIONS = {
  top: ['bigHair','bob','bun','curly','curvy','dreads','frida','fro','froAndBand','miaWallace','longButNotTooLong','shavedSides','straight01','straight02','straightAndStrand','dreads01','dreads02','frizzle','shaggy','shaggyMullet','shortCurly','shortFlat','shortRound','shortWaved','sides','theCaesar','theCaesarAndSidePart','winterHat01','winterHat02','winterHat03','winterHat04','eyepatch','hat','hijab','turban'],
  accessories: ['kurt','prescription01','prescription02','round','sunglasses','wayfarers'],
  hairColor: ['auburn','black','blonde','blondeGolden','brown','brownDark','pastelPink','platinum','red','silverGray'],
  facialHair: ['beardLight','beardMajestic','beardMedium','moustacheFancy','moustacheMagnum'],
  facialHairColor: ['auburn','black','blonde','blondeGolden','brown','brownDark','platinum','red'],
  clothes: ['blazerAndShirt','blazerAndSweater','collarAndSweater','graphicShirt','hoodie','overall','shirtCrewNeck','shirtScoopNeck','shirtVNeck'],
  clothesColor: ['black','blue01','blue02','blue03','gray01','gray02','heather','pastelBlue','pastelGreen','pastelOrange','pastelRed','pastelYellow','pink','red','white'],
  eyes: ['closed','cry','default','dizzy','eyeRoll','happy','hearts','side','squint','surprised','wink','winkWacky','xDizzy'],
  eyebrows: ['angry','angryNatural','default','defaultNatural','flatNatural','frownNatural','raisedExcited','raisedExcitedNatural','sadConcerned','sadConcernedNatural','unibrowNatural','upDown','upDownNatural'],
  mouth: ['concerned','default','disbelief','eating','grimace','sad','screamOpen','serious','smile','tongue','twinkle','vomit'],
  skinColor: ['tanned','yellow','pale','light','brown','darkBrown','black'],
}

const LABELS = {
  top: 'Hair / Head', accessories: 'Accessories', hairColor: 'Hair Color',
  facialHair: 'Facial Hair', facialHairColor: 'Facial Hair Color',
  clothes: 'Clothes', clothesColor: 'Clothes Color',
  eyes: 'Eyes', eyebrows: 'Eyebrows', mouth: 'Mouth', skinColor: 'Skin Tone',
}

function buildCustomUrl(config) {
  const params = new URLSearchParams()
  Object.entries(config).forEach(([key, val]) => { if (val) params.set(key, val) })
  return BASE + '?' + params.toString()
}

function makeSeeds(base, count) {
  const seeds = []
  for (let i = 0; i < count; i++) seeds.push(base + '-' + i)
  return seeds
}

export default function AvatarBuilder({ onSave, onCancel }) {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('pick')
  const [selected, setSelected] = useState(null)
  const [batch, setBatch] = useState(0)
  const [config, setConfig] = useState({
    skinColor: 'light', top: 'shortFlat', eyes: 'default', eyebrows: 'default',
    mouth: 'smile', clothes: 'shirtCrewNeck', clothesColor: 'blue01', hairColor: 'brownDark',
  })
  const [activeSection, setActiveSection] = useState('skinColor')
  const name = user?.email?.split('@')[0] || 'neighbor'
  const seeds = makeSeeds(name + '-' + batch, 12)

  function shuffle() { setBatch(b => b + 1); setSelected(null) }

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
  const sectionKeys = Object.keys(OPTIONS)
  const tabStyle = (active) => ({ padding: '0.4rem 0.65rem', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, background: active ? '#4ecca3' : '#2a2a2a', color: active ? '#1a1a1a' : '#aaa', whiteSpace: 'nowrap' })

  return (
    <div style={{ padding: '1rem', maxWidth: '500px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{mode === 'pick' ? 'Pick Your Avatar' : 'Customize Avatar'}</h2>
        {onCancel && <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.3rem', cursor: 'pointer' }}>{'\u2715'}</button>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => setMode('pick')} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', background: mode === 'pick' ? '#4ecca3' : '#2a2a2a', color: mode === 'pick' ? '#1a1a1a' : '#aaa', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Browse</button>
        <button onClick={() => setMode('customize')} style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: 'none', background: mode === 'customize' ? '#4ecca3' : '#2a2a2a', color: mode === 'customize' ? '#1a1a1a' : '#aaa', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Customize</button>
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
          <button onClick={shuffle} style={{ display: 'block', width: '100%', marginBottom: '1rem', padding: '0.6rem', borderRadius: '20px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.9rem' }}>{'\uD83C\uDFB2'} Shuffle for more</button>
        </>
      )}

      {mode === 'customize' && (
        <>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <div style={{ width: '120px', height: '120px', margin: '0 auto', borderRadius: '50%', overflow: 'hidden', background: '#2a2a2a', border: '3px solid #4ecca3' }}>
              {previewUrl && <img src={previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <button onClick={randomizeCustom} style={{ marginTop: '0.5rem', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid #666', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.8rem' }}>{'\uD83C\uDFB2'} Randomize</button>
          </div>

          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem', justifyContent: 'center' }}>
            {sectionKeys.map(key => (
              <button key={key} style={tabStyle(activeSection === key)} onClick={() => setActiveSection(key)}>{LABELS[key]}</button>
            ))}
          </div>

          <div style={{ background: '#1e1e1e', borderRadius: '10px', padding: '0.75rem', border: '1px solid #333', marginBottom: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600, color: '#ccc', fontSize: '0.85rem' }}>{LABELS[activeSection]}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
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

export function AvatarDisplay({ url, size = 40, style = {} }) {
  if (!url) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: size * 0.5, flexShrink: 0, ...style }}>
        {'\uD83D\uDC64'}
      </div>
    )
  }
  return <img src={url} alt="Avatar" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#2a2a2a', ...style }} />
}