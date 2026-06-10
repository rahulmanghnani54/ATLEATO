# Fix Runbook — Compliance Log

Tracks status of every item in `atleato-fix-runbook.md` (V2 audit).
**An item is done only when a test confirms it** — not when the doc says so.

Last verified: **2026-06-10**

---

## TIER 0 — PROVEN BROKEN

### 0.1 Security headers (live scan F)
**Status:** ⏳ User action required (Cloudflare dashboard)
**Notes:** Cloudflare proxy + Transform Rules are user-side. Code-side CSP via meta tag is already deployed on `index.html`. Real HTTP headers require Cloudflare Rules to be configured per the runbook's step-by-step.
**Verify command:** `curl -sI https://atleato.com | grep -iE "strict-transport-security|x-frame|content-security"` — should return non-empty after Cloudflare rules are live.

### 0.2 CSP starter
**Status:** ✅ Already in place via meta on `docs/index.html`
**Notes:** Current CSP uses `default-src 'self'` + Supabase in connect-src + Google Fonts in style/font src — matches the runbook's starter. Cloudflare Transform Rule will let you also serve it as a real HTTP header (recommended for `Report-Only` rollout first).

---

## TIER 1 — LAUNCH BLOCKERS

### 1.1 Admin page auth gate
**Status:** ✅ Defense-in-depth gate added
**Notes:** Client-side SHA-256 passphrase gate added to `docs/admin-*.html`. Default passphrase: `atleato-launch-2026` (ROTATE BEFORE LAUNCH). For true production-grade gating, use Cloudflare Access or Supabase Auth role check.
**Real security:** migration 012 already makes data inaccessible via the anon key — even if the admin URL leaks, no PII is exposed.
**Verify:** open the admin URL in incognito → must see passphrase prompt before any data UI loads.

### 1.2 Reconcile dark patterns (product + doc agreement)
**Status:** ✅ Fixed everywhere
- `upsell.html`: 30-min countdown removed in commit `6f339ec`
- `product-documentation.html` §11 Step 4: no longer says "30-min reservation timer"
- `product-documentation.html` §11 Step 8: no longer mentions "Clears 30-min reservation hold"
- `app/friend-scoreboard.tsx`: `isLosing` hard-coded to `false` — no red/pressure UI
- `lib/friendScoreboard.ts`: `getScoreboardMessage()` rewritten with neutral/encouraging copy
- `product-documentation.html` §5.7: description updated to say "neutral/encouraging copy"
**Verify:** load `/upsell.html` — no countdown card. Open Friend Scoreboard with friend trained more than you — no "you're behind" message.

### 1.3 Doc self-contradictions
**Status:** ✅ Fixed
- Cover: `V1 · 2026-06-09` → `V1.1 · 2026-06-10`
- §16.2: "HSTS enforced via GitHub Pages" → "HSTS via Cloudflare Transform Rules, pending live verification"
- §16.2: "CSP + X-Frame-Options + Referrer-Policy on all HTML pages" → split into "meta-honored" vs "Cloudflare-served"
- §11 + §5.7 reconciled (see 1.2)
**Verify:** grep doc for "HSTS" and "GitHub Pages" — every mention tells the same true story.

### 1.4 Email delivery confirmation
**Status:** ⏳ User action — requires real Gmail signup + mail-tester.com
**Notes:** Once SPF/DKIM/DMARC TXT records are added in Cloudflare DNS (which is now your authoritative DNS) per Resend dashboard, send a test signup to a Gmail account and run mail-tester.com.

### 1.5 Repo secret scan
**Status:** ✅ Clean
**Verified:** `git log --all -p | grep -iE "sk-ant-api[0-9]+|sk_live_[a-zA-Z0-9]+|whsec_[a-zA-Z0-9]{20,}|re_[a-zA-Z0-9]{30,}|AIzaSy[a-zA-Z0-9_-]{20,}"` returns no real secrets (only documentation placeholders).
**Recommendation:** still rotate Lemon Squeezy webhook secret + Resend API key as hygiene + enable Resend webhook restrictions.

### 1.6 MFA everywhere
**Status:** ⏳ User action across 6 providers (Namecheap, Cloudflare, GitHub, Supabase, Lemon Squeezy, Firebase, Gmail/Atleato mailbox)

---

## TIER 2 — LAUNCH-GATING OPS

### 2.1 Lemon Squeezy Live Mode
**Status:** ⏳ User action — submit for approval, flip mode, swap URL

### 2.2 EAS build
**Status:** ⏳ User action — debug npm conflict

---

## TIER 3 — VERIFY "CLAIMED DONE"

### 3.1 Anon RLS re-confirmation
**Status:** ✅ VERIFIED 2026-06-10
```
curl https://kbldncrurztfwlqzajen.supabase.co/rest/v1/waitlist?select=email -H "apikey: ANON_KEY"
→ []
curl https://kbldncrurztfwlqzajen.supabase.co/rest/v1/vanguard_orders?select=email -H "apikey: ANON_KEY"
→ []
```

### 3.2 Coach de-identification leftover scan
**Status:** ✅ VERIFIED 2026-06-10
```
grep -rn "stay thavage|Iron Asylum|cherry pickin|PubMed-driven" --include="*.ts" --include="*.tsx" --include="*.html" --include="*.md" --include="*.js" . | grep -v node_modules
→ (no hits)
```

### 3.3 Keypoint count accuracy
**Status:** ✅ Fixed
**Issue:** doc said "MediaPipe Pose Landmarker · 17 keypoints" but code uses **MoveNet Lightning** (17 keypoints is correct for MoveNet COCO topology). MediaPipe Pose Landmarker would be 33.
**Fix:** doc §6.3 + §13.1 updated to say "MoveNet Lightning (17-keypoint COCO topology)" instead of MediaPipe.

---

## DEFINITION OF DONE — applied to every item above

- Security headers: ⏳ pending green securityheaders.com scan
- Admin: ✅ gate prompts in incognito + ✅ RLS prevents data exposure regardless
- RLS: ✅ both tables return `[]`
- Email: ⏳ pending real Gmail inbox arrival + mail-tester ≥9/10
- Repo: ✅ secret scan clean
- MFA: ⏳ per-provider verification

---

## NEXT — after Tier 0-1 verified

Per the runbook's closing section:
1. **Validate the wedge** — 10-15 user interviews
2. **Get loud** — build-in-public, video, audience-specific communities
3. **Instrument retention** — D7/D30 + consistency lift through beta

These are user-side launch ops, not engineering.
