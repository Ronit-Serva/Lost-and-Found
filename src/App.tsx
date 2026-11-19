import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import { WhatsAppInput } from './ReportContact.tsx'
import { contactLink, phonePattern, useWhatsApp } from './lib/reportContact.ts'
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
type ReportResult = { reports: Report[]; loading: boolean; error: string }
const initialResult: ReportResult = { reports: [], loading: true, error: '' }
const directoryPageSize = 15
const historyPageSize = 25
const directoryRefreshMs = 30_000

type ReportQuery = { p_section: ActiveSection; p_kind: ReportKind; p_query: string }

function useReports(version: number, offset: number, enabled: boolean, query?: ReportQuery) {
  const [result, setResult] = useState<(ReportResult & { key: string }) | null>(null)
  const section = query?.p_section
  const kind = query?.p_kind
  const term = query?.p_query
  const key = JSON.stringify([section, kind, term, version, offset])

  useEffect(() => {
    const client = supabase
    if (!client || !enabled) return
    const controller = new AbortController()
    const request = section && kind
      ? client.rpc('directory_reports', { p_section: section, p_kind: kind, p_query: term, p_offset: offset })
      : client.rpc('list_my_reports', { p_closed_offset: offset })

    void (async () => {
      const { data, error } = await request.abortSignal(controller.signal)
      if (controller.signal.aborted) return
      setResult({ key, reports: (data ?? []) as Report[], loading: false, error: error?.code || (error ? 'unknown' : '') })
    })()
    return () => controller.abort()
  }, [enabled, key, kind, offset, section, term])

  return result?.key === key ? result : initialResult
}

function ListingPages({ offset, size, hasNext, label, onPage }: {
  offset: number; size: number; hasNext: boolean; label: string; onPage: (offset: number) => void
}) {
  if (!offset && !hasNext) return null
  return (
    <nav className="listing-pages" aria-label={label}>
      <button className="outline-button" disabled={!offset} onClick={() => onPage(offset - size)}>Previous</button>
      <span>Page {Math.floor(offset / size) + 1}</span>
      <button className="outline-button" disabled={!hasNext} onClick={() => onPage(offset + size)}>Next</button>
    </nav>
  )
}

function CampusItems() {
  return (
    <div className="campus-items" aria-hidden="true">
      <div className="campus-id">
        <span className="id-slot" />
        <span className="id-photo" />
        <span className="id-lines" />
      </div>
      <div className="campus-key"><span /></div>
    </div>
  )
}

export function SignInScreen({ configured, error, loading, onSignIn }: { configured: boolean; error: string; loading: boolean; onSignIn: () => void }) {
  return (
    <main className="auth-page">
      <section className="auth-card auth-landing">
        <div className="auth-copy">
          <div className="brand auth-brand"><span className="brand-mark" aria-hidden="true">f</span><span>foundry<span className="brand-dot">.</span></span></div>
          <h1>Lost &amp; found at Ashoka</h1>
          <p>Find a missing ID card or room key, or post one you picked up on campus.</p>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {!configured && <div className="auth-error" role="alert">Supabase is not configured. Add the project URL and publishable key to <code>.env.local</code>, then restart the dev server.</div>}
          <button className="google-button" disabled={!configured || loading} onClick={onSignIn}>
            <span className="google-g" aria-hidden="true">G</span>{loading ? 'Opening Google…' : 'Continue with Google'}
          </button>
          <p className="auth-note">Use your <strong>@ashoka.edu.in</strong> account.</p>
        </div>
        <CampusItems />
      </section>
    </main>
  )
}

function App({ email, onSignOut }: AppProps) {
  const [section, setSection] = useState<Section>('id_card')
  const [kind, setKind] = useState<ReportKind>('lost')
  const [view, setView] = useState<'discover' | 'mine'>('discover')
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [directoryOffset, setDirectoryOffset] = useState(0)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [directoryVersion, setDirectoryVersion] = useState(0)
  const [version, setVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [draft, setDraft] = useState<ReportDraft | null>(null)
  const [settings, setSettings] = useState(false)
  const [closing, setClosing] = useState<string | null>(null)
  const directoryHeading = useRef<HTMLHeadingElement>(null)
  const listingsHeading = useRef<HTMLHeadingElement>(null)
  const focusListings = useRef(false)
  const activeSection = section === 'general' ? 'id_card' : section
  const viewingDirectory = view === 'discover' && section !== 'general'
  const searchPending = query.trim() !== searchTerm
  const directory = useReports(version + directoryVersion, directoryOffset, viewingDirectory && !searchPending, {
    p_section: activeSection, p_kind: kind, p_query: searchTerm,
  })
  const mine = useReports(version, historyOffset, view === 'mine')
  const isActiveReport = (report: Report) => report.status === 'open' || report.status === 'reserved'
  const lostCount = mine.reports.filter((report) => report.kind === 'lost' && isActiveReport(report)).length
  const foundCount = mine.reports.filter((report) => report.kind === 'found' && isActiveReport(report)).length
  const closedCount = mine.reports.length - lostCount - foundCount

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!viewingDirectory) return
    let lastRefresh = 0
    function refreshVisibleDirectory() {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefresh < 1000) return
      lastRefresh = Date.now()
      setDirectoryVersion((current) => current + 1)
    }
    const timer = window.setInterval(refreshVisibleDirectory, directoryRefreshMs)
    window.addEventListener('focus', refreshVisibleDirectory)
    document.addEventListener('visibilitychange', refreshVisibleDirectory)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisibleDirectory)
      document.removeEventListener('visibilitychange', refreshVisibleDirectory)
    }
  }, [viewingDirectory])

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
    if (next === 'discover' && view !== next) setDirectoryVersion((current) => current + 1)
    if (next === 'mine' && view !== next) reload()
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
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#home" aria-label="Foundry home" onClick={() => switchView('discover')}>
            <span className="brand-mark" aria-hidden="true">f</span><span>foundry<span className="brand-dot">.</span></span>
          </a>
          <nav className="primary-nav" aria-label="Main navigation">
            <button className={`nav-link ${view === 'discover' ? 'active' : ''}`} aria-current={view === 'discover' ? 'page' : undefined} onClick={() => switchView('discover')}>
              Discover
            </button>
            <button className={`nav-link ${view === 'mine' ? 'active' : ''}`} aria-current={view === 'mine' ? 'page' : undefined} onClick={() => switchView('mine')}>
              My listings
            </button>
            <button className="nav-link" onClick={() => setSettings(true)}>
              Contact settings
            </button>
          </nav>
          <button className="signout-button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <section className="main-panel">
        <div className="content">
          {view === 'discover' ? (
            <>
              <section className="welcome-row">
                <div className="welcome-copy">
                  <h1>Lost &amp; found at Ashoka</h1>
                  <p className="intro">Look up a missing ID card or room key, or post one you’ve found.</p>
                </div>
                <CampusItems />
              </section>
              <section className="directory-section" aria-labelledby="browse-title">
                <div className="directory-heading">
                  <h2 id="browse-title" ref={directoryHeading} tabIndex={-1}>{section === 'general' ? 'General items' : `Browse ${kind} items`}</h2>
                  <button className="report-button" onClick={startCreate}>＋ Report an item</button>
                </div>
                <div className="category-tabs" role="group" aria-label="Item category">
                  {(Object.keys(sectionLabels) as Section[]).map((item) => (
                    <button
                      key={item}
                      aria-pressed={section === item}
                      className={section === item ? 'category-tab active-tab' : 'category-tab'}
                      onClick={() => { if (section !== item) { setSection(item); setQuery(''); setSearchTerm(''); setDirectoryOffset(0); setDirectoryVersion((current) => current + 1) } }}
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
                          onChange={(event) => { setQuery(event.target.value); setDirectoryOffset(0) }}
                          placeholder={section === 'id_card' ? 'Name, roll number or ID' : 'Room number or holder name'}
                          aria-label="Search reports"
                        />
                      </label>
                      <div className="search-controls">
                        <div className="segmented" role="group" aria-label="Report type">
                          {(['lost', 'found'] as const).map((option) => (
                            <button key={option} className={kind === option ? 'selected' : ''} aria-pressed={kind === option} onClick={() => { if (kind !== option) { setKind(option); setDirectoryOffset(0) } }}>{option === 'lost' ? 'Lost' : 'Found'}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    {searchPending || directory.loading ? <p role="status">Loading reports…</p> : directory.error ? (
                      <p className="auth-error" role="alert">{directory.error === 'PT429' ? 'Too many searches. Try again shortly.' : 'Could not load reports.'} <button className="outline-button" onClick={reload}>Retry</button></p>
                    ) : directory.reports.length ? (
                      <div className="report-grid">{directory.reports.map((report) => <ReportCard key={report.id} report={report} />)}</div>
                    ) : (
                      <div className="empty-state"><h3>{query ? 'No matching reports' : `No open ${kind} reports`}</h3>
                        <p>{query ? 'Try another search or clear the search field.' : `There are no ${sectionLabels[section].toLowerCase()} in this view yet.`}</p>
                        <button className="outline-button" onClick={startCreate}>＋ Post a {kind} item</button>
                      </div>
                    )}
                    <ListingPages offset={directoryOffset} size={directoryPageSize} label="Discovery pages"
                      hasNext={!searchPending && directory.reports.length === directoryPageSize && directoryOffset + directoryPageSize <= 10000}
                      onPage={(offset) => { setDirectoryOffset(offset); directoryHeading.current?.focus() }} />
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
              ) : <div className="empty-state"><h3>{historyOffset ? 'No more closed listings' : 'No listings yet'}</h3><p>{historyOffset ? 'Use Previous to go back.' : 'Reports you create will appear here.'}</p></div>}
              <ListingPages offset={historyOffset} size={historyPageSize} label="Closed listing pages"
                hasNext={closedCount === historyPageSize}
                onPage={(offset) => { setHistoryOffset(offset); listingsHeading.current?.focus() }} />
            </section>
          )}
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
    const whatsappNumber = phone.number.trim()
    if (method === 'whatsapp' && (phone.loading || phone.error || !phonePattern.test(whatsappNumber))) {
      setError('Enter a valid international WhatsApp number.')
      setSaving(false)
      return
    }

    const fields = section === 'id_card'
      ? { cardholder_name: cardholder.trim(), roll_number: roll.trim(), id_number: number.trim() }
      : { room_number: room.trim(), holder_name: holder.trim() }
    const contact = {
      ...fields,
      contact_method: method,
      ...(method === 'whatsapp' && whatsappNumber !== phone.saved ? { whatsapp_number: whatsappNumber } : {}),
    }
    const { error: resultError } = draft.edit
      ? await supabase.rpc('edit_report', { p_report_id: draft.edit.id, p_data: contact })
      : await supabase.rpc('create_report', { p_data: { ...contact, kind, section } })
    if (resultError) {
      setSaving(false)
      if (resultError.code === 'PT429') setError('You’ve reached the daily posting limit. Try again later.')
      else if (resultError.message.includes('Active report limit')) setError(`You already have 3 active ${kind} reports. Close one from My listings to make room.`)
      else setError('Report could not be saved. Check the fields and try again.')
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
