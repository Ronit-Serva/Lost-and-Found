# Phase 2 live testing

Live app: **https://foundry-ashoka.vercel.app**

Use the stable URL above on both devices. Each person signs in using their own confirmed `@ashoka.edu.in` Google account. No password or session-token sharing is needed. Use fictional names/numbers in test listings, with a recognizable prefix such as `P2 TEST`.

## Two-account walkthrough

1. Account A posts a **Found → General items** report titled `P2 TEST blue bottle`, fills every required field, confirms a distinguishing detail was withheld, and uploads a JPEG or PNG of a harmless test object.
2. A opens **My listings**, verifies **Found: 1/3** if there are no other active found reports, edits the title/description, and reloads to confirm persistence. A's own reports appear in My Listings; the directory intentionally excludes them.
3. Account B opens **Discover → Found → General items** and searches `P2 TEST`. B should see the updated report and photo, without A's account email/profile or edit/close controls.
4. A removes a photo, adds another through Edit, and confirms B sees the current photos after closing/reopening the photo view or reloading.
5. A withdraws the found report. After reload, B should not discover it; A should retain it in history and recover one found slot.
6. Repeat reporting and discovery in **ID cards** and **Room keys**, using fictional identifiers with leading zeros and a building-qualified room code. ID cards require at least one roll/ID number; keys require room number and holder name. These forms must not offer general descriptions or photos. Try both Lost and Found views. Account A edits its entries; B searches the displayed specialized fields.
7. A creates three active **Lost** reports spread across the three sections. A fourth lost report must be rejected. Repeat for **Found**; the two counters are independent. Close one report of a kind and confirm exactly one replacement can be created. Previously existing reports contribute to these limits.
8. Sign out and try the app again. Listings should disappear behind login. A personal Google account must be rejected. Browser back/reload must not restore app-data access after sign-out.
9. Check on a phone (or at 360 px viewport width) and using only Tab/Shift+Tab/Enter/Space on a computer. Report clipped controls, hidden errors, missing labels, lost keyboard focus, or unusable forms.

## Photo checks

- JPEG and PNG under 5 MiB should attach to open General Items reports, up to three per report.
- An invalid file, an input over 5 MiB, and a fourth attached photo must be rejected. The browser file picker may restrict types; direct request enforcement is checked separately by the agent.
- If an upload fails after saving, the listing should still exist and explain that the photo needs retrying. Avoid repeatedly creating duplicate listings when retrying photos.

## Record results

For each step, report **pass** or **fail**, which account role performed it (A/B/outsider), the section/type, exact error text, and what happened after reload. Do not include passwords, OAuth codes, access tokens, or copied authenticated network headers.

If Google blocks the friend's account before returning to Foundry (for example, an OAuth testing restriction), report the exact message. A Google OAuth app in External testing may require the owner to add the friend as a Google test user; a deployed frontend cannot change that provider restriction.

The project owner confirmed the Phase 2 exit checks passed on 2026-11-18. This walkthrough remains available for regression checks. See the [completed handoff](handoffs/phase-2.md) for the evidence and its limits.
