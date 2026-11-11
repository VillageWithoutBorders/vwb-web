import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { saveFile, toCsv, fileSlug } from '../utils/download'
import { useT } from '../utils/lang'

// "Take your information with you" (Nov 7, Jade; Berkeley "Securing Mutual
// Aid" principles). Heads download what their group built on VWB. The
// database decides who may and what is in it (vwb-group-download.sql), and
// tells the other Heads and organizers each time.

const SHEETS = [
  { k: 'members', label: 'Members', cols: [['name', 'Name'], ['role', 'Role'], ['joined', 'Joined']] },
  { k: 'events', label: 'Events', cols: [['title', 'Title'], ['starts', 'Starts'], ['ends', 'Ends'], ['place', 'Place'], ['address', 'Address'], ['online_link', 'Online link'], ['who_can_see', 'Who can see'], ['status', 'Status'], ['description', 'Description']] },
  { k: 'resources', label: 'Resources', cols: [['name', 'Name'], ['kinds_of_help', 'Kinds of help'], ['phone', 'Phone'], ['website', 'Website'], ['address', 'Address'], ['hours', 'Hours'], ['description', 'Description']] },
  { k: 'needs', label: 'Needs', cols: [['kind_of_help', 'Kind of help'], ['details', 'Details'], ['how_soon', 'How soon'], ['status', 'Status'], ['posted', 'Posted']] },
  { k: 'offers', label: 'Offers', cols: [['what', 'What'], ['details', 'Details'], ['kind', 'Kind'], ['still_available', 'Still available'], ['posted', 'Posted']] },
  { k: 'decisions', label: 'Decisions', cols: [['title', 'Title'], ['outcome', 'Outcome'], ['decided_by', 'Decided by'], ['yes', 'Yes'], ['yes_with_a_worry', 'Yes, with a worry'], ['no', 'No'], ['opened', 'Opened'], ['closed', 'Closed'], ['details', 'Details']] },
]

export default function GroupDownload({ orgId }) {
  const t = useT()
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')

  async function fetchAll() {
    const { data, error } = await supabase.rpc('export_group_data', { p_org: orgId })
    if (error) {
      console.error('Failed to download group information:', error)
      setNote(error.message && error.message.length < 140 ? t(error.message) : t('Something went wrong. Try again.'))
      return null
    }
    return data
  }

  async function everything() {
    setBusy('all'); setNote('')
    const data = await fetchAll()
    setBusy('')
    if (!data) return
    const day = new Date().toISOString().slice(0, 10)
    saveFile(fileSlug(data.group?.name) + '-vwb-' + day + '.json', JSON.stringify(data, null, 2), 'application/json')
    setNote(t('Downloaded. Your other Heads and organizers got an alert that you did this.'))
  }

  async function sheet(s) {
    setBusy(s.k); setNote('')
    const data = await fetchAll()
    setBusy('')
    if (!data) return
    const day = new Date().toISOString().slice(0, 10)
    const cols = s.cols.map(([k, h]) => [k, t(h)])
    // The usual role words in the reader's language; titles a group picked stay as written.
    const rows = s.k === 'members' ? (data.members || []).map((m) => ({ ...m, role: ['Head', 'Organizer', 'Member'].includes(m.role) ? t(m.role) : m.role })) : data[s.k]
    saveFile(fileSlug(data.group?.name) + '-' + s.k + '-' + day + '.csv', toCsv(rows, cols), 'text/csv;charset=utf-8')
    setNote(t('Downloaded. Your other Heads and organizers got an alert that you did this.'))
  }

  return (
    <section className="hub-section" aria-labelledby="od-download">
      <div className="hub-section-head"><h2 id="od-download">{t('Take your information with you')}</h2></div>
      <p className="hub-org-desc">{t('What your group built here belongs to your group. Download it any time, to keep a copy or to move to another tool.')}</p>
      <p className="hub-org-desc">{t('It has your members (names and roles only), events, resources, needs, offers, decisions and connected groups. It never has chats, contact details, or who signed up for an event.')}</p>
      <button type="button" className="btn btn-primary btn-full gdl-btn" disabled={!!busy} onClick={everything}>
        {busy === 'all' ? t('Getting it ready...') : t('Download everything (one file)')}
      </button>
      <p className="gdl-fine">{t('One file for moving to another app. Spreadsheets, one at a time:')}</p>
      <div className="gdl-sheets">
        {SHEETS.map((s) => (
          <button key={s.k} type="button" className="btn btn-outline gdl-btn" disabled={!!busy} onClick={() => sheet(s)} data-tip={t('Download this list as a spreadsheet.')}>
            {busy === s.k ? t('Getting it ready...') : t(s.label)}
          </button>
        ))}
      </div>
      <p className="gdl-fine">{t("Keep these files safe. They have your members' names. Your other Heads and organizers get an alert each time.")}</p>
      {note && <p className="hub-note" role="status">{note}</p>}
    </section>
  )
}
