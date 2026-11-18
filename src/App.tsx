import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import { WhatsAppInput } from './ReportContact.tsx'
import { contactLink, useWhatsApp } from './lib/reportContact.ts'
import type { ContactMethod } from './lib/reportContact.ts'
import { supabase } from './lib/supabase.ts'

const sectionLabels = { id_card: 'ID cards', room_key: 'Room keys', general: 'General items' }
type Section = keyof typeof sectionLabels
type ActiveSection = Exclude<Section, 'general'>
type ReportKind = 'lost' | 'found'
type Report = {
  id: string
  kind: ReportKind
  section: Section
  status?: 'open' | 'reserved' | 'resolved' | 'returned' | 'withdrawn'
  title: string
  description?: string | null
  location?: string | null
  occurred_on?: string | null
  cardholder_name?: string | null
  roll_number?: string | null
  id_number?: string | null
  room_number?: string | null
  holder_name?: string | null
  contact_method?: ContactMethod | null
  contact_value?: string | null
}
type AppProps = { email: string; onSignOut: () => void }
type ReportDraft = { edit: Report | null; section: ActiveSection; kind: ReportKind }
type ReportResult = { reports: Report[]; loading: boolean; error: boolean }
const initialResult: ReportResult = { reports: [], loading: true, error: false }

type ReportQuery = { p_section: ActiveSection; p_kind: ReportKind; p_query: string }

function useReports(version: number, query?: ReportQuery) {
  const [result, setResult] = useState<(ReportResult & { key: string }) | null>(null)
  const section = query?.p_section
  const kind = query?.p_kind
  const term = query?.p_query
  const key = JSON.stringify([section, kind, term, version])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const controller = new AbortController()
    const request = section && kind
      ? client.rpc('directory_reports', { p_section: section, p_kind: kind, p_query: term })
      : client.rpc('list_my_reports')

    void (async () => {
      const { data, error } = await request.abortSignal(controller.signal)
      if (controller.signal.aborted) return
      setResult({ key, reports: (data ?? []) as Report[], loading: false, error: Boolean(error) })
    })()
    return () => controller.abort()
  }, [key, kind, section, term])

  return result?.key === key ? result : initialResult
}

export function SignInScreen({ configured, error, loading, onSignIn }: { configured: boolean; error: string; loading: boolean; onSignIn: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand auth-brand" href="#home"><span className="brand-mark">f</span><span>foundry<span className="brand-dot">.</span></span></a>
        <div className="auth-eyebrow">ASHOKA UNIVERSITY · LOST &amp; FOUND</div>
        <h1>Find your way<br /><em>back to what matters.</em></h1>
        <p>Sign in with your Ashoka Google account to browse and post lost or found ID cards and room keys.</p>
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
  const [section, setSection] = useState<Section>('id_card')
  const [kind, setKind] = useState<ReportKind>('lost')
  const [view, setView] = useState<'discover' | 'mine'>('discover')
  const [query, setQuery] = useState('')
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [draft, setDraft] = useState<ReportDraft | null>(null)
  const [settings, setSettings] = useState(false)
  const [closing, setClosing] = useState<string | null>(null)
  const listingsHeading = useRef<HTMLHeadingElement>(null)
  const focusListings = useRef(false)
  const activeSection = section === 'general' ? 'id_card' : section

  const directory = useReports(version, { p_section: activeSection, p_kind: kind, p_query: query.trim() })
  const mine = useReports(version)
  const isActiveReport = (report: Report) => report.status === 'open' || report.status === 'reserved'
  const lostCount = mine.reports.filter((report) => report.kind === 'lost' && isActiveReport(report)).length
  const foundCount = mine.reports.filter((report) => report.kind === 'found' && isActiveReport(report)).length

  useEffect(() => {
    if (view === 'mine' && focusListings.current) {
      focusListings.current = false
      listingsHeading.current?.focus()
    }
  }, [version, view])

  function reload() {
    setVersion((current) => current + 1)
  }

  function switchView(next: 'discover' | 'mine') {
    setView(next)
    setNotice('')
    setActionError('')
  }

  function startCreate() {
    setDraft({ edit: null, section: activeSection, kind })
    setNotice('')
    setActionError('')
  }

  async function closeReport(report: Report, returned: boolean) {
    if (!supabase || closing) return
    setClosing(report.id)
    setActionError('')
    setNotice('')
    const { error } = await supabase.rpc(returned ? 'mark_report_returned' : 'close_report', { p_report_id: report.id })
    setClosing(null)
    if (error) {
      setActionError('Could not close this report. Refresh and try again.')
      return
    }
    setNotice(returned ? 'Found report marked returned.' : report.kind === 'lost' ? 'Lost report marked resolved.' : 'Found report withdrawn.')
    focusListings.current = true
    reload()
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Foundry home" onClick={() => switchView('discover')}>
          <span className="brand-mark">f</span><span>foundry<span className="brand-dot">.</span></span>
        </a>
        <div className="campus-label">ASHOKA UNIVERSITY</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={`nav-link ${view === 'discover' ? 'active' : ''}`} aria-label="Discover" onClick={() => switchView('discover')}>
            <span aria-hidden="true">⌕</span> Discover
          </button>
          <button className={`nav-link ${view === 'mine' ? 'active' : ''}`} aria-label="My listings" onClick={() => switchView('mine')}>
            <span aria-hidden="true">▤</span> My listings
          </button>
          <button className="nav-link" aria-label="Contact settings" onClick={() => setSettings(true)}>
            <span aria-hidden="true">⚙</span> Contact settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">{email.slice(0, 1).toUpperCase()}</div>
            <div className="profile-text"><strong>Ashoka member</strong><span>{email}</span></div>
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">Campus services <span>/</span> <strong>Lost &amp; found</strong></div>
          <div className="top-actions"><span className="signed-in-email">{email}</span><button className="signout-button" onClick={onSignOut}>Sign out</button></div>
        </header>
        <div className="content">
          {view === 'discover' ? (
            <>
              <section className="welcome-row">
                <div><h1>Lost something?<br /><em>Let’s bring it home.</em></h1><p className="intro">Browse lost and found ID cards and room keys, or post a report.</p></div>
                <div className="welcome-art" aria-hidden="true"><div className="art-sun" /><div className="art-card card-one">✳</div><div className="art-card card-two">↗</div><div className="art-ring" /></div>
              </section>
              <section className="directory-section" aria-labelledby="browse-title">
                <div className="directory-heading">
                  <h2 id="browse-title">{section === 'general' ? 'General items' : `Browse ${kind} items`}</h2>
                  <button className="report-button" onClick={startCreate}>＋ Report an item</button>
                </div>
                <div className="category-tabs" role="group" aria-label="Item category">
                  {(Object.keys(sectionLabels) as Section[]).map((item) => (
                    <button
                      key={item}
                      aria-pressed={section === item}
                      className={section === item ? 'category-tab active-tab' : 'category-tab'}
                      onClick={() => { if (section !== item) { setSection(item); setQuery('') } }}
                    >
                      {sectionLabels[item]}{item === 'general' && <span className="upcoming-label">Upcoming</span>}
                    </button>
                  ))}
                </div>
                {section === 'general' ? (
                  <div className="empty-state"><h3>General item reports are upcoming</h3><p>You can post and browse ID cards and room keys now.</p></div>
                ) : (
                  <>
                    <div className="search-card" aria-label="Find an item">
                      <label className="search-input">
                        <span aria-hidden="true">⌕</span>
                        <input
                          type="search"
                          value={query}
                          maxLength={120}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder={section === 'id_card' ? 'Search name, roll number, or ID number' : 'Search room number or holder name'}
                          aria-label="Search reports"
                        />
                      </label>
                      <div className="search-controls">
                        <div className="segmented" role="group" aria-label="Report type">
                          {(['lost', 'found'] as const).map((option) => (
                            <button key={option} className={kind === option ? 'selected' : ''} aria-pressed={kind === option} onClick={() => setKind(option)}>{option === 'lost' ? 'Lost' : 'Found'}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {directory.loading ? <p role="status">Loading reports…</p> : directory.error ? (
                      <p className="auth-error" role="alert">Could not load reports. <button className="outline-button" onClick={reload}>Retry</button></p>
                    ) : directory.reports.length ? (
                      <div className="report-grid">{directory.reports.map((report) => <ReportCard key={report.id} report={report} />)}</div>
                    ) : (
                      <div className="empty-state"><h3>{query ? 'No matching reports' : `No open ${kind} reports`}</h3>
                        <p>{query ? 'Try another search or clear the search field.' : `There are no ${sectionLabels[section].toLowerCase()} in this view yet.`}</p>
                        <button className="outline-button" onClick={startCreate}>＋ Post a {kind} item</button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          ) : (
            <section className="directory-section">
              <h1 ref={listingsHeading} tabIndex={-1}>My listings</h1>
              <div className="quota-row">
                {mine.loading || mine.error ? null : <><span>Lost: {lostCount}/3</span><span>Found: {foundCount}/3</span></>}
                <button className="report-button" onClick={startCreate}>＋ Report an item</button>
              </div>
              {notice && <p role="status" className="success-note">{notice}</p>}
              {actionError && <p role="alert" className="auth-error">{actionError}</p>}
              {mine.loading ? <p role="status">Loading your reports…</p> : mine.error ? (
                <p role="alert" className="auth-error">Could not load your reports. <button className="outline-button" onClick={reload}>Retry</button></p>
              ) : mine.reports.length ? (
                <div className="report-grid">{mine.reports.map((report) => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    owner
                    closing={Boolean(closing)}
                    onEdit={report.section === 'general' ? undefined : () => {
                      setNotice('')
                      setActionError('')
                      if (report.section !== 'general') setDraft({ edit: report, section: report.section, kind: report.kind })
                    }}
                    onClose={(returned) => void closeReport(report, returned)}
                  />
                ))}</div>
              ) : <div className="empty-state"><h3>No listings yet</h3><p>Reports you create will appear here.</p></div>}
            </section>
          )}
          <footer className="footer-note"><span>Foundry <b>·</b> Ashoka University</span></footer>
        </div>
      </section>
      {draft && (
        <ListingForm
          draft={draft}
          email={email}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null)
            setNotice(draft.edit ? 'Report updated.' : 'Report posted.')
            focusListings.current = true
            setView('mine')
            reload()
          }}
        />
      )}
      {settings && <ContactSettings onClose={() => setSettings(false)} onSaved={reload} />}
    </main>
  )
}

function Modal({ title, busy, onClose, children }: {
  title: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const panel = dialog.current
    panel?.showModal()
    return () => panel?.close()
  }, [])

  function close() {
    dialog.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={dialog}
      className="report-form-panel listing-dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) close() }}
    >
      <header className="section-heading">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="signout-button" disabled={busy} onClick={close}>Close</button>
      </header>
      {children}
    </dialog>
  )
}

function ListingForm({ draft, email, onClose, onSaved }: {
  draft: ReportDraft
  email: string
  onClose: () => void
  onSaved: () => void
}) {
  const [kind, setKind] = useState(draft.kind)
  const [section, setSection] = useState(draft.section)
  const [cardholder, setCardholder] = useState(draft.edit?.cardholder_name ?? '')
  const [roll, setRoll] = useState(draft.edit?.roll_number ?? '')
  const [number, setNumber] = useState(draft.edit?.id_number ?? '')
  const [room, setRoom] = useState(draft.edit?.room_number ?? '')
  const [holder, setHolder] = useState(draft.edit?.holder_name ?? '')
  const [method, setMethod] = useState<ContactMethod | ''>(draft.edit?.contact_method ?? '')
  const [needsPhone, setNeedsPhone] = useState(draft.edit?.contact_method === 'whatsapp')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const phone = useWhatsApp(needsPhone)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const dialog = event.currentTarget.closest('dialog')
    if (!supabase || saving) return
    setError('')
    if (section === 'id_card' && !roll.trim() && !number.trim()) {
      setError('Enter a roll number or an ID number.')
      return
    }
    if (!method) {
      setError('Choose a contact method for this listing.')
      return
    }

    setSaving(true)
    if (method === 'whatsapp' && (phone.loading || phone.error || !await phone.save())) {
      setError('Could not save your WhatsApp number. Check the number and try again.')
      setSaving(false)
      return
    }

    const fields = section === 'id_card'
      ? { cardholder_name: cardholder.trim(), roll_number: roll.trim(), id_number: number.trim() }
      : { room_number: room.trim(), holder_name: holder.trim() }
    const contact = { ...fields, contact_method: method }
    const { error: resultError } = draft.edit
      ? await supabase.rpc('edit_report', { p_report_id: draft.edit.id, p_data: contact })
      : await supabase.rpc('create_report', { p_data: { ...contact, kind, section } })
    if (resultError) {
      setSaving(false)
      setError(resultError.message.includes('Active report limit')
        ? `You already have 3 active ${kind} reports. Close one from My listings to make room.`
        : 'Report could not be saved. Check the fields and try again.')
      return
    }

    dialog?.close()
    onSaved()
  }

  return (
    <Modal title={draft.edit ? 'Edit report' : 'Post an item'} busy={saving} onClose={onClose}>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={saving} className="report-fields">
          {!draft.edit && (
            <div className="form-row">
              <label>Section<select value={section} onChange={(event) => setSection(event.target.value as ActiveSection)}>
                <option value="id_card">ID cards</option>
                <option value="room_key">Room keys</option>
              </select></label>
              <label>Report type<select value={kind} onChange={(event) => setKind(event.target.value as ReportKind)}>
                <option value="lost">Lost</option><option value="found">Found</option>
              </select></label>
            </div>
          )}
          {section === 'id_card' ? (
            <>
              <label>Cardholder name<input maxLength={120} value={cardholder} onChange={(event) => setCardholder(event.target.value)} /></label>
              <label>Roll number<input maxLength={80} value={roll} onChange={(event) => setRoll(event.target.value)} /></label>
              <label>ID number<input maxLength={80} value={number} onChange={(event) => setNumber(event.target.value)} /></label>
              <p className="form-guidance">Enter at least one roll or ID number. Signed-in Ashoka members can see these details.</p>
            </>
          ) : (
            <>
              <label>Room number<input required maxLength={80} value={room} onChange={(event) => setRoom(event.target.value)} /></label>
              <label>Holder name<input required maxLength={120} value={holder} onChange={(event) => setHolder(event.target.value)} /></label>
              <p className="form-guidance">Give the full building or block code when known. Signed-in Ashoka members can see these details.</p>
            </>
          )}
          <fieldset className="contact-choices" aria-describedby="contact-disclosure">
            <legend>How can members contact you?</legend>
            <p id="contact-disclosure">Signed-in Ashoka members can see and use the contact you choose for this listing while it’s open.</p>
            <label className="contact-choice">
              <input required type="radio" name="contact" value="email" checked={method === 'email'} onChange={() => setMethod('email')} />
              Use my verified Ashoka email
            </label>
            {method === 'email' && <p className="contact-preview">{email}</p>}
            <label className="contact-choice">
              <input type="radio" name="contact" value="whatsapp" checked={method === 'whatsapp'} onChange={() => {
                setNeedsPhone(true)
                setMethod('whatsapp')
              }} />
              Use WhatsApp
            </label>
            {method === 'whatsapp' && (
              <div className="whatsapp-entry">
                <WhatsAppInput id="report-phone-format" phone={phone} disabled={saving} />
                <p className="form-guidance">We save your number so you can reuse it. A change also updates your open WhatsApp listings.</p>
              </div>
            )}
          </fieldset>
        </fieldset>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button className="report-button" disabled={saving || Boolean(method === 'whatsapp' && (phone.loading || phone.error))}>
          {saving ? 'Saving…' : draft.edit ? 'Save changes' : 'Post report'}
        </button>
      </form>
    </Modal>
  )
}

function ContactSettings({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const phone = useWhatsApp(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setSaved(false)
    if (await phone.save()) {
      setSaved(true)
      onSaved()
    } else setError('Could not save your WhatsApp number. Check the number and try again.')
    setSaving(false)
  }

  return (
    <Modal title="Contact settings" busy={saving} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <p className="form-guidance">A saved WhatsApp number is private until you choose it on a listing. Changing the number updates your open WhatsApp listings. You can use verified Ashoka email without saving a number.</p>
        <WhatsAppInput id="settings-phone-format" phone={phone} disabled={saving} />
        {error && <p role="alert" className="auth-error">{error}</p>}
        {saved && phone.number === phone.saved && <p role="status" className="success-note">WhatsApp number saved.</p>}
        <button className="report-button" disabled={saving || phone.loading || Boolean(phone.error) || phone.number === phone.saved}>
          {saving ? 'Saving…' : 'Save number'}
        </button>
      </form>
    </Modal>
  )
}

function ReportCard({ report, owner = false, closing = false, onEdit, onClose }: {
  report: Report
  owner?: boolean
  closing?: boolean
  onEdit?: () => void
  onClose?: (returned: boolean) => void
}) {
  const status = report.status ?? 'open'
  const canClose = owner && status === 'open'
  const method = report.contact_method
  const value = report.contact_value
  const link = method && value ? contactLink(method, value) : null

  return (
    <article className="report-card">
      <div className="report-card-meta"><span>{sectionLabels[report.section]}</span><span className="report-status">{status}</span></div>
      <h3>{report.title}</h3>
      {report.section === 'general' ? (
        <>
          <p>{report.description}</p><p>{report.location}{report.occurred_on ? ` · ${report.occurred_on}` : ''}</p>
        </>
      ) : report.section === 'id_card' ? (
        <p>{[report.cardholder_name, report.roll_number && `Roll ${report.roll_number}`, report.id_number && `ID ${report.id_number}`].filter(Boolean).join(' · ')}</p>
      ) : <p>{report.room_number} · {report.holder_name}</p>}
      {owner && status === 'open' && report.section !== 'general' && (
        <p>{link ? `Shared contact · ${method === 'email' ? 'Ashoka email' : 'WhatsApp'}` : 'Hidden from Discover until you choose a contact method.'}</p>
      )}
      {!owner && link && (
        <div className="listing-contact">
          <a className="outline-button" href={link} target={method === 'whatsapp' ? '_blank' : undefined} rel={method === 'whatsapp' ? 'noreferrer' : undefined}>
            {method === 'whatsapp' ? 'Message on WhatsApp' : 'Email reporter'}
          </a>
          <p>{value}</p>
        </div>
      )}
      {canClose && (
        <div className="report-card-actions">
          {onEdit && <button className="outline-button" onClick={onEdit} disabled={closing}>Edit</button>}
          {report.kind === 'found' && report.section !== 'general' && <button className="outline-button" onClick={() => onClose?.(true)} disabled={closing}>Mark returned</button>}
          <button className="outline-button" onClick={() => onClose?.(false)} disabled={closing}>{report.kind === 'lost' ? 'Mark resolved' : 'Withdraw'}</button>
        </div>
      )}
    </article>
  )
}

export default App
