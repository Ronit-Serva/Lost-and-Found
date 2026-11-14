import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App, { SignInScreen } from './App.tsx'
import { isSupabaseConfigured, supabase } from './lib/supabase.ts'

export default function AuthRoot() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')
  const [membership, setMembership] = useState<{ token: string; allowed: boolean; error: string } | null>(null)
  const [checkAttempt, setCheckAttempt] = useState(0)

  useEffect(() => {
    if (!supabase) return

    let active = true
    let receivedAuthEvent = false
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || receivedAuthEvent) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true
      setSession(nextSession)
      if (!nextSession) setMembership(null)
      setLoading(false)
      setSigningIn(false)
      setError('')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Run outside the Auth callback to avoid waiting on its internal session lock.
  // Recheck every new token; a cached browser session never grants data access.
  useEffect(() => {
    const client = supabase
    const token = session?.access_token
    if (!client || !token) return

    let active = true
    void (async () => {
      try {
        const { data, error: membershipError } = await client.rpc('is_ashoka_member')
        if (!active) return
        setMembership({
          token,
          allowed: !membershipError && data === true,
          error: membershipError
            ? 'University access could not be checked. Retry, or ask the maintainer to check the database setup.'
            : data === true ? '' : 'Use a confirmed @ashoka.edu.in Google account to continue.',
        })
      } catch {
        if (active) setMembership({ token, allowed: false, error: 'Could not connect to verify university access. Check your connection and retry.' })
      }
    })()
    return () => { active = false }
  }, [session?.access_token, checkAttempt])

  async function signIn() {
    if (!supabase) return
    setSigningIn(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Let members switch accounts and let outsiders reach the server guard.
        queryParams: { prompt: 'select_account' },
      },
    })
    if (authError) {
      setError(authError.message)
      setSigningIn(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error: authError } = await supabase.auth.signOut()
    if (authError) setError(authError.message)
  }

  if (loading) return <main className="auth-page"><p className="loading-label">Connecting to Ashoka Lost &amp; Found…</p></main>
  if (!session) return <SignInScreen configured={isSupabaseConfigured} error={error} loading={signingIn} onSignIn={() => void signIn()} />

  if (!membership || membership.token !== session.access_token) {
    return <main className="auth-page"><p className="loading-label" role="status">Checking university access…</p></main>
  }

  if (!membership.allowed) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>University access</h1>
          <p role="alert">{membership.error}</p>
          {error && <p role="alert">{error}</p>}
          <button className="google-button" onClick={() => { setMembership(null); setCheckAttempt((attempt) => attempt + 1) }}>Retry access check</button>
          <button className="signout-button" onClick={() => void signOut()}>Sign out / switch account</button>
        </section>
      </main>
    )
  }

  return <App email={session.user.email ?? ''} onSignOut={() => void signOut()} />
}
