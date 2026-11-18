import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase.ts'

type ReportOption = { id: string; title: string }
type Claim = {
  id: string
  role: 'claimant' | 'finder'
  found_title: string
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled' | 'completed'
  evidence: string
  lost_title: string | null
  outcome_reason: string | null
}

export function ClaimForm({ report, lostReports, onCancel, onSubmitted }: {
  report: ReportOption
  lostReports: ReportOption[]
  onCancel: () => void
  onSubmitted: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef<{ id: string; evidence: string; lostReport: string } | null>(null)
  const [evidence, setEvidence] = useState('')
  const [lostReport, setLostReport] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const panel = dialog.current
    panel?.showModal()
    return () => panel?.close()
  }, [])

  function dismiss() {
    if (saving) return
    dialog.current?.close()
    onCancel()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || saving) return
    const trimmedEvidence = evidence.trim()
    if (!trimmedEvidence) {
      setError('Describe a detail that could help the finder identify your item.')
      return
    }
    if (request.current?.evidence !== trimmedEvidence || request.current.lostReport !== lostReport) {
      request.current = { id: crypto.randomUUID(), evidence: trimmedEvidence, lostReport }
    }

    setError('')
    setSaving(true)
    const { error: submissionError } = await supabase.rpc('submit_claim', {
      p_found_report_id: report.id,
      p_request_id: request.current.id,
      p_evidence: trimmedEvidence,
      p_lost_report_id: lostReport || null,
    })
    setSaving(false)
    if (!submissionError) {
      dialog.current?.close()
      onSubmitted()
    } else if (submissionError.message === 'You already have an active claim for this report') {
      setError('You already have an active claim for this item. Open My claims to review it.')
    } else if (submissionError.message === 'Found report is unavailable') {
      setError('This item is no longer available to claim. Close this form and refresh the directory.')
    } else {
      setError('Your claim could not be sent. Check your connection and try again.')
    }
  }

  return (
    <dialog ref={dialog} className="report-form-panel claim-dialog" aria-labelledby="claim-title" onCancel={(event) => {
      event.preventDefault()
      dismiss()
    }}>
      <header className="section-heading">
        <h2 id="claim-title">Claim {report.title}</h2>
        <button type="button" className="signout-button" disabled={saving} onClick={dismiss}>Close</button>
      </header>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Identifying details
          <textarea required maxLength={2000} value={evidence} disabled={saving} onChange={(event) => setEvidence(event.target.value)} aria-describedby="claim-guidance" />
        </label>
        <p className="form-guidance" id="claim-guidance">Only you and the finder can read this. Describe something about the item that the listing leaves out. Keep contact details out of your claim.</p>
        {lostReports.length > 0 && (
          <label>
            Link one of my lost reports (optional)
            <select value={lostReport} disabled={saving} onChange={(event) => setLostReport(event.target.value)}>
              <option value="">None</option>
              {lostReports.map((lost) => <option value={lost.id} key={lost.id}>{lost.title}</option>)}
            </select>
          </label>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="report-button" disabled={saving}>{saving ? 'Sending…' : 'Send claim'}</button>
      </form>
    </dialog>
  )
}

export function ClaimHistory() {
  const heading = useRef<HTMLHeadingElement>(null)
  const [claims, setClaims] = useState<Claim[] | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const controller = new AbortController()
    void (async () => {
      const { data, error: loadError } = await client.rpc('list_my_claims').abortSignal(controller.signal)
      if (controller.signal.aborted) return
      if (loadError) setError(true)
      else setClaims((data ?? []) as Claim[])
    })()
    return () => controller.abort()
  }, [retry])

  return (
    <section className="directory-section claim-history" aria-labelledby="my-claims-title">
      <h1 id="my-claims-title" ref={heading} tabIndex={-1}>My claims</h1>
      {error ? (
        <div className="auth-error" role="alert">
          Could not load claims.
          <button className="outline-button" onClick={() => { setError(false); setRetry((current) => current + 1) }}>Retry</button>
        </div>
      ) : claims === null ? <p role="status">Loading claims…</p> : claims.length === 0 ? (
        <p>Claims you send and claims made on your found items will appear here.</p>
      ) : (
        <ul className="claim-list">
          {claims.map((claim) => (
            <li key={claim.id} className="report-card claim-card">
              <div className="report-card-meta">
                <span>{claim.role === 'finder' ? 'Received' : 'Sent'}</span>
                <span className="report-status">{claim.status}</span>
              </div>
              <h2>{claim.found_title}</h2>
              <p>Claim reference <span className="claim-reference">{claim.id}</span></p>
              {claim.outcome_reason === 'report withdrawn' && <p>The finder withdrew this report.</p>}
              {claim.lost_title && <p>Linked lost report · {claim.lost_title}</p>}
              <details>
                <summary>Private evidence</summary>
                <p className="claim-evidence">{claim.evidence}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
