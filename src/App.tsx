import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { ClaimForm, ClaimHistory } from './Claims.tsx'
import { supabase } from './lib/supabase.ts'

type Section = 'general' | 'id_card' | 'room_key'
type ReportKind = 'lost' | 'found'
type Report = {
  id: string; kind: ReportKind; section: Section; status: string; title: string
  category?: string | null; description?: string | null; location?: string | null
  occurred_on?: string | null; approximate_date?: boolean
  cardholder_name?: string | null; roll_number?: string | null; id_number?: string | null
  room_number?: string | null; holder_name?: string | null; created_at?: string
}
type AppProps = { email: string; onSignOut: () => void }

const sectionLabels: Record<Section, string> = { general: 'General items', id_card: 'ID cards', room_key: 'Room keys' }
const emptyForm = { title: '', category: '', description: '', location: '', occurred_on: '', approximate_date: false, withheld_detail_confirmed: false, cardholder_name: '', roll_number: '', id_number: '', room_number: '', holder_name: '' }

export function SignInScreen({ configured, error, loading, onSignIn }: { configured: boolean; error: string; loading: boolean; onSignIn: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand auth-brand" href="#home"><span className="brand-mark">f</span><span>foundry<span className="brand-dot">.</span></span></a>
        <div className="auth-eyebrow">ASHOKA UNIVERSITY · LOST &amp; FOUND</div>
        <h1>Find your way<br /><em>back to what matters.</em></h1>
        <p>Sign in with your Ashoka Google account to browse reports, post an item, or follow a claim.</p>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {!configured && <div className="auth-error" role="alert">Supabase is not configured. Add the project URL and publishable key to <code>.env.local</code>, then restart the dev server.</div>}
        <button className="google-button" disabled={!configured || loading} onClick={onSignIn}>
          <span className="google-g" aria-hidden="true">G</span>{loading ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <div className="auth-note">Use your <strong>@ashoka.edu.in</strong> account. Only university members can access listings.</div>
      </section>
      <div className="auth-footer">A little lost, a little found. <span>·</span> Foundry</div>
    </main>
  )
}

function App({ email, onSignOut }: AppProps) {
  const [section, setSection] = useState<Section>('general')
  const [kind, setKind] = useState<ReportKind>('lost')
  const [view, setView] = useState<'discover' | 'mine' | 'claims'>('discover')
  const [claiming, setClaiming] = useState<Report | null>(null)
  const [query, setQuery] = useState('')
  const [reports, setReports] = useState<Report[]>([])
  const [mine, setMine] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Report | null>(null)
  const [formKind, setFormKind] = useState<ReportKind>('lost')
  const [formSection, setFormSection] = useState<Section>('general')
  const [form, setForm] = useState(emptyForm)
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const loadMine = useCallback(async () => {
    if (!supabase) return
    const { data, error: resultError } = await supabase.rpc('list_my_reports')
    if (resultError) throw resultError
    setMine((data ?? []) as Report[])
  }, [])
  const loadDirectory = useCallback(async () => {
    if (!supabase) return
    const { data, error: resultError } = await supabase.rpc('directory_reports', {
      p_section: section, p_kind: kind, p_query: query.trim(),
    })
    if (resultError) throw resultError
    setReports((data ?? []) as Report[])
  }, [section, kind, query])
  const reload = useCallback(async () => {
    try { await Promise.all([loadMine(), loadDirectory()]); setError('') }
    catch { setError('Could not load reports. Check your connection and retry.') }
    finally { setLoading(false) }
  }, [loadMine, loadDirectory])
  useEffect(() => {
    const task = window.setTimeout(() => { void reload() }, 0)
    return () => window.clearTimeout(task)
  }, [reload])

  const quota = useMemo(() => ({
    lost: mine.filter((item) => item.kind === 'lost' && (item.status === 'open' || item.status === 'reserved')).length,
    found: mine.filter((item) => item.kind === 'found' && (item.status === 'open' || item.status === 'reserved')).length,
  }), [mine])

  function startCreate() {
    setEditing(null); setForm(emptyForm); setSelectedPhotos([]); setFormKind(kind); setFormSection(section); setFormOpen(true); setError(''); setNotice('')
  }
  function startEdit(report: Report) {
    setEditing(report); setFormKind(report.kind); setFormSection(report.section)
    setForm({ ...emptyForm, title: report.title, category: report.category ?? '', description: report.description ?? '', location: report.location ?? '', occurred_on: report.occurred_on ?? '', approximate_date: report.approximate_date ?? false, cardholder_name: report.cardholder_name ?? '', roll_number: report.roll_number ?? '', id_number: report.id_number ?? '', room_number: report.room_number ?? '', holder_name: report.holder_name ?? '' })
    setSelectedPhotos([]); setFormOpen(true); setError(''); setNotice('')
  }
  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }
  async function saveReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setError(''); setNotice('')
    const data: Record<string, string | boolean> = editing ? {} : { kind: formKind, section: formSection }
    if (formSection === 'general') Object.assign(data, { title: form.title, category: form.category, description: form.description, location: form.location, occurred_on: form.occurred_on, approximate_date: form.approximate_date, ...(formKind === 'found' ? { withheld_detail_confirmed: form.withheld_detail_confirmed } : {}) })
    if (formSection === 'id_card') Object.assign(data, { cardholder_name: form.cardholder_name, roll_number: form.roll_number, id_number: form.id_number })
    if (formSection === 'room_key') Object.assign(data, { room_number: form.room_number, holder_name: form.holder_name })
    const { data: savedId, error: resultError } = editing
      ? await supabase.rpc('edit_report', { p_report_id: editing.id, p_data: data })
      : await supabase.rpc('create_report', { p_data: data })
    if (resultError) {
      setSaving(false)
      setError(resultError.message.includes('Active report limit') ? `You already have 3 active ${formKind} reports. Close one from My Listings to make room.` : 'Report could not be saved. Check the fields and try again.')
      return
    }
    const reportId = editing?.id ?? (savedId as string | null)
    let photoNotice = ''
    if (reportId && selectedPhotos.length) {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.access_token) {
        photoNotice = 'Report saved. Sign in again, then edit the report to attach your photos.'
      } else {
        for (const file of selectedPhotos.slice(0, 3)) {
          const { error: photoError } = await supabase.functions.invoke('report-photo', {
            body: file,
            headers: { Authorization: `Bearer ${session.access_token}`, 'x-report-id': reportId },
          })
          if (photoError) {
            photoNotice = 'Report saved, but a photo could not be uploaded. Edit the report and retry.'
            break
          }
        }
      }
    }
    setSaving(false)
    setFormOpen(false); setNotice(photoNotice || (editing ? 'Report updated.' : 'Report posted.')); setView('mine'); setLoading(true)
    await reload()
  }
  async function closeReport(report: Report) {
    if (!supabase) return
    setError(''); setNotice('')
    const { error: resultError } = await supabase.rpc('close_report', { p_report_id: report.id })
    if (resultError) { setError('Could not close this report. Refresh and try again.'); return }
    setNotice(report.kind === 'lost' ? 'Lost report marked resolved.' : 'Found report withdrawn.'); setLoading(true); await reload()
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Foundry home"><span className="brand-mark">f</span><span>foundry<span className="brand-dot">.</span></span></a>
        <div className="campus-label">ASHOKA UNIVERSITY</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={`nav-link ${view === 'discover' ? 'active' : ''}`} onClick={() => setView('discover')}><span>⌕</span> Discover</button>
          <button className={`nav-link ${view === 'mine' ? 'active' : ''}`} onClick={() => setView('mine')}><span>▤</span> My listings</button>
          <button className={`nav-link ${view === 'claims' ? 'active' : ''}`} aria-label="My claims" onClick={() => setView('claims')}><span aria-hidden="true">◇</span> My claims</button>
          <span className="nav-link muted-nav"><span>♧</span> Notifications</span>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile"><div className="avatar">{email.slice(0, 1).toUpperCase()}</div><div className="profile-text"><strong>Ashoka member</strong><span>{email}</span></div><button className="more" onClick={onSignOut}>↗</button></div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar"><div className="breadcrumb">Campus services <span>/</span> <strong>Lost &amp; found</strong></div><div className="top-actions"><span className="signed-in-email">{email}</span><button className="signout-button" onClick={onSignOut}>Sign out</button></div></header>
        <div className="content">
          {view === 'discover' ? <>
            <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot" /> YOUR CAMPUS, A LITTLE MORE CONNECTED</div><h1>Lost something?<br /><em>Let’s bring it home.</em></h1><p className="intro">Search campus reports or add one of your own.</p></div><div className="welcome-art" aria-hidden="true"><div className="art-sun" /><div className="art-card card-one">✳</div><div className="art-card card-two">↗</div><div className="art-ring" /></div></section>
            <section className="search-card" aria-label="Find an item"><label className="search-input"><span>⌕</span><input type="search" value={query} onChange={(event) => { setLoading(true); setError(''); setQuery(event.target.value) }} placeholder={section === 'general' ? 'Search item, category, or location' : section === 'id_card' ? 'Search name, roll number, or ID number' : 'Search room number or holder name'} aria-label="Search reports" /></label><div className="search-controls"><div className="segmented" role="group" aria-label="Report type">{(['lost', 'found'] as const).map((option) => <button key={option} className={kind === option ? 'selected' : ''} onClick={() => { setLoading(true); setError(''); setKind(option) }}>{option === 'lost' ? 'Lost' : 'Found'}</button>)}</div><button className="report-button" onClick={startCreate}>＋ <span>Report an item</span></button></div></section>
            <section className="directory-section"><div className="section-heading"><div><div className="eyebrow small">THE CAMPUS BOARD</div><h2>Browse {kind} items</h2></div></div>
              <div className="category-tabs" role="tablist" aria-label="Item category">{(Object.keys(sectionLabels) as Section[]).map((item) => <button role="tab" aria-selected={section === item} key={item} className={section === item ? 'category-tab active-tab' : 'category-tab'} onClick={() => { setLoading(true); setError(''); setSection(item) }}>{sectionLabels[item]}</button>)}</div>
              {loading ? <p role="status">Loading reports…</p> : error ? <div className="auth-error" role="alert">{error} <button className="outline-button" onClick={() => { setLoading(true); void reload() }}>Retry</button></div> : reports.length ? <div className="report-grid">{reports.map((report) => <ReportCard key={report.id} report={report} onClaim={report.kind === 'found' ? () => setClaiming(report) : undefined} />)}</div> : <div className="empty-state"><div className="empty-illustration"><span className="empty-halo" /><span className="empty-box">{section === 'id_card' ? '▤' : section === 'room_key' ? '⌑' : '⌕'}</span><span className="sparkle sparkle-a">✳</span><span className="sparkle sparkle-b">✦</span></div><h3>Your campus board starts here</h3><p>No open {kind} reports in {sectionLabels[section].toLowerCase()} yet.</p><button className="outline-button" onClick={startCreate}>＋ Post a {kind} item</button></div>}
            </section>
          </> : view === 'claims' ? <ClaimHistory /> : <section className="directory-section"><div className="eyebrow small">YOUR DASHBOARD</div><h1>My listings</h1><div className="quota-row"><span>Lost: {quota.lost}/3</span><span>Found: {quota.found}/3</span><button className="report-button" onClick={startCreate}>＋ Report an item</button></div>{loading ? <p role="status">Loading your reports…</p> : mine.length ? <div className="report-grid">{mine.map((report) => <ReportCard key={report.id} report={report} owner onEdit={() => startEdit(report)} onClose={() => void closeReport(report)} />)}</div> : <div className="empty-state"><h3>No listings yet</h3><p>Reports you create will appear here.</p><button className="outline-button" onClick={startCreate}>＋ Report an item</button></div>}</section>}
          {claiming && (
            <ClaimForm
              report={claiming}
              lostReports={mine.filter((report) => report.kind === 'lost')}
              onCancel={() => setClaiming(null)}
              onSubmitted={() => {
                setClaiming(null)
                setNotice('Claim sent to the finder.')
                setView('claims')
              }}
            />
          )}
          {notice && <p role="status" className="success-note">{notice}</p>}
          {error && view === 'mine' && <div className="auth-error" role="alert">{error}</div>}
          {formOpen && <div className="form-backdrop"><section className="report-form-panel" aria-labelledby="form-title"><div className="section-heading"><div><div className="eyebrow small">CAMPUS REPORT</div><h2 id="form-title">{editing ? 'Edit report' : 'Post an item'}</h2></div><button className="signout-button" onClick={() => setFormOpen(false)}>Close</button></div>
            {!editing && <div className="form-row"><label>Section<select value={formSection} onChange={(event) => setFormSection(event.target.value as Section)}>{(Object.keys(sectionLabels) as Section[]).map((item) => <option value={item} key={item}>{sectionLabels[item]}</option>)}</select></label><label>Report type<select value={formKind} onChange={(event) => setFormKind(event.target.value as ReportKind)}><option value="lost">Lost</option><option value="found">Found</option></select></label></div>}
            <form onSubmit={(event) => void saveReport(event)}>
              {formSection === 'general' && <>
                <label>Item title<input required maxLength={120} value={form.title} onChange={(event) => update('title', event.target.value)} /></label>
                <label>Category<input required maxLength={60} value={form.category} onChange={(event) => update('category', event.target.value)} placeholder="Accessories, electronics…" /></label>
                <label>Public description<textarea required maxLength={1200} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
                <label>Approximate campus location<input required maxLength={120} value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="For example, library ground floor" /></label>
                <label>Date lost/found<input required type="date" value={form.occurred_on} onChange={(event) => update('occurred_on', event.target.value)} /></label>
                <label className="check-label"><input type="checkbox" checked={form.approximate_date} onChange={(event) => update('approximate_date', event.target.checked)} /> Date is approximate</label>
                {formKind === 'found' && <><p className="form-guidance">Keep one distinguishing detail out of the public description and photos, so you can verify claims privately later.</p><label className="check-label"><input required type="checkbox" checked={form.withheld_detail_confirmed} onChange={(event) => update('withheld_detail_confirmed', event.target.checked)} /> I withheld a distinguishing detail from this report</label></>}
                <label>Photos (up to 3)<input type="file" accept="image/jpeg,image/png" multiple onChange={(event) => setSelectedPhotos(Array.from(event.target.files ?? []).slice(0, 3))} /><span className="form-guidance">JPEG or PNG, up to 5 MB each. Images are re-encoded before private storage; members can open a temporary view link.</span></label>
                {selectedPhotos.length > 0 && <p className="form-guidance" role="status">{selectedPhotos.length} photo{selectedPhotos.length === 1 ? '' : 's'} selected.</p>}
                <p className="form-guidance">Reports are visible to signed-in Ashoka members. Do not include your email, phone number, legal name, student ID, room number, or full serial numbers.</p>
              </>}
              {formSection === 'id_card' && <><p className="form-guidance">Listed name and card numbers are visible to Ashoka members and identify the card, not your account. They cannot by themselves prove ownership.</p><label>Cardholder name<input maxLength={120} value={form.cardholder_name} onChange={(event) => update('cardholder_name', event.target.value)} /></label><label>Roll number<input maxLength={80} value={form.roll_number} onChange={(event) => update('roll_number', event.target.value)} /></label><label>ID number<input maxLength={80} value={form.id_number} onChange={(event) => update('id_number', event.target.value)} /></label><p className="form-guidance">Enter at least one roll or ID number. Leave unknown values empty.</p></>}
              {formSection === 'room_key' && <><p className="form-guidance">Room and holder details are visible to Ashoka members. Use the full building/block room code when known.</p><label>Room number<input required maxLength={80} value={form.room_number} onChange={(event) => update('room_number', event.target.value)} /></label><label>Holder name<input required maxLength={120} value={form.holder_name} onChange={(event) => update('holder_name', event.target.value)} /></label></>}
              {error && <p className="auth-error" role="alert">{error}</p>}<button className="report-button" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Post report'}</button>
            </form>
          </section></div>}
          <footer className="footer-note"><span>Made for finding your way back to what matters.</span><span>Foundry <b>·</b> Ashoka University</span></footer>
        </div>
      </section>
    </main>
  )
}

function ReportCard({ report, owner = false, onEdit, onClose, onClaim }: { report: Report; owner?: boolean; onEdit?: () => void; onClose?: () => void; onClaim?: () => void }) {
  const [showPhotos, setShowPhotos] = useState(false)
  return <article className="report-card"><div className="report-card-meta"><span>{sectionLabels[report.section]}</span><span className="report-status">{report.status}</span></div><h3>{report.title}</h3>{report.section === 'general' ? <><p>{report.description}</p><p>{report.location}{report.occurred_on ? ` · ${report.occurred_on}` : ''}</p><button className="photo-toggle" onClick={() => setShowPhotos((shown) => !shown)}>{showPhotos ? 'Hide photos' : 'View photos'}</button>{showPhotos && <ReportPhotos report={report} owner={owner && report.status === 'open'} />}</> : report.section === 'id_card' ? <p>{[report.cardholder_name, report.roll_number && `Roll ${report.roll_number}`, report.id_number && `ID ${report.id_number}`].filter(Boolean).join(' · ')}</p> : <p>{report.room_number} · {report.holder_name}</p>}{onClaim && <div className="report-card-actions"><button className="outline-button" onClick={onClaim}>Claim this item</button></div>}{owner && report.status === 'open' && <div className="report-card-actions"><button className="outline-button" onClick={onEdit}>Edit</button><button className="outline-button" onClick={onClose}>{report.kind === 'lost' ? 'Mark resolved' : 'Withdraw'}</button></div>}</article>
}

function ReportPhotos({ report, owner }: { report: Report; owner: boolean }) {
  const [photos, setPhotos] = useState<{ path: string; url: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      if (!supabase) return
      const { data, error } = await supabase.rpc('list_report_photos', { p_report_id: report.id })
      if (error || !Array.isArray(data) || data.length === 0) { if (active) setLoading(false); return }
      const { data: signed, error: signedError } = await supabase.storage.from('report-photos').createSignedUrls(data.map((photo: { path: string }) => photo.path), 60)
      if (!active) return
      if (!signedError) setPhotos((signed ?? []).map((photo) => ({ path: photo.path, url: photo.signedUrl })).filter((photo): photo is { path: string; url: string } => Boolean(photo.path && photo.url)))
      setLoading(false)
    })()
    return () => { active = false }
  }, [report.id])
  async function removePhoto(path: string) {
    if (!supabase) return
    const { error: storageError } = await supabase.storage.from('report-photos').remove([path])
    if (storageError) { setError('Photo could not be removed. Retry.'); return }
    const { error: recordError } = await supabase.rpc('remove_report_photo', { p_report_id: report.id, p_object_path: path })
    if (recordError) { setError('Photo was removed from storage, but the report list could not be refreshed. Reload the page.'); return }
    setPhotos((current) => current.filter((photo) => photo.path !== path))
  }
  if (loading) return <p className="photo-status" role="status">Loading photos…</p>
  if (!photos.length) return <p className="photo-status">{error || 'No photos attached.'}</p>
  return <>{error && <p className="photo-status" role="alert">{error}</p>}<div className="report-photos">{photos.map((photo, index) => <div className="report-photo" key={photo.path}><img src={photo.url} alt={`Photo ${index + 1} of ${report.title}`} />{owner && <button onClick={() => void removePhoto(photo.path)} aria-label={`Remove photo ${index + 1}`}>Remove</button>}</div>)}</div></>
}

export default App
