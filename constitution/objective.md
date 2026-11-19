# Product constitution for the cards and keys MVP

This branch serves Ashoka members who have lost or found an ID card or a room key. A member posts the item, another member contacts the poster, and they verify ownership and arrange the return themselves. General items appear as an upcoming feature.

## Access and disclosure

- Require the existing Google sign-in and a confirmed Ashoka email. Only eligible signed-in members can browse or search listings.
- For each new lost or found listing, the poster chooses one contact method and sees who will be able to use it before publishing. Email uses the poster’s verified Ashoka address. WhatsApp uses a number the poster supplies, including its country code.
- A member who chooses email can publish without supplying a phone number. When a member enters a new WhatsApp number while publishing, save it privately for reuse only if the listing is saved successfully. Members can also manage their saved number in settings. Saving a number alone does not authorize sharing it.
- Display the chosen contact on that open listing. Ownership identifiers, stored contact preferences and unselected contact details stay private. Listings created before contact selection was available require an explicit owner choice before returning to discovery.
- Card names and printed numbers, and key holder names and room numbers, are campus-visible item identifiers. They cannot establish that a person contacting the poster owns the item.

## Posts and manual returns

ID cards accept the printed holder name when known and require a roll number or ID number. Room keys require a holder name and room number. Preserve leading zeros and building codes. Members can browse and search separate lost and found views, update their own listings and close them. Keep the existing limit of three active lost and three active found reports per member.

The contact on a listing belongs to its poster. A person browsing the directory decides whether to use email or WhatsApp to contact that poster outside the portal. The app sends no message and collects no claimant evidence. After the exchange the poster can mark a lost item resolved or a found item returned. The owner can also withdraw an open found listing. Closed reports leave discovery.

## Scope

The general-items section should visibly say it is upcoming. In-app claim submission, finder approval, private evidence, claim notifications, matching jobs, uploads and handoff scheduling are outside this branch’s MVP. Earlier handoffs describe the implementation inherited from main.

## Acceptance

1. Eligible members can post, find and close cards and keys. A non-owner cannot change someone else’s report.
2. Both lost and found reports support either contact channel. A saved WhatsApp number can be reused without re-entry. Email-only members can complete the entire flow without providing a phone number.
3. A peer sees only the selected contact on an opted-in open listing. Anonymous and ineligible callers cannot access either listings or contacts. Closing the report removes the contact from discovery.
4. The directory offers a direct contact action, with no intermediate app-based claim. The general-items entry explains its upcoming status.
