import './PrivacyPolicy.css'

export default function PrivacyPolicy() {
  return (
    <main className="privacy-page">
      <section className="privacy-sheet" aria-labelledby="privacy-title">
        <header className="privacy-header">
          <a className="brand privacy-brand" href="/" aria-label="Back to Foundry">
            <span className="brand-mark" aria-hidden="true">f</span><span>foundry<span className="brand-dot">.</span></span>
          </a>
          <a className="privacy-back" href="/">Back to Foundry</a>
        </header>

        <div className="privacy-intro">
          <p className="privacy-kicker">Privacy policy</p>
          <h1 id="privacy-title">Your contact details are yours to choose.</h1>
          <p>Foundry is a student-built directory for returning lost or found Ashoka ID cards and room keys. This policy explains what the app uses, who can see it, and what happens when a listing closes.</p>
          <p className="privacy-updated">Last updated: 20 November 2026</p>
        </div>

        <div className="privacy-content">
          <section>
            <h2>Who can use Foundry</h2>
            <p>Foundry checks a member’s signed-in Google account and confirmed <strong>@ashoka.edu.in</strong> email before allowing access. The directory is not available to anonymous visitors or non-eligible accounts.</p>
          </section>

          <section>
            <h2>What information Foundry uses</h2>
            <p>Foundry uses your Ashoka email and Google sign-in identity to authenticate access. When you create a listing, it stores the item details you provide. For an ID card, this can include a printed name and roll or ID number. For a room key, it can include a holder name and room number.</p>
            <p>You may also save a WhatsApp number for reuse. It stays private unless you choose WhatsApp as the contact method for a specific open listing.</p>
          </section>

          <section>
            <h2>Who can see a listing</h2>
            <p>Open listings are visible only to eligible signed-in Ashoka members. Each poster chooses one contact method per listing: their verified Ashoka email or their WhatsApp number. Members can see only the method selected for that listing; the other option stays private.</p>
            <p>Foundry does not provide in-app messaging, collect claimant evidence, or send messages on anyone’s behalf. Members contact each other outside the app and arrange a return themselves.</p>
          </section>

          <section>
            <h2>When a listing is closed</h2>
            <p>Closing, resolving, returning, or withdrawing a listing removes it from future directory discovery. The poster can still see it in their own listing history. Someone who already copied a contact detail before the listing closed may retain it.</p>
          </section>

          <section>
            <h2>What Foundry does not do</h2>
            <p>Foundry does not sell listing information, run advertising, verify ownership of WhatsApp numbers, or claim to verify that a person requesting an item is its owner. It is not an official Ashoka University service or endorsement.</p>
          </section>

          <section>
            <h2>Questions or requests</h2>
            <p>For a privacy question, correction, or request about your Foundry data, use the developer contact address shown on Foundry’s Google sign-in consent screen. You can also update or close your own listings from <strong>My listings</strong>.</p>
          </section>
        </div>
      </section>
    </main>
  )
}
