import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import Icon from './Icon'
import { tell } from './AdminDialog'
import { useT, t } from '../utils/lang'

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

// Nov 7 (Jade): plain names, in the order people usually build a face.
const PART_NAMES = {
  top: 'Hair and hats', accessories: 'Glasses', hairColor: 'Hair color',
  facialHair: 'Beard', facialHairColor: 'Beard color',
  clothing: 'Clothes', clothesColor: 'Clothes color',
  eyes: 'Eyes', eyebrows: 'Eyebrows', mouth: 'Mouth', skinColor: 'Skin',
}

// Plain names for DiceBear's choices (it calls them things like "straight01" or "miaWallace").
const OPTION_NAMES = {
  bigHair: 'Big hair', bob: 'Bob', bun: 'Bun', curly: 'Curly', curvy: 'Long waves', dreads: 'Locs',
  frida: 'Flower crown', fro: 'Afro', froBand: 'Afro with band', miaWallace: 'Bob with bangs',
  longButNotTooLong: 'Medium long', shavedSides: 'Shaved sides', straight01: 'Long straight',
  straight02: 'Long straight, parted', straightAndStrand: 'Straight with a loose strand',
  dreads01: 'Short locs', dreads02: 'Locs, shaved sides', frizzle: 'Frizzy', shaggy: 'Shaggy',
  shaggyMullet: 'Mullet', shortCurly: 'Short curly', shortFlat: 'Short flat', shortRound: 'Short round',
  shortWaved: 'Short waves', sides: 'Bald on top', theCaesar: 'Buzz cut', theCaesarAndSidePart: 'Short, side part',
  winterHat1: 'Winter hat', winterHat02: 'Winter hat with ears', winterHat03: 'Beanie with pom',
  winterHat04: 'Knit cap', hat: 'Hat', hijab: 'Hijab', turban: 'Turban',
  kurt: 'Round shades', prescription01: 'Glasses', prescription02: 'Wide glasses', round: 'Round glasses',
  sunglasses: 'Sunglasses', wayfarers: 'Square shades', eyepatch: 'Eye patch',
  beardLight: 'Light beard', beardMajestic: 'Full beard', beardMedium: 'Medium beard',
  moustacheFancy: 'Curled moustache', moustacheMagnum: 'Thick moustache',
  blazerAndShirt: 'Jacket and shirt', blazerAndSweater: 'Jacket and sweater', collarAndSweater: 'Collar and sweater',
  graphicShirt: 'T-shirt with a picture', hoodie: 'Hoodie', overall: 'Overalls',
  shirtCrewNeck: 'T-shirt', shirtScoopNeck: 'Scoop neck', shirtVNeck: 'V-neck',
  closed: 'Closed', cry: 'Teary', default: 'Open', eyeRoll: 'Eye roll', happy: 'Happy', hearts: 'Hearts',
  side: 'Looking away', squint: 'Squint', surprised: 'Surprised', wink: 'Wink', winkWacky: 'Silly wink', xDizzy: 'Dizzy',
  angry: 'Cross', angryNatural: 'Cross, natural', defaultNatural: 'Natural', flatNatural: 'Flat',
  frownNatural: 'Frown', raisedExcited: 'Raised', raisedExcitedNatural: 'Raised, natural',
  sadConcerned: 'Worried', sadConcernedNatural: 'Worried, natural', unibrowNatural: 'One brow',
  upDown: 'One up', upDownNatural: 'One up, natural',
  concerned: 'Worried', disbelief: 'Doubtful', eating: 'Eating', grimace: 'Grimace', sad: 'Sad',
  screamOpen: 'Shouting', serious: 'Serious', smile: 'Smile', tongue: 'Tongue out', twinkle: 'Little smile', vomit: 'Sick',
}
// The eyebrows and mouth share some DiceBear names with the eyes ("default").
const OPTION_NAMES_BY_PART = { eyebrows: { default: 'Plain' }, mouth: { default: 'Plain' } }
function optionName(val, part) {
  return (OPTION_NAMES_BY_PART[part] && OPTION_NAMES_BY_PART[part][val]) || OPTION_NAMES[val] || val
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
  useT()
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
    if (error) tell(t('Could not save avatar. Try again.'), { tone: 'error' })
    else if (onSave) onSave(url, saveData)
    setSaving(false)
  }

  const previewUrl = getPreviewUrl()
  const canSave = mode === 'pick' ? !!selected : Object.keys(config).length > 0
  const sectionKeys = [...Object.keys(OPTIONS), ...Object.keys(COLOR_OPTIONS)]

  // Nov 7 (Jade): the builder follows light or dark, has one way out (Cancel), plain
  // names for every choice, 44px buttons, and on a computer the picture sits on the
  // left with the choices on the right (classes in index.css, "Avatar builder").
  return (
    <div className="ab">
      <h2 className="ab-title">{t(mode === 'pick' ? 'Pick your avatar' : 'Make your avatar')}</h2>

      <div className="ab-modes" role="group" aria-label={t('How to make your avatar')}>
        <button type="button" className={'ab-mode' + (mode === 'pick' ? ' on' : '')} aria-pressed={mode === 'pick'} onClick={() => switchMode('pick')}>{t('Pick one')}</button>
        <button type="button" className={'ab-mode' + (mode === 'customize' ? ' on' : '')} aria-pressed={mode === 'customize'} onClick={() => switchMode('customize')}>{t('Make my own')}</button>
      </div>

      {mode === 'pick' && (
        <div className="ab-pick">
          <div className="ab-grid">
            {seeds.map((seed, seedIndex) => (
              <button key={seed} type="button" className={'ab-face' + (selected === seed ? ' on' : '')} onClick={() => setSelected(seed)} aria-pressed={selected === seed} aria-label={t(selected === seed ? 'Avatar option {n}, selected' : 'Avatar option {n}', { n: seedIndex + 1 })}>
                <img src={BASE + '?seed=' + encodeURIComponent(seed)} alt="" width="96" height="96" loading="lazy" />
              </button>
            ))}
          </div>
          <button type="button" className="ab-soft" onClick={shuffle}><Icon name="dice" /> {t('Show me more')}</button>
        </div>
      )}

      {mode === 'customize' && (
        <div className="ab-make">
          <div className="ab-preview">
            <div className="ab-preview-pic">
              {previewUrl && <img src={previewUrl} alt={t('Your avatar')} width="200" height="200" />}
            </div>
            <button type="button" className="ab-soft" onClick={randomizeCustom}><Icon name="dice" /> {t('Surprise me')}</button>
          </div>

          <div className="ab-choices">
            <div className="ab-parts" role="group" aria-label={t('Part to change')}>
              {sectionKeys.map((key) => (
                <button key={key} type="button" className={'ab-part' + (activeSection === key ? ' on' : '')} aria-pressed={activeSection === key} onClick={() => setActiveSection(key)}>{t(PART_NAMES[key])}</button>
              ))}
            </div>

            <div className="ab-options" role="group" aria-label={t(PART_NAMES[activeSection])}>
              {COLOR_OPTIONS[activeSection] ? (
                COLOR_OPTIONS[activeSection].map(({ name: colorName, hex }) => {
                  const isActive = config[activeSection] === hex
                  return (
                    <button key={hex} type="button" className={'ab-opt' + (isActive ? ' on' : '')} aria-pressed={isActive} onClick={() => update(activeSection, hex)}>
                      <span className="ab-swatch" style={{ background: '#' + hex }} aria-hidden="true" />
                      {t(colorName)}
                    </button>
                  )
                })
              ) : (
                <>
                  {(activeSection === 'accessories' || activeSection === 'facialHair') && (
                    <button type="button" className={'ab-opt' + (!config[activeSection] ? ' on' : '')} aria-pressed={!config[activeSection]} onClick={() => update(activeSection, '')}>{t('None')}</button>
                  )}
                  {OPTIONS[activeSection].map((val) => {
                    const isActive = config[activeSection] === val
                    return (
                      <button key={val} type="button" className={'ab-opt' + (isActive ? ' on' : '')} aria-pressed={isActive} onClick={() => update(activeSection, val)}>{t(optionName(val, activeSection))}</button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="ab-actions">
        {onCancel && <button type="button" className="btn btn-outline ab-cancel" onClick={onCancel}>{t('Cancel')}</button>}
        <button type="button" className="btn btn-primary ab-save" onClick={handleSave} disabled={saving || !canSave}>
          {t(saving ? 'Saving...' : 'Save my avatar')}
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
      <div style={{ width: size, height: size, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a8a8a', fontSize: size * 0.5, flexShrink: 0, ...style }}>
        <Icon name="person" />
      </div>
    )
  }
  return <img src={url} alt={t('Avatar')} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#2a2a2a', ...style }} />
}