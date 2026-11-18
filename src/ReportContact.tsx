import { phonePattern } from './lib/reportContact.ts'
import type { useWhatsApp } from './lib/reportContact.ts'

export function WhatsAppInput({ phone, disabled, id }: {
  phone: ReturnType<typeof useWhatsApp>
  disabled: boolean
  id: string
}) {
  if (phone.loading) return <p role="status">Loading your WhatsApp number…</p>
  if (phone.error) {
    return <p role="alert" className="auth-error">{phone.error} <button type="button" className="outline-button" onClick={phone.retry}>Retry</button></p>
  }
  return (
    <label>
      WhatsApp number
      <input
        type="tel"
        autoComplete="tel"
        required
        pattern={phonePattern.source}
        maxLength={16}
        placeholder="+919876543210"
        value={phone.number}
        disabled={disabled}
        aria-describedby={id}
        onChange={(event) => phone.update(event.target.value)}
      />
      <span id={id} className="form-guidance">Use the international format with + and the country code, without spaces.</span>
    </label>
  )
}
