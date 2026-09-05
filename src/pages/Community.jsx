import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const CATEGORIES = ['Emergency Help', 'Safety', 'Food', 'Tenant Rights', 'Housing', 'Government', 'Other']
const CAT_ICONS = { 'Emergency Help': '&#9888;', 'Safety': '&#128156;', 'Food': '&#127859;', 'Tenant Rights': '&#127968;', 'Housing': '&#127969;', 'Government': '&#128203;', 'Other': '&#128204;' }

export default function Community() {
  const navigate = useNavigate()
  const { user, profile, isAdmin } = useAuth()
  const hasCampfire = profile?.is_hope_ambassador || isAdmin
  const canVerify = profile?.is_hope_ambassador || isAdmin

  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCats, setExpandedCats] = useState([])
  const [showSubmit, setShowSubmit] = useState(false)
  const [subName, setSubName] = useState('')
  const [subDesc, setSubDesc] = useState('')
  const [subCat, setSubCat] = useState('')
  const [subPhone, setSubPhone] = useState('')
  const [subUrl, setSubUrl] = useState('')
  const [subAddress, setSubAddress] = useState('')
  const [subHood, setSubHood] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [sendingFeedback, setSendingFeedback] = useState(false)

  useEffect(() => { loadResources() }, [])
  useEffect(() => { if (profile?.neighborhood && !subHood) setSubHood(profile.neighborhood) }, [profile])

  async function loadResources() {
    setLoading(true)
    const { data } = await supabase.from('community_resources').select('*').order('category').order('name')
    if (data) setResources(data)
    setLoading(false)
  }

  async function submitResource() {
    if (!subName.trim() || !subCat) return
    setSubmitting(true)
    await supabase.from('community_resources').insert({
      submitted_by: user.id, name: subName.trim(), description: subDesc.trim() || null,
      category: subCat, phone: subPhone.trim() || null, url: subUrl.trim() || null,
      address: subAddress.trim() || null, neighborhood: subHood.trim() || null,
    })
    setSubmitting(false)
    setSubmitted(true)
    setSubName(''); setSubDesc(''); setSubCat(''); setSubPhone(''); setSubUrl(''); setSubAddress('')
    await loadResources()
  }

  async function verifyResource(id) {
    await supabase.from('community_resources').update({ verified: true, verified_by: user.id }).eq('id', id)
    await loadResources()
  }

  function toggleCat(cat) {
    setExpandedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  const verified = resources.filter(r => r.verified)
  const pending = resources.filter(r => !r.verified)
  const grouped = {}
  verified.forEach(r => { if (!grouped[r.category]) grouped[r.category] = []; grouped[r.category].push(r) })

  const fieldStyle = { display: 'block', width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.85rem', marginBottom: '0.5rem', boxSizing: 'border-box' }

  return (
    <div className="community-page">
      <h1>Community</h1>
      <p className="feed-subtitle" style={{ marginBottom: '1rem' }}>Connect, learn, and build together.</p>

      <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'linear-gradient(135deg, #1a4a3a, #2d5a45)', border: '2px solid #4ecca3', borderRadius: '12px', textDecoration: 'none', marginBottom: '0.75rem' }}>
        <img src="/images/vwb_header.png" alt="VWB" style={{ height: '40px', borderRadius: '50%' }} />
        <div>
          <span style={{ display: 'block', color: '#4ecca3', fontWeight: 700, fontSize: '0.95rem' }}>Village Without Borders</span>
          <span style={{ color: '#8fc', fontSize: '0.75rem' }}>Visit our website &#8599;</span>
        </div>
      </a>

      {hasCampfire ? (
        <button onClick={() => navigate("/campfire")} style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", padding: "0.75rem", background: "linear-gradient(135deg, #3a2a10, #4a3520)", border: "2px solid #ff8844", borderRadius: "12px", cursor: "pointer", textAlign: "left", marginBottom: "1.25rem" }}>
          <span style={{ fontSize: "1.5rem" }}>&#128293;</span>
          <div>
            <span style={{ display: "block", color: "#ffaa44", fontWeight: 700, fontSize: "0.95rem" }}>The Campfire</span>
            <span style={{ color: "#cc9966", fontSize: "0.75rem" }}>Chat with fellow ambassadors and admins</span>
          </div>
        </button>
      ) : (
        <div style={{ padding: "0.75rem", background: "#1e1e1e", border: "1px solid #333", borderRadius: "12px", marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.5rem", opacity: 0.4 }}>&#128293;</span>
          <div>
            <span style={{ display: "block", color: "#888", fontWeight: 600, fontSize: "0.9rem" }}>The Campfire</span>
            <span style={{ color: "#666", fontSize: "0.75rem" }}>Become a Hope Ambassador to join</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#4ecca3', margin: 0 }}>Resource Library</h2>
        <button onClick={() => { setShowSubmit(true); setSubmitted(false) }} style={{ background: 'none', border: 'none', color: '#4ecca3', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>+ Add Resource</button>
      </div>

      {showSubmit && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSubmit(false)}>
          <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem', maxWidth: '400px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, color: '#4ecca3' }}>Submit a Resource</h3>
              <button onClick={() => setShowSubmit(false)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.25rem', cursor: 'pointer' }}>&#10005;</button>
            </div>
            {submitted ? (
              <p style={{ color: '#4ecca3', fontWeight: 600, margin: 0 }}>Thank you! Your resource has been submitted for review.</p>
            ) : (
              <>
                <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>Share a resource with your community. Hope Ambassadors will verify submissions.</p>
                <select style={fieldStyle} value={subCat} onChange={e => setSubCat(e.target.value)}>
                  <option value="">Choose a category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input style={fieldStyle} placeholder="Resource name" value={subName} onChange={e => setSubName(e.target.value)} maxLength={120} />
                <textarea style={{ ...fieldStyle, minHeight: '60px', resize: 'vertical' }} placeholder="Description" value={subDesc} onChange={e => setSubDesc(e.target.value)} maxLength={500} />
                <input style={fieldStyle} placeholder="Phone number (optional)" value={subPhone} onChange={e => setSubPhone(e.target.value)} />
                <input style={fieldStyle} placeholder="Website URL (optional)" value={subUrl} onChange={e => setSubUrl(e.target.value)} />
                <input style={fieldStyle} placeholder="Address (optional)" value={subAddress} onChange={e => setSubAddress(e.target.value)} />
                <input style={fieldStyle} placeholder="Neighborhood or area" value={subHood} onChange={e => setSubHood(e.target.value)} />
                <button onClick={submitResource} disabled={!subName.trim() || !subCat || submitting} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!subName.trim() || !subCat || submitting) ? 0.5 : 1 }}>
                  {submitting ? 'Submitting...' : 'Submit Resource'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {canVerify && pending.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ color: '#ffaa44', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Pending review ({pending.length})</p>
          {pending.map(r => (
            <div key={r.id} style={{ background: '#1e1e1e', border: '1px solid #444', borderRadius: '8px', padding: '0.6rem', marginBottom: '0.35rem', borderLeft: '3px solid #ffaa44' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{r.name}</span>
                <button onClick={() => verifyResource(r.id)} style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}>Verify</button>
              </div>
              {r.description && <p style={{ color: '#aaa', fontSize: '0.75rem', margin: '0.2rem 0' }}>{r.description}</p>}
              <span style={{ color: '#888', fontSize: '0.7rem' }}>{r.category}</span>
            </div>
          ))}
        </div>
      )}

      {loading && <p style={{ textAlign: 'center', color: '#888', padding: '1rem' }}>Loading...</p>}

      {!loading && Object.keys(grouped).map(cat => {
        const isOpen = expandedCats.includes(cat)
        return (
          <div key={cat} style={{ marginBottom: '0.5rem' }}>
            <button onClick={() => toggleCat(cat)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.75rem', background: '#1e1e1e', border: '1px solid #333', borderRadius: isOpen ? '10px 10px 0 0' : '10px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span dangerouslySetInnerHTML={{ __html: CAT_ICONS[cat] || '&#128204;' }} style={{ fontSize: '1.1rem', color: cat === 'Emergency Help' ? '#ffaa44' : undefined }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ddd' }}>{cat}</span>
                <span style={{ color: '#888', fontSize: '0.8rem' }}>({grouped[cat].length})</span>
              </div>
              <span style={{ color: '#4ecca3', fontSize: '1rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>&#9660;</span>
            </button>
            {isOpen && (
              <div style={{ border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                {grouped[cat].map(r => (
                  <div key={r.id} style={{ padding: '0.75rem', borderBottom: '1px solid #2a2a2a' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#eee' }}>{r.name}</span>
                    {r.description && <p style={{ color: '#aaa', fontSize: '0.8rem', margin: '0.2rem 0 0.4rem', lineHeight: 1.4 }}>{r.description}</p>}
                    {r.address && <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.1rem 0' }}>{r.address}</p>}
                    {r.neighborhood && <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.1rem 0' }}>Area: {r.neighborhood}</p>}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#4ecca3', textDecoration: 'none', fontWeight: 600 }}>Visit &#8599;</a>}
                      {r.phone && <a href={'tel:' + r.phone.replace(/[^0-9+]/g, '')} style={{ fontSize: '0.8rem', color: '#66aaff', textDecoration: 'none', fontWeight: 600 }}>Call {r.phone}</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {!loading && verified.length === 0 && (
        <p style={{ textAlign: 'center', color: '#666', padding: '1.5rem' }}>No resources yet. Be the first to add one.</p>
      )}

      <div style={{ marginTop: '1.5rem' }}>
        <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1rem' }}>
          <span>&#128197;</span>
          <h2 style={{ fontSize: '1rem', margin: '0.25rem 0', display: 'inline', marginLeft: '0.4rem' }}>Community Calendar</h2>
          <p style={{ color: '#aaa', fontSize: '0.85rem', marginTop: '0.25rem' }}>Events, workshops, and meetups from mutual aid partners across the Chattanooga Valley.</p>
          <span style={{ color: '#888', fontSize: '0.75rem', fontStyle: 'italic' }}>Coming soon</span>
        </div>
      </div>

      <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '12px', padding: '1rem', marginTop: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span>&#128172;</span> Feedback</h2>
        <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>Tell us what your community needs. Your input shapes what we build next.</p>
        {feedbackSent ? (
          <p style={{ color: '#4ecca3', fontWeight: 600 }}>Thank you! Your feedback has been submitted.</p>
        ) : (
          <>
            <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="What would help your community? What should we build next?" rows={3} maxLength={2000} style={{ display: 'block', width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '0.9rem', resize: 'vertical', marginBottom: '0.5rem', boxSizing: 'border-box' }} />
            <button disabled={!feedbackText.trim() || sendingFeedback} onClick={async () => { setSendingFeedback(true); await supabase.from('feedback').insert({ user_id: user.id, body: feedbackText.trim() }); setSendingFeedback(false); setFeedbackSent(true); setFeedbackText('') }} style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', border: 'none', background: '#4ecca3', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer', opacity: (!feedbackText.trim() || sendingFeedback) ? 0.5 : 1 }}>{sendingFeedback ? 'Sending...' : 'Submit Feedback'}</button>
          </>
        )}
      </div>
    </div>
  )
}