import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import AvatarBuilder from '../components/AvatarBuilder'
import GroupedSkillChips from '../components/GroupedSkillChips'
import CottageSettings from '../components/CottageSettings'
import { loadSkillCategories } from '../utils/skillGroups'
import { isSimpleView, saveSimpleView } from '../utils/simpleView'
import { startPath, leaveSetup } from '../utils/startPath'
import { pauseFirstRun } from '../utils/firstVillage'
import { useOwnBack } from '../components/BackLink'
import Icon from '../components/Icon'
import { useT } from '../utils/lang'

// Full setup (Nov 1, Jade). For people who picked Full setup when signing up,
// and for Quick start people who tap "Finish setting up" later. Step 1 is Find
// your village (its own screen, before this). Then: avatar, skills, cottage.
// Every step can be skipped. The step is in the address (?step=) so a reload
// stays put. Finishing turns on the full app, then the tour or arranging.
const STEPS = ['avatar', 'skills', 'cottage', 'done']
const TOTAL = STEPS.length + 1

export default function FullSetup() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [params, setParams] = useSearchParams()
  // Nov 7: "Anything you can share?" on Simple home opens just the skills step
  // (/setup?step=skills&only=skills) and comes back home after.
  const lone = params.get('only') === 'skills'
  const step = lone ? 'skills' : (STEPS.includes(params.get('step')) ? params.get('step') : 'avatar')
  const n = STEPS.indexOf(step) + 2
  const headRef = useRef(null)
  const [busy, setBusy] = useState(false)
  useOwnBack()

  useEffect(() => { if (headRef.current) headRef.current.focus() }, [step])

  function go(next) { setParams({ step: next }); window.scrollTo(0, 0) }

  // Setup is done: save that, and turn on the full app (the cottage lives there).
  // skip: "Skip setup for now" keeps the view they have (Simple stays Simple).
  async function finish(to, skip = false) {
    setBusy(true)
    leaveSetup()
    // Arranging comes right after, so the tour waits until they are done.
    if (to.includes('arrange=1')) pauseFirstRun(true)
    const { error } = await supabase.rpc('set_my_setup_done')
    if (error && error.code !== 'PGRST202') console.error('Failed to save setup done:', error)
    if (!skip && isSimpleView()) await saveSimpleView(false)
    if (refreshProfile) await refreshProfile()
    setBusy(false)
    navigate(to, { replace: true })
  }

  const quick = startPath(user) === 'quick'

  return (
    <div className="fs-page">
      {lone && (
        <button type="button" className="fs-back" onClick={() => navigate('/', { replace: true })}>&#8592; {t('Back')}</button>
      )}
      {!lone && STEPS.indexOf(step) > 0 && (
        <button type="button" className="fs-back" onClick={() => go(STEPS[STEPS.indexOf(step) - 1])}>&#8592; {t('Back')}</button>
      )}
      {!lone && (
        <div className="step-indicator">
          <span className="step-text">{t('Step {n} of {total}', { n, total: TOTAL })}</span>
          <div className="step-bar"><div className="step-fill" style={{ width: (n / TOTAL) * 100 + '%' }} /></div>
        </div>
      )}

      {step === 'avatar' && <>
        <h1 ref={headRef} tabIndex={-1}>{t('Make your avatar')}</h1>
        <p className="fs-sub">{t('This little picture shows next to your name. It is a drawing, never a photo.')}</p>
        <AvatarBuilder hideTitle initialConfig={profile?.avatar_config || null} onSave={() => { if (refreshProfile) refreshProfile(); go('skills') }} />
        <button type="button" className="btn btn-outline btn-full fs-skip" onClick={() => go('skills')}>{t('Skip this step')}</button>
      </>}

      {step === 'skills' && <SkillsStep headRef={headRef} lone={lone} onNext={() => (lone ? navigate('/', { replace: true }) : go('cottage'))} />}

      {step === 'cottage' && <>
        <h1 ref={headRef} tabIndex={-1}>{t('Set up your cottage')}</h1>
        <p className="fs-sub">{t('Your cottage is your own little map. It holds everything you are part of: messages, chats, groups and more.')}</p>
        <CottageSettings withBackground saveLabel={t('Save and keep going')} onSaved={() => go('done')} onSkip={() => go('done')} skipLabel={t('Skip this step')} />
      </>}

      {step === 'done' && <>
        <h1 ref={headRef} tabIndex={-1}>{t('Your cottage is ready')}</h1>
        <p className="fs-sub">{t('You can move places around, add trees and flowers, and draw roads and streams. Do it now, or later with the Edit cottage button on your map.')}</p>
        <div className="fs-ends">
          <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => finish('/cottage?arrange=1')}>
            <Icon name="cottage" /> {t('Arrange my cottage now')}
          </button>
          <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={() => finish('/')}>
            {t('Show me around the app first')}
          </button>
        </div>
        {quick && <p className="fs-note">{t('This turns on the full app. You can go back to Simple view any time in Settings.')}</p>}
      </>}

      {step !== 'done' && !lone && (
        <button type="button" className="link-button fs-later" disabled={busy} onClick={() => finish('/', true)}>
          {t('Skip setup for now')}
        </button>
      )}
    </div>
  )
}

function SkillsStep({ headRef, onNext, lone }) {
  const { user, profile, refreshProfile } = useAuth()
  const [options, setOptions] = useState([])
  const [picked, setPicked] = useState(profile?.skills || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const t = useT()

  useEffect(() => { let alive = true; loadSkillCategories().then((s) => { if (alive) setOptions(s) }); return () => { alive = false } }, [])

  function toggle(s) { setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s])) }

  async function save() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('helper_profiles').update({ skills: picked }).eq('user_id', user.id)
    setBusy(false)
    if (error) { console.error('Failed to save skills:', error); setErr(t('Could not save your skills. Try again, or skip for now.')); return }
    if (refreshProfile) refreshProfile()
    onNext()
  }

  return <>
    <h1 ref={headRef} tabIndex={-1}>{t(lone ? 'Anything you can share?' : 'What can you help with?')}</h1>
    <p className="fs-sub">{t(lone ? 'Even listening counts. Pick anything you are happy to do. Neighbors who need that kind of help can find you. You can change this any time.' : 'Pick anything you are good at or happy to do. Neighbors who need that kind of help can find you. You can change this any time.')}</p>
    {options.length === 0
      ? <p className="fs-sub" role="status">{t('Loading skills...')}</p>
      : <GroupedSkillChips selected={picked} skills={options} renderChip={(s) => (
          <button key={s} type="button" className={'skill-chip' + (picked.includes(s) ? ' active' : '')} aria-pressed={picked.includes(s)} onClick={() => toggle(s)}>{t(s)}</button>
        )} />}
    {err && <p className="form-error" role="alert">{err}</p>}
    <div className="fs-ends">
      <button type="button" className="btn btn-primary btn-full" disabled={busy || picked.length === 0} onClick={save}>{busy ? t('Saving...') : t(lone ? 'Save' : 'Save and keep going')}</button>
      <button type="button" className="btn btn-outline btn-full" disabled={busy} onClick={onNext}>{t(lone ? 'Not now' : 'Skip this step')}</button>
    </div>
  </>
}
