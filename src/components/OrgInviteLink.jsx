import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import QrShare from './QrShare'
import { askConfirm } from './AdminDialog'
import { useT } from '../utils/lang'

// Round E part 2 (Nov 10): one invite link for the whole group, to paste anywhere
// (a text, Facebook, Signal, a flyer). Leaders can turn it off or make a new one,
// and choose whether the link asks to join first or joins right away.
// New people who come from it skip the app tour and start with Quiet alerts.
export default function OrgInviteLink({ orgId, orgName, isPublic }) {
  const t = useT()
  const [link, setLink] = useState(undefined) // undefined loading, null none, { token, joins_right_away }
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    supabase.rpc('org_invite_link', { p_org: orgId, p_action: 'get' }).then(({ data, error }) => {
      if (!alive) return
      if (error) { if (error.code !== 'PGRST202') console.error('Failed to load invite link:', error); setLink(null); return }
      setLink((Array.isArray(data) ? data[0] : data) || null)
    })
    return () => { alive = false }
  }, [orgId])

  async function act(action) {
    if (action === 'make' && link && !(await askConfirm(t('Make a new link? The old link will stop working.'), { yes: t('Make a new link'), no: t('Keep the old one') }))) return
    if (action === 'off' && !(await askConfirm(t('Turn off the invite link? Anyone holding it will not be able to use it.'), { yes: t('Turn it off'), no: t('Keep it') }))) return
    setBusy(true); setNote('')
    const { data, error } = await supabase.rpc('org_invite_link', { p_org: orgId, p_action: action })
    setBusy(false)
    if (error) { console.error('Invite link change failed:', error); setNote(t("We couldn't save that. Try again.")); return }
    setLink((Array.isArray(data) ? data[0] : data) || null)
    if (action === 'off') setNote(t('The invite link is off.'))
  }

  const url = link ? window.location.origin + '/join/' + link.token : ''
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNote(t('Link copied. Paste it anywhere.')) }
    catch { setNote(t('Press and hold the link to copy it.')) }
  }
  async function share() {
    try { await navigator.share({ title: orgName, text: t('Join {name} on Village Without Borders', { name: orgName }), url }) }
    catch { /* they closed the share sheet */ }
  }

  if (link === undefined) return null
  return (
    <section className="hub-section" aria-labelledby="od-link">
      <div className="hub-section-head"><h2 id="od-link">{t('Invite link')}</h2></div>
      {!link && <>
        <p className="hub-org-desc">{t('One link to paste anywhere: a text, Facebook, Signal, or a flyer. New people sign up and land right on your group.')}</p>
        <button type="button" className="btn btn-primary btn-full" disabled={busy} onClick={() => act('make')}>{t('Make an invite link')}</button>
      </>}
      {link && <>
        <p className="od-link-url"><a href={url}>{url}</a></p>
        <div className="od-link-btns">
          <button type="button" className="btn btn-primary" onClick={copy}>{t('Copy link')}</button>
          {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="btn btn-outline" onClick={share}>{t('Share')}</button>}
        </div>
        <QrShare url={url} title={orgName} hint={t('Someone scans this to join {name}.', { name: orgName })} />
        <fieldset className="od-link-mode">
          <legend>{t('When someone uses the link')}</legend>
          <label className={'org-kind-choice' + (!link.joins_right_away ? ' is-on' : '')}>
            <input type="radio" name="od-link-mode" checked={!link.joins_right_away} disabled={busy} onChange={() => act('ask')} />
            <span>{t('They ask to join. You decide who to add.')}</span>
          </label>
          <label className={'org-kind-choice' + (link.joins_right_away ? ' is-on' : '')}>
            <input type="radio" name="od-link-mode" checked={!!link.joins_right_away} disabled={busy} onChange={() => act('direct')} />
            <span>{t('They join right away.')}</span>
          </label>
        </fieldset>
        <p className="hub-org-desc">{isPublic
          ? t('When the link is shared on Facebook or in a text, the preview shows your group name and the first line of your description.')
          : t('Your group is not public, so the link preview does not show your name. It says someone invited them to a group.')}</p>
        <div className="od-link-btns">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => act('make')}>{t('Make a new link')}</button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => act('off')}>{t('Turn off the link')}</button>
        </div>
      </>}
      {note && <p className="dash-note" role="status">{note}</p>}
    </section>
  )
}
