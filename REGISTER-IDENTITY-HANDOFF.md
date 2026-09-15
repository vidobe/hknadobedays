# Register → AEP Email Identity — Handoff / Fix Spec

**Purpose:** get a Web SDK (Alloy) registration event to attach an **email identity** in Adobe
Experience Platform so a profile can be found by email. Everything below is self-contained — no
prior context needed.

**Status:** the website payload is correct and reaches the edge (HTTP 200), but the email is
**not** landing in Profile (lookups return "entity not found"). The remaining cause is almost
certainly **downstream of the website** (the Adobe Tags/Launch container strips the `Email`
identity). The deciding test is an **Assurance** capture (§5). This doc gives another tool/engineer
everything to confirm and fix it.

---

## 1. Environment / IDs (public client-side values, not secrets)

| Thing | Value |
|---|---|
| Datastream ID | `8b082166-1bea-41ac-9f3b-f5d9f691bc86` |
| Org ID | `8AB51935659C10E40A495FA2@AdobeOrg` |
| Sandbox | `sandbox51` |
| Launch/Tags embed (dev) | `https://assets.adobedtm.com/962ef22b31a8/d5c300c59d31/launch-261b0b21b771-development.min.js` |
| Schema | "Demo System - Event Schema for Website (Global v1.1)" |
| Identity namespace for email | **`Email`** — STANDARD, ID type Email, symbol exactly `Email` (verified present in sandbox51; datastream forwards to Profile in that sandbox) |
| Test ECID seen in dev | `80577638059599650441384453964689991795` |

Web SDK is integrated via the vendored `adobe-rnd/aem-martech` plugin at `plugins/martech/`,
wired in `scripts/scripts.js` (eager `initMartech`, lazy `martechLazy`, delayed `martechDelayed`).
Alloy instance name: `alloy`. Data layer: `adobeDataLayer` (ACDL).

---

## 2. What the website sends (verified correct at the call site)

File: `scripts/register-widget.js`, function `sendRegistration()`. Captured the EXACT object
passed to `alloy('sendEvent', …)` for the Register submit:

```json
{
  "xdm": {
    "eventType": "web.webinteraction.linkClicks",
    "identityMap": {
      "Email": [{ "id": "vitor.gabriel@gmail.com", "authenticatedState": "authenticated" }],
      "Email_SHA256": [{ "id": "<sha256 hex of lowercased email>" }]
    },
    "person": { "name": { "fullName": "Vitor Gabriel" } },
    "web": { "webInteraction": { "name": "Register", "linkClicks": { "value": 1 }, "type": "other" } }
  }
}
```

Design decisions already validated:
- `identityMap` **inside `xdm`** (a top-level `identityMap` sendEvent option is **rejected** by
  Alloy: `Invalid sendEvent command options: 'identityMap': Unexpected`).
- Namespace symbol **`Email`** (capitalized).
- Email is **lowercased + trimmed**.
- **No `primary: true`** on Email — the SDK sets ECID as primary; a conflicting second primary
  makes Alloy drop the id. Email is a secondary `authenticatedState: 'authenticated'` id.
- The martech plugin's `onBeforeEventSend` spreads ACDL state onto `payload.xdm` but was tested
  in isolation and **preserves** `xdm.identityMap`.

Consent: `defaultConsent: 'pending'` — events are held until the visitor consents (Allow All).
With consent granted, the event returns **200** from `edge.adobedc.net`.

---

## 3. Symptom (from the AEP owner)

- Profile keyed on the **ECID** carries only `ecid` in its identityMap — **no `Email` node**.
- Lookup by `Email` for `vitor.gabriel@gmail.com` (and other test addresses) → **"entity not found."**
- The namespace resolves (valid identity ID) but no entity exists → nothing ever landed in Profile
  keyed on that email.

Ruled out: namespace missing / wrong sandbox (the namespace exists in sandbox51 with forwarding on),
payload placement (verified inside `xdm`), casing (`Email`), and primary conflict (removed).

---

## 4. Prime suspect — the Launch/Tags container strips the Email identity

On **every page load** (even with NO form submitted), the console shows these `🚀`-prefixed logs.
The rocket emoji marks the **Tags container's own custom code**, NOT Alloy (Alloy logs are
`[alloy] …`):

```
🚀 [Adobe Experience Platform Web SDK] The identifier at Email[0] was removed from the identity map…
🚀 [Adobe Experience Platform Web SDK] The Email namespace was removed from the identity map because…
_identities {}            ← identity map reduced to only ECID
ECID 80577638059599650441384453964689991795
```

The wired Launch property is a **retail DEMO container** (it also pulls `Retail-PartnerId*` data,
runs a demo consent dialog, and a `setDataLayer` rule expecting a global `dataLayer`). It calls
`getIdentity` and runs custom code that removes the `Email` identifier/namespace from the shared
`alloy` instance's identity map.

Because the whole site uses **one shared `alloy` instance** (the plugin registers `alloy`, and the
Launch WebSDK extension is set to "use a self-hosted alloy.js instance" named `alloy`), a mutation
the container makes to the identity map can affect what leaves for Profile — leaving only ECID.

**Not yet proven:** whether the container mutates *our specific outgoing event* vs. only its own
`getIdentity` view. Browser-side interception could not read the on-the-wire body (Alloy transmits
via `sendBeacon`/XHR with an encoded body). **Assurance is the arbiter** (§5).

---

## 5. THE decisive check — Adobe Assurance (do this first)

1. In the Tags UI (or Assurance UI), start an **Assurance** session; open the site with the
   provided `?adobeAssuranceUrl=…` (or the Assurance connection URL).
2. Grant consent (click **Allow All** on the cookie dialog), then submit the **Register** form
   (name + email).
3. Find the `web.webinteraction.linkClicks` event whose `web.webInteraction.name = "Register"`.
4. Compare:
   - **Sent XDM** (what the browser sent) — does it contain `identityMap.Email`?
   - **Post-processing / Identity view** (what survived at the edge) — is `Email` still there?

Interpretation:
- **`Email` absent in the SENT XDM** → website payload issue. (Unlikely — we captured it present
  at the call site. If it happens, re-check §2 / the plugin.)
- **`Email` present in sent XDM but GONE after processing**, with a namespace/removal notice →
  it's being stripped downstream. **This is the expected finding.** Go to §6.

---

## 6. Fix options (in priority order) — all Adobe-side, not website code

**A. Use a dedicated Heineken Tags property (recommended).**
The current container is a shared retail demo with rules that mutate identities, pull partner
data, and throw `dataLayer is not defined`. Create/point to a clean Tags property that:
  - installs the AEP Web SDK extension (v2.34+),
  - is set to **"Use a self-hosted alloy.js instance"** with instance name **`alloy`**,
  - has **no custom code that edits `identityMap`** (specifically nothing that removes `Email`),
  - forwards to the same datastream `8b08…bc86`.
Then update `MARTECH_CONFIG.launchUrls` in `scripts/scripts.js` to the new embed URL.

**B. Or fix the existing container.** In the demo Launch property, find and disable the custom
code / rule that removes the `Email` identifier and namespace from the identity map (the source of
the `🚀 … removed from the identity map` logs). Also fix the `setDataLayer` rule that references a
non-existent global `dataLayer` (this project uses `adobeDataLayer`/ACDL; a `window.dataLayer = []`
shim exists in `scripts/scripts.js` to suppress the error).

**C. Confirm the schema field is an identity descriptor (belt-and-braces).** In the event schema,
ensure the email field (`_demopotemea.identification.core.email`) is marked as an **Identity**
descriptor pointing at the `Email` namespace. (Owner indicated the namespace + forwarding are on;
this just confirms the field-level descriptor so the id enters the graph.)

**D. Datastream check.** Confirm the datastream's **Adobe Experience Platform** service has
**Profile** dataset enabled (not just Event dataset), so identity stitching persists.

---

## 7. Verify the fix

After A or B: with an Assurance session + consent, submit Register again, then in AEP:
```sql
-- Query Service on the event dataset (allow for batch ingestion latency):
SELECT timestamp, identityMap
FROM <event_dataset_in_sandbox51>
WHERE identityMap['Email'][0].id = 'vitor.gabriel@gmail.com'
ORDER BY timestamp DESC LIMIT 5;
```
Or re-run the Profile lookup by `Email = vitor.gabriel@gmail.com` — it should now return an entity
with an `Email` node in identityMap (alongside `ecid`).

---

## 8. Website code status / files

- `scripts/register-widget.js` — sends the §2 payload; nav-bar user-icon trigger + name/email
  dialog; loaded in the lazy phase. **Correct; no change pending** unless Assurance shows the
  email absent in the *sent* XDM.
- `scripts/scripts.js` — martech init (`initMartech`), pageView + linkClicks events, `window.dataLayer = []`
  shim for the container's `setDataLayer` rule, `MARTECH_WEB_SDK_CONFIG` / `MARTECH_CONFIG`.
- `plugins/martech/` — vendored `adobe-rnd/aem-martech`.

## 9. Optional follow-up (after identity works)

The register event currently uses `eventType: web.webinteraction.linkClicks`. For its own metric
in AJO/CJA, give it a dedicated eventType. Hold until email identity is confirmed landing.
