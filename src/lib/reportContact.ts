import { useEffect, useState } from 'react'
import { supabase } from './supabase.ts'

export type ContactMethod = 'whatsapp' | 'email'

export const phonePattern = /^\+[1-9][0-9]{1,14}$/
const emailPattern = /^[^@\s]+@ashoka\.edu\.in$/i

export function contactLink(method: ContactMethod, value: string) {
  if (method === 'whatsapp' && phonePattern.test(value)) return 'https://wa.me/' + value.slice(1)
  if (method === 'email' && emailPattern.test(value)) return 'mailto:' + encodeURIComponent(value).replace('%40', '@')
  return null
}

type WhatsAppState = {
  number: string
  saved: string
  loading: boolean
  error: string
}

export function useWhatsApp(enabled: boolean) {
  const [state, setState] = useState<WhatsAppState>({ number: '', saved: '', loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const client = supabase
    if (!client || !enabled) return
    const controller = new AbortController()
    void (async () => {
      const { data, error } = await client.rpc('get_my_whatsapp').abortSignal(controller.signal)
      if (controller.signal.aborted) return
      const number = typeof data === 'string' ? data : ''
      setState({ number, saved: number, loading: false, error: error ? 'Could not load your WhatsApp number.' : '' })
    })()
    return () => controller.abort()
  }, [attempt, enabled])

  function update(number: string) {
    setState((current) => ({ ...current, number }))
  }

  function retry() {
    setState((current) => ({ ...current, loading: true, error: '' }))
    setAttempt((current) => current + 1)
  }

  async function save() {
    if (!supabase) return false
    const number = state.number.trim()
    if (!phonePattern.test(number)) return false
    if (number === state.saved) return true
    const { error } = await supabase.rpc('set_my_whatsapp', { p_number: number })
    if (!error) setState((current) => ({ ...current, number, saved: number }))
    return !error
  }

  return { ...state, update, retry, save }
}
