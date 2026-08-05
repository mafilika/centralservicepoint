# Central Service Point — Build Notes (Phase 1)

South Africa contractor marketplace. Vanilla HTML/CSS/JS + Firebase, no frameworks.

## What's included in this phase

- `index.html` — homepage with hero search, categories, how-it-works
- `login.html`, `register.html` — full Firebase Auth flow (email verification,
  password reset, role selection, Firestore user/contractor doc creation)
- `categories.html` — full category grid
- `search-results.html` — Firestore-backed search with filters sidebar
- `contractor-profile.html` + `js/contractor-profile.js` — full dynamic profile:
  gallery (from `contractors/{id}/portfolio`), approved reviews, stats, business
  hours, Google Maps embed, LocalBusiness JSON-LD, call/WhatsApp/quote CTAs
- `request-quote.html` + `js/request-quote.js` — sign-in gated quote form that
  writes to `quotes/{id}`; handles "no contractor selected" and success states,
  and round-trips `?redirect=` through login/register so an unauthenticated
  visitor lands back on the quote form after signing in
- `functions/index.js` — **Cloud Functions**, currently:
  - `notifyContractorOnNewQuote` — fires on every new `quotes/{id}`, sends the
    contractor a WhatsApp message via Twilio, and logs the result to
    `notifications` and back onto the quote doc
  - `trialExpiryReminders` — daily scheduled function, scaffolded and safe to
    deploy now, but no-ops until you set its template secret (see below)
- `css/style.css` — full design system (tokens, components, responsive)
- `js/firebase-config.js`, `js/main.js`, `js/auth.js`, `js/search.js`
- `firestore.rules`, `storage.rules` — role-based security rules
- `firebase.json`, `firestore.indexes.json` — hosting + query indexes (now
  includes the `reviews` composite index the profile page needs)

## WhatsApp quote notifications — setup

Contractors get a WhatsApp message the moment a customer submits a quote
request. This runs server-side via Twilio's WhatsApp API, triggered by a
Firestore `onCreate` function — never from the browser, since that's the only
place credentials can live safely and the only place Firestore rules allow
`notifications` writes from.

**Why a template message, not free text:** WhatsApp requires any
business-initiated message (one the contractor didn't message you first to
trigger) to use a pre-approved message template. Free-form text only works
inside a 24-hour window after the *contractor* messages *you* first.

1. **Create a Twilio account** and apply for WhatsApp sender access. For
   testing, Twilio's WhatsApp Sandbox works instantly (contractors join by
   sending a code to a shared Twilio number) — production requires either
   Twilio's own WhatsApp Business Profile approval or connecting a Meta
   WhatsApp Business Account.
2. **Create a message template** in the Twilio Content Editor (or Meta
   Business Manager if going direct) with 4 variables, e.g.:
   > New lead on Central Service Point! {{1}} needs {{2}}. Budget: {{3}}.
   > View & respond: {{4}}

   Get it approved, then copy its Content SID (starts with `HX...`).
3. Set the secrets Cloud Functions needs:
   ```
   firebase functions:secrets:set TWILIO_ACCOUNT_SID
   firebase functions:secrets:set TWILIO_AUTH_TOKEN
   firebase functions:secrets:set TWILIO_WHATSAPP_FROM        # e.g. whatsapp:+14155238886
   firebase functions:secrets:set TWILIO_QUOTE_TEMPLATE_SID   # the HX... SID from step 2
   ```
4. `cd functions && npm install`
5. Deploy: `firebase deploy --only functions`

**Contractor opt-out:** the contractor doc has a `whatsappNotificationsEnabled`
boolean (defaults to `true` at signup). The function checks it before sending —
wire a toggle for this into the Contractor Dashboard when we build it.

**Alternative:** if you'd rather use Meta's WhatsApp Cloud API directly
instead of Twilio (no per-message Twilio markup, but you handle Meta Business
verification yourself), the function's structure stays the same — only the
`twilio(...)` client call in `notifyContractorOnNewQuote` changes to a fetch
against `graph.facebook.com/.../messages`. Say the word and I'll swap it.

## What's NOT built yet (roadmap)

These need real design/business decisions from you as we go, so building
them blind would mean guessing at your workflows. Suggested order:

1. **Compare Contractors page** — side-by-side table, uses saved/selected contractor IDs
2. **Customer Dashboard** — saved contractors, quote tracking, reviews left
3. **Contractor Dashboard** — profile editor, portfolio upload, leads inbox,
   subscription status, and the WhatsApp-notifications toggle mentioned above
4. **Admin Dashboard** — approve/reject contractors, moderate reviews, manage categories/cities
5. **Payment integration** — PayFast or Peach Payments hosted checkout + a Cloud Function
   webhook that writes `payments`/`subscriptions` docs (card data never touches our code)
6. **More Cloud Functions** — auto-suspend on failed payment, review eligibility
   checks, sitemap generation
7. Remaining static pages: About, Contact, Pricing, Blog, FAQ, Privacy, Terms, 404

Tell me which of these to build next and I'll keep going in the same style.

## Firestore schema (collections)

```
users/{uid}
  fullName, email, role ["customer"|"contractor"], status, createdAt, emailVerified

contractors/{uid}            # uid == owning user's uid
  businessName, email, province, cities[], categories[]
  approvalStatus ["pending"|"approved"|"rejected"], verified (bool)
  subscriptionPlan ["trial"|"basic"|"professional"|"premium"|"enterprise"]
  trialEndsAt, rating, reviewCount, createdAt
  contractors/{uid}/portfolio/{itemId}   # subcollection: image, caption

categories/{id}, cities/{id}, provinces/{id}    # admin-managed reference data

quotes/{id}
  customerUid, contractorUid, service, message, status, createdAt

reviews/{id}
  contractorUid, customerUid, quoteId, rating, text, photos[], status

messages/{id}
  quoteId, senderUid, recipientUid, text, createdAt

subscriptions/{id}   # server-written only
  contractorUid, plan, renewalDate, status

payments/{id}         # server-written only, via gateway webhook
  contractorUid, amount, status, transactionId, invoiceNumber, paymentReference
  # NEVER: card number, CVV, expiry, PIN

notifications/{id}, favourites/{id}, blogs/{id}, analytics/{id}
```

## Deployment

1. Install the Firebase CLI: `npm install -g firebase-tools`
2. `firebase login`
3. Create a project at console.firebase.google.com, enable:
   - Authentication → Email/Password provider
   - Firestore Database (production mode)
   - Storage
4. Copy your project's config into `js/firebase-config.js` (the six
   `firebaseConfig` values from Project Settings → General → Your apps).
5. From this folder: `firebase init` → select Hosting, Firestore, Storage →
   point to this directory, use existing `firebase.json`.
6. Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`
7. Deploy the site: `firebase deploy --only hosting`
8. In Firebase Console → Authentication → Templates, customize the
   verification/reset emails; set your production domain in Authorized Domains.

## Payments (when we build Phase 7)

We'll integrate PayFast (most common for South African SaaS/marketplace
billing) or Peach Payments via their **hosted checkout** — card entry never
touches our servers or code. A Cloud Function will receive the gateway's
webhook (ITN for PayFast), verify its signature, then write only
`status`, `transactionId`, `plan`, `renewalDate`, `invoiceNumber`, and
`paymentReference` to Firestore. Raw card data is categorically never
stored or logged anywhere in this codebase.
