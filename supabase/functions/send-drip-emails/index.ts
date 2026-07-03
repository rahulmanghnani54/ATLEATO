// Supabase Edge Function — waitlist drip sequence (Day 2 / Day 5 / Day 9).
//
// Run DAILY via pg_cron (see DEPLOY.md). On each run it:
//   1. For each drip step, selects waitlist rows that are now due for it
//      (age in [N, N+3) days), haven't received it, and aren't already Vanguard.
//   2. Sends the step's email via Resend.
//   3. Stamps drip_dayN_sent_at so each person gets each step exactly once.
//
// Setup:
//   supabase secrets set DRIP_CRON_SECRET=<random-hex>     (gate, see below)
//   supabase functions deploy send-drip-emails --no-verify-jwt
//   Then schedule daily in pg_cron with the x-cron-secret header. See DEPLOY.md.
//
// Deployed --no-verify-jwt (so cron can call it) ⇒ publicly invokable, so we
// require DRIP_CRON_SECRET as the x-cron-secret header (constant-time compare).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') || '';
const CRON_SECRET      = Deno.env.get('DRIP_CRON_SECRET') || '';
const FROM_EMAIL = 'Rahul from Evulto <hello@evulto.com>';
const REPLY_TO   = 'hello@evulto.com';

const VANGUARD_TOTAL = 500;
const MAX_PER_STEP = 100; // Resend free-tier-friendly; raise as needed

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function guessName(email: string): string {
  const local = (email.split('@')[0] || '').trim();
  const first = local.split(/[._\-0-9]/)[0];
  if (!first || first.length < 2) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// ─── Email content per step ───────────────────────────────────────────────────

interface DripStep {
  day: 2 | 5 | 9;
  column: 'drip_day2_sent_at' | 'drip_day5_sent_at' | 'drip_day9_sent_at';
  campaign: string;
  subject: (name: string) => string;
  build: (name: string, email: string, ctx: { claimed: number; left: number }) => { text: string; html: string };
}

function upsellUrl(email: string, campaign: string): string {
  return `https://evulto.com/upsell.html?email=${encodeURIComponent(email)}`
    + `&utm_source=email&utm_medium=drip&utm_campaign=${campaign}`;
}

// Compact, on-brand HTML shell (dark, orange accent) shared by all 3 steps.
function shell(name: string, kicker: string, headline: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#070809;color:#f5f6f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">
<div style="max-width:560px;margin:0 auto;background:#0d0f13;border:1px solid rgba(255,255,255,.08);">
  <div style="height:4px;background:linear-gradient(90deg,#ff6b35,#e05a26);"></div>
  <div style="padding:26px 30px 6px;">
    <span style="display:inline-block;width:26px;height:26px;background:#0a0b0d;border-radius:7px;text-align:center;line-height:26px;font-family:Georgia,serif;font-size:17px;font-weight:bold;color:#ff6b35;vertical-align:middle;">A</span>
    <span style="margin-left:8px;font-size:14px;font-weight:600;color:#f5f6f3;vertical-align:middle;">Evulto</span>
  </div>
  <div style="padding:22px 30px 0;">
    <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:2px;color:#ff8050;text-transform:uppercase;">${esc(kicker)}</p>
    <p style="margin:0 0 16px;font-size:23px;font-weight:800;color:#f5f6f3;line-height:1.25;">${headline}</p>
    ${bodyHtml}
    <div style="margin:26px 0 8px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#ff6b35;color:#0a0b0d;font-size:15px;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:100px;">${esc(ctaLabel)} →</a>
    </div>
  </div>
  <div style="padding:14px 30px 26px;">
    <p style="margin:18px 0 4px;font-size:15px;color:#f5f6f3;">— Rahul</p>
    <p style="margin:0;font-size:13px;color:#8b909a;">Founder, Evulto</p>
  </div>
  <div style="padding:18px 30px;border-top:1px solid rgba(255,255,255,.08);background:#0a0b0d;">
    <p style="margin:0;font-size:11px;color:#5d626b;line-height:1.6;">You're on the Evulto waitlist. Coach personas are fictional AI characters. <a href="mailto:${REPLY_TO}?subject=unsubscribe" style="color:#5d626b;">Unsubscribe</a></p>
  </div>
</div></body></html>`;
}

const STEPS: DripStep[] = [
  {
    day: 2,
    column: 'drip_day2_sent_at',
    campaign: 'day2',
    subject: (n) => `${n}, here's what makes Evulto different`,
    build: (name, email) => {
      const url = upsellUrl(email, 'day2');
      const text = `Hey ${name},

Most fitness apps are silent checklists you ignore.

Evulto is the one where your AI coach actually CALLS your phone to get you training — and corrects your form in real time through your camera. Five coaches, each with their own voice and philosophy. Pick one and the whole app changes around them.

60-second look: https://evulto.com/showreel.html

Your founding Vanguard pass (one-time $1.99, first 500 only): ${url}

— Rahul
Founder, Evulto`;
      const html = shell(
        name, 'Why Evulto',
        `An AI coach that actually <span style="color:#ff8050;">calls your phone</span>.`,
        `<p style="margin:0 0 14px;color:#c4c8cd;">Most fitness apps are silent checklists you ignore. Evulto calls you to train, then corrects your form live through your camera — five coaches, each with their own voice.</p>
         <p style="margin:0 0 4px;"><a href="https://evulto.com/showreel.html?utm_source=email&utm_medium=drip&utm_campaign=day2" style="color:#ff8050;font-weight:600;">Watch the 60-second showreel →</a></p>`,
        url, 'Claim your Vanguard pass',
      );
      return { text, html };
    },
  },
  {
    day: 5,
    column: 'drip_day5_sent_at',
    campaign: 'day5',
    subject: () => `The first 500 are going fast`,
    build: (name, email, ctx) => {
      const url = upsellUrl(email, 'day5');
      const text = `Hey ${name},

Quick heads up — ${ctx.claimed} of the 500 founding Vanguard passes are claimed, ${ctx.left} left.

Vanguard is a one-time $1.99: lifetime founder status, a free month of Legend at launch, and the private Discord. When the 500 are gone, they're gone.

Claim yours: ${url}

— Rahul`;
      const html = shell(
        name, 'Founding 500',
        `${ctx.left} of 500 Vanguard passes left.`,
        `<p style="margin:0 0 14px;color:#c4c8cd;"><b style="color:#f5f6f3;">${ctx.claimed} claimed</b> · ${ctx.left} remaining. One-time $1.99 — lifetime founder status, a free month of Legend at launch, and the private Discord. When they're gone, they're gone.</p>`,
        url, 'Lock in my pass',
      );
      return { text, html };
    },
  },
  {
    day: 9,
    column: 'drip_day9_sent_at',
    campaign: 'day9',
    subject: () => `Last call on your founding pass`,
    build: (name, email) => {
      const url = upsellUrl(email, 'day9');
      const text = `Hey ${name},

This is the last nudge from me. The founding Vanguard offer — one-time $1.99 for lifetime founder status + a free month of Legend at launch — is only for the first 500. After that it's gone for good and the app drops to Free or $19.99/mo.

If the idea of a coach that calls you and fixes your form is for you, now's the moment.

Claim it: ${url}

No worries if not — you'll stay on the waitlist either way.

— Rahul`;
      const html = shell(
        name, 'Last call',
        `Your founding pass is about to expire.`,
        `<p style="margin:0 0 14px;color:#c4c8cd;">The one-time $1.99 Vanguard offer — lifetime founder status + a free month of Legend at launch — is only for the first 500. After that it's gone and the app drops to Free or $19.99/mo.</p>
         <p style="margin:0 0 14px;color:#c4c8cd;">If a coach that calls you and fixes your form is for you, this is the moment.</p>`,
        url, 'Claim before it closes',
      );
      return { text, html };
    },
  },
];

async function sendEmail(to: string, subject: string, text: string, html: string, campaign: string): Promise<boolean> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      reply_to: REPLY_TO,
      subject,
      text,
      html,
      headers: {
        'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'category', value: 'waitlist_drip' },
        { name: 'step', value: campaign },
      ],
    }),
  });
  if (!resp.ok) {
    console.error('[drip] Resend failed', campaign, to, resp.status, await resp.text());
    return false;
  }
  return true;
}

serve(async (req) => {
  // Gate — same pattern as notify-steal (function is publicly invokable).
  // Fail CLOSED: never accept unauthenticated invocations. Set DRIP_CRON_SECRET
  // in the function env and send it as x-cron-secret from the cron scheduler.
  if (!CRON_SECRET) {
    console.error('DRIP_CRON_SECRET unset — refusing invocation');
    return new Response(JSON.stringify({ error: 'not configured' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
  }
  if (!timingSafeEq(req.headers.get('x-cron-secret') || '', CRON_SECRET)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'content-type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Live scarcity numbers for the Day-5 email.
  let claimed = 0;
  try {
    const { data } = await admin.rpc('vanguard_claimed_count');
    if (typeof data === 'number') claimed = data;
  } catch { /* fall back to 0 */ }
  const left = Math.max(0, VANGUARD_TOTAL - claimed);

  const summary: Record<string, number> = {};

  for (const step of STEPS) {
    // Due window: age in [day, day+3) days, not yet sent, not already Vanguard.
    const lowerIso = new Date(Date.now() - (step.day + 3) * 86_400_000).toISOString();
    const upperIso = new Date(Date.now() - step.day * 86_400_000).toISOString();

    const { data: rows, error } = await admin
      .from('waitlist')
      .select('id, email')
      .is(step.column, null)
      .not('is_vanguard', 'is', true)
      .gte('created_at', lowerIso)
      .lte('created_at', upperIso)
      .limit(MAX_PER_STEP);

    if (error) { console.error('[drip] select failed', step.campaign, error.message); summary[step.campaign] = -1; continue; }

    let sent = 0;
    for (const row of rows ?? []) {
      const email = String((row as any).email || '').trim();
      if (!email) continue;
      const name = guessName(email);
      const { text, html } = step.build(name, email, { claimed, left });
      const ok = await sendEmail(email, step.subject(name), text, html, step.campaign);
      if (ok) {
        await admin.from('waitlist').update({ [step.column]: new Date().toISOString() }).eq('id', (row as any).id);
        sent++;
      }
    }
    summary[step.campaign] = sent;
  }

  console.log('[drip] run complete', summary);
  return new Response(JSON.stringify({ ok: true, sent: summary, claimed, left }), {
    headers: { 'content-type': 'application/json' },
  });
});
