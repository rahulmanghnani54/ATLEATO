// Supabase Edge Function — sends welcome email via Resend when a new waitlist signup happens
// Triggered by a Supabase database webhook on waitlist INSERT
//
// EMAIL DESIGN: animated dark "YOU'RE IN" template with VIP pass ticket,
// incoming-call card, 5-coach lineup, stats strip, 3-step, CTA.
// Source design: docs/welcome-email.html (hosted version, fully animated)
// Tradeoff: dark-themed branded design may land in Gmail Promotions tab.
// Mitigation: real From name, conversational subject, plain-text version,
// List-Unsubscribe header, reply-to verified mailbox.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'Rahul from Atleato <hello@atleato.com>';
const REPLY_TO = 'hello@atleato.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const adjectives = ["Obsidian","Aesthetic","Zenith","Primal","Solar","Lunar","Chrono","Carbon","Titanium","Neon","Phantom","Astral","Pyro","Rogue","Savage","Apex","Iron","Crimson","Emerald","Shadow","Sonic","Eternal","Catalyst","Vector","Orbit","Helix","Core","Delta","Alpha","Prime","Nova","Matrix","Cobalt","Kinetic"];
const nouns = ["Vanguard","Nomad","Ranger","Sentinel","Titan","Gladiator","Spectre","Warden","Raider","Enforcer","Dynamo","Monarch","Phoenix","Crusader","Spartan","Overlord","Oracle","Catalyst","Outlaw","Striker","Tempest","Reaper","Falcon","Maverick","Centurion","Brute","Sage","Ronin","Juggernaut"];

function hashStr(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function deriveBadge(email: string): { adj: string; noun: string; passNo: number; full: string } {
  const h1 = hashStr(email, 7);
  const h2 = hashStr(email, 131);
  const h3 = hashStr(email, 977);
  const adj = adjectives[h1 % adjectives.length];
  const noun = nouns[h2 % nouns.length];
  const passNo = (h3 % 500) + 1;
  return { adj, noun, passNo, full: `${adj} ${noun} #${String(passNo).padStart(3,'0')}` };
}

function guessName(email: string): string {
  const local = email.split('@')[0];
  const first = local.split(/[._\-0-9]/)[0];
  if (first.length < 2) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string));
}

function generatePlainText(name: string, email: string, position: number, badge: string, passNo: number, upsellUrl: string, hostedUrl: string): string {
  return `Hey ${name},

YOU'RE ON THE WAITLIST.

You're #${position.toLocaleString()} on the waitlist to train under a legend. Your founding pass #${String(passNo).padStart(4,'0')} is reserved — but only the first 500 who CLAIM it actually get one.

Your reserved identity: ${badge}
Claim your pass to make it yours.

— This is how training starts —

Your coach calls. Not a notification you can swipe away — an actual incoming call. Decline, and your coach rings back in 5 minutes. No excuses.

Your 5 legend coaches:
- The Sculptor — Classic Physique · 5x decorated
- The Monument — Golden Era · Monument era
- The Analyst — Evidence-driven
- The Commander — Iron Pact · No Excuses
- The Architect — Hypertrophy & Periodization · Volume Landmarks

Start in 60 seconds:
1. Pick a coach — the whole app transforms around their philosophy
2. Set your wake-up — tomorrow your phone rings like a real call
3. Train. Eat. Conquer.

Claim your Vanguard Pass. 500 total, first-come — one-time $1.99, 1 month free Legend tier at launch, private Discord, refundable any time before launch.

Confirm my pass: ${upsellUrl}

View this email in your browser (with animations): ${hostedUrl}

Just hit reply if you have any questions. I read every message.

— Rahul
Founder, Atleato

---
You're receiving this because you joined the waitlist at atleato.com.
Coach personas are fictional AI characters and are not affiliated with any real individuals.
Unsubscribe: reply with UNSUB.`;
}

// HTML version — EMAIL-SAFE. Email clients strip <style> blocks and do NOT
// support CSS variables, so the old var(--x) design rendered white/unstyled in
// Gmail/Outlook/etc. This version uses a table layout + inline styles + literal
// colors so the dark brand renders consistently. No animations (clients strip
// @keyframes) and no web fonts (clients ignore them).
function generateHTML(name: string, email: string, position: number, badge: string, passNo: number, upsellUrl: string, hostedUrl: string): string {
  const safeName = escapeHtml(name);
  const safePass = String(passNo).padStart(4, '0');
  const safePos = position.toLocaleString();
  const coaches: Array<[string, string]> = [
    ['The Sculptor', 'Classic Physique · 5× Champion'],
    ['The Monument', 'Golden Era · Old-school mass'],
    ['The Analyst', 'Evidence-based hypertrophy'],
    ['The Commander', 'No excuses · Iron will'],
    ['The Architect', 'Volume-landmark periodization'],
  ];
  const coachRows = coaches.map(([n, d]) => `
        <tr><td style="padding:10px 0;border-bottom:1px solid #1e2127;">
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#f5f6f3;">${n}</span><br/>
          <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8b909a;">${d}</span>
        </td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="color-scheme" content="dark"/><title>Atleato — You're In</title></head>
<body style="margin:0;padding:0;background:#040506;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">You're on the Atleato waitlist — pass #${safePass} of 500.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#040506;"><tr><td align="center" style="padding:24px 12px 60px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0a0b0d;border:1px solid #1e2127;border-radius:18px;overflow:hidden;">
    <tr><td style="height:4px;background:#ff6b35;font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:24px 30px 6px;">
      <span style="display:inline-block;width:28px;height:28px;background:#16181d;border-radius:7px;text-align:center;line-height:28px;font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#ff6b35;">A</span>
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#f5f6f3;margin-left:8px;">Atleato</span>
    </td></tr>
    <tr><td style="padding:26px 30px 0;">
      <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;color:#ff8050;text-transform:uppercase;">&#9679; You're in</p>
      <h1 style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:1.1;font-weight:800;color:#f5f6f3;">Hey ${safeName}, you're on the list.</h1>
      <p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#c4c8cd;">You're <b style="color:#f5f6f3;">#${safePos}</b> on the waitlist. Your founding pass <b style="color:#f5f6f3;">#${safePass}</b> is reserved — but only the first 500 who claim it actually get one.</p>
    </td></tr>
    <tr><td style="padding:6px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121418;border:1px solid #262a31;border-radius:12px;"><tr><td style="padding:20px 22px;">
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;color:#ff8050;text-transform:uppercase;">Your reserved identity</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#f5f6f3;">${escapeHtml(badge)}</p>
        <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8b909a;">Reserved — claim your pass to make it yours</p>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:28px 30px 0;">
      <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;color:#f5f6f3;">Here's how training starts.</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#c4c8cd;">Your coach calls. Not a notification you swipe away — an actual incoming call. Decline, and your coach rings back in 5 minutes. No excuses.</p>
    </td></tr>
    <tr><td style="padding:24px 30px 0;">
      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;color:#8b909a;text-transform:uppercase;">Your 5 legend coaches</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${coachRows}</table>
    </td></tr>
    <tr><td style="padding:28px 30px 4px;">
      <a href="${upsellUrl}" style="display:inline-block;background:#ff6b35;color:#0a0b0d;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;text-decoration:none;padding:15px 30px;border-radius:100px;">Claim your Vanguard pass &#8594;</a>
      <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8b909a;">One-time $1.99 · 1 month free Legend at launch · first 500 only.</p>
    </td></tr>
    <tr><td style="padding:26px 30px 0;">
      <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#f5f6f3;">— Rahul</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8b909a;">Founder, Atleato</p>
    </td></tr>
    <tr><td style="padding:8px 30px 30px;">
      <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#5d626b;border-top:1px solid #1e2127;padding-top:16px;">You joined the waitlist at atleato.com. Coach personas are fictional AI characters. <a href="${hostedUrl}" style="color:#8b909a;">View in browser</a> · <a href="mailto:hello@atleato.com?subject=unsubscribe" style="color:#5d626b;">Unsubscribe</a></p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const record = body.record || body;
    const email = (record.email || '').toLowerCase().trim();
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email in payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const name = guessName(email);
    // Real signup order (the BIGSERIAL row id) — not a fabricated number.
    const position = record.id || 1;
    const { passNo, full: badge } = deriveBadge(email);

    const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(email)}`;
    const hostedUrl = `https://atleato.com/welcome-email.html?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&pos=${position}&pass=${passNo}`;

    const plain = generatePlainText(name, email, position, badge, passNo, upsellUrl, hostedUrl);
    const html = generateHTML(name, email, position, badge, passNo, upsellUrl, hostedUrl);

    const subject = `${name}, you're in — pass #${String(passNo).padStart(4,'0')} reserved`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        reply_to: REPLY_TO,
        subject,
        text: plain,
        html,
        headers: {
          'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-Entity-Ref-ID': `atleato-waitlist-${record.id || Date.now()}`,
        },
        tags: [
          { name: 'category', value: 'waitlist_welcome' },
          { name: 'list_id', value: 'atleato_waitlist' },
        ],
      }),
    });

    const result = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Resend send failed', detail: result }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, badge, position, passNo, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
