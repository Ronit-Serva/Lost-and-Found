# Foundry · Ashoka ID cards and room keys

Members sign in with their Ashoka Google account to post and search lost or found ID cards and room keys. Each poster chooses whether other signed-in members can contact them by their verified university email or WhatsApp. People arrange the return directly. General items are upcoming.

## Development

Use Node 22 and run `npm ci`. Copy `.env.example` to `.env.local` for a new checkout, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the public values for a Supabase project with this branch’s migrations applied. Enable the existing Google provider, signup hook and eligible callback URLs. Run `npm run dev`.

Run `npm run lint`, `npm run check:edge`, `npm test` and `npm run build` from the repository root. See the [active handoff](docs/handoffs/cards-and-keys.md) for provider state, implementation details and verification.

The branch inherits the Phase 3 checkpoint from main. Its final migration enables the manual-contact product. GitHub publication and applying that migration to a hosted database are separate operations.
