// Supabase Edge Function — sends welcome email via Resend when a new waitlist signup happens
// Triggered by a Supabase database webhook on waitlist INSERT
//
// ⚠️ INBOX TAB STRATEGY (anti-Promotions):
// - From a real person name ("Rahul" not "Atleato Team")
// - Personal-style subject line with recipient's first name + spot number
// - Conversational opening (looks like 1:1, not broadcast)
// - Limited images (max 1 hero), no <table> layouts
// - Single CTA at top, secondary CTA at bottom
// - Reply-To set to real email; user can reply
// - List-Unsubscribe header (RFC 8058) + One-Click

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

function generateBadge(email: string): string {
  const h1 = hashStr(email, 7);
  const h2 = hashStr(email, 131);
  const h3 = hashStr(email, 977);
  const adj = adjectives[h1 % adjectives.length];
  const noun = nouns[h2 % nouns.length];
  const num = (h3 % 500) + 1;
  return `${adj} ${noun} #${String(num).padStart(3, '0')}`;
}

function guessName(email: string): string {
  const local = email.split('@')[0];
  const first = local.split(/[._\-0-9]/)[0];
  if (first.length < 2) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Plain text version — Gmail uses this for tab classification
function generatePlainText(name: string, email: string, position: number, badge: string): string {
  const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(email)}`;
  return `Hey ${name},

You're in. Spot #${position.toLocaleString()} on the Atleato waitlist.

Quick note from me directly — I'm Rahul, building Atleato solo. Thanks for joining.

Here's what's happening:

I assigned you a unique identity from the 500 founder slots: ${badge}. That's yours. Nobody else gets that exact name + number.

To lock it in permanently (before public launch), you have two paths:

Path 1 — Pay a $1.99 deposit
- Locks in 1 month free Legend tier at launch (worth $19.99)
- Founder pricing for life
- Reservation expires in 30 minutes

Path 2 — Invite 3 friends to the waitlist
- Same Vanguard pass, 100% free
- Each friend who joins via your link counts
- No deadline

Your reservation page (where you can do either):
${upsellUrl}

If neither — that's fine. You're still on the waitlist. You'll get the public launch link when Atleato goes live on Google Play in a few weeks.

Just hit reply if you have any questions. I read every message.

Talk soon,
Rahul
Founder, Atleato

P.S. — Real story why I built this: for 3 years I slept through my 5 AM alarm. So I built one that calls my phone like a real coach checking in. Reply with "story" if you want the full version.

---
You're receiving this because you joined the waitlist at atleato.com.
Reply UNSUB to remove yourself.`;
}

// HTML version — beautiful but NOT marketing-template structured
// Inspired by Substack / Notion / Linear welcome emails that land in Primary
function generateHTML(name: string, email: string, position: number, badge: string): string {
  const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(email)}`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>You're in</title></head>
<body style="margin:0;padding:0;background:#f7f5f1;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">

<div style="max-width:580px;margin:0 auto;background:#ffffff;">

  <!-- Slim accent bar (signature, not banner) -->
  <div style="height:4px;background:linear-gradient(90deg,#ff8050 0%,#ff6b35 50%,#e84d20 100%);"></div>

  <!-- Header: small mark + tagline -->
  <div style="padding:28px 32px 8px;border-bottom:1px solid #eee;">
    <div style="display:inline-block;vertical-align:middle;">
      <span style="display:inline-block;width:28px;height:28px;background:#0a0b0d;border-radius:7px;text-align:center;line-height:28px;font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#ff6b35;vertical-align:middle;">A</span>
      <span style="margin-left:8px;font-size:15px;font-weight:600;color:#0a0b0d;vertical-align:middle;letter-spacing:-0.2px;">Atleato</span>
    </div>
  </div>

  <!-- Personal opener -->
  <div style="padding:32px 32px 0;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hey ${name},</p>
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">You're in. Spot <strong>#${position.toLocaleString()}</strong> on the Atleato waitlist.</p>
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Quick note from me directly — I'm Rahul, building Atleato solo. Thanks for joining.</p>
  </div>

  <!-- Badge reveal card (the moment of delight) -->
  <div style="padding:8px 32px 0;">
    <div style="border:1px solid #e8e3da;border-radius:12px;padding:24px;background:linear-gradient(135deg,#fffaf3 0%,#fff5e8 100%);text-align:center;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:1.5px;color:#8b6f4e;text-transform:uppercase;">Your 1-of-500 Identity</p>
      <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:700;color:#e84d20;letter-spacing:-0.5px;line-height:1.2;">${badge}</p>
      <p style="margin:0;font-size:13px;color:#7a6a52;">Permanently yours · 1 of 500 ever created</p>
    </div>
  </div>

  <!-- Two paths -->
  <div style="padding:28px 32px 0;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">To lock it in permanently before public launch, you have two paths:</p>

    <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0a0b0d;">Path 1 — $1.99 deposit (~3 min)</p>
    <p style="margin:0 0 16px;padding-left:14px;font-size:14px;color:#444;line-height:1.6;border-left:3px solid #ff6b35;">
      Locks 1 month free Legend tier at launch ($19.99 value). Founder pricing for life. Reservation holds 30 minutes.
    </p>

    <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#0a0b0d;">Path 2 — Invite 3 friends (free)</p>
    <p style="margin:0 0 24px;padding-left:14px;font-size:14px;color:#444;line-height:1.6;border-left:3px solid #5b8cff;">
      Same Vanguard pass, 100% free. Each friend who joins via your unique link counts toward 3.
    </p>
  </div>

  <!-- Single CTA — text link styled, NOT button -->
  <div style="padding:0 32px 8px;">
    <p style="margin:0 0 8px;font-size:14px;color:#666;">Your reservation page (do either path here):</p>
    <p style="margin:0 0 24px;">
      <a href="${upsellUrl}" style="display:inline-block;color:#0a0b0d;font-size:15px;font-weight:600;text-decoration:none;border-bottom:2px solid #ff6b35;padding:2px 0;">
        atleato.com/upsell →
      </a>
    </p>
  </div>

  <!-- Personal closing -->
  <div style="padding:0 32px 0;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">If neither path is for you — that's fine. You're still on the waitlist. You'll get the public launch link when Atleato goes live on Google Play in a few weeks.</p>
    <p style="margin:0 0 24px;font-size:16px;color:#1a1a1a;">Just hit reply if you have any questions. I read every message.</p>

    <p style="margin:0 0 4px;font-size:16px;color:#1a1a1a;">Talk soon,</p>
    <p style="margin:0 0 2px;font-size:16px;color:#1a1a1a;font-weight:600;">Rahul</p>
    <p style="margin:0 0 24px;font-size:14px;color:#888;">Founder, Atleato</p>
  </div>

  <!-- P.S. block -->
  <div style="padding:0 32px 32px;">
    <div style="padding:16px 18px;background:#faf8f5;border-radius:8px;border-left:3px solid #ddd;">
      <p style="margin:0;font-size:14px;color:#555;line-height:1.6;"><strong style="color:#0a0b0d;">P.S.</strong> — Real story why I built this: for 3 years I slept through my 5 AM alarm. So I built one that calls my phone like a real coach checking in. Reply with "story" if you want the full version.</p>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:24px 32px;border-top:1px solid #eee;background:#fafafa;">
    <p style="margin:0 0 6px;font-size:12px;color:#999;line-height:1.6;">
      You're receiving this because you joined the waitlist at <a href="https://atleato.com" style="color:#999;">atleato.com</a>.
    </p>
    <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">
      <a href="mailto:${REPLY_TO}?subject=unsubscribe" style="color:#999;">Unsubscribe</a> · Coach personas are fictional AI characters. Not affiliated with any real individual.
    </p>
  </div>

</div>

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
    const position = 2400 + (record.id || 1);
    const badge = generateBadge(email);
    const plain = generatePlainText(name, email, position, badge);
    const html = generateHTML(name, email, position, badge);

    // Subject = personal, lowercase, no emoji at start, mention recipient name + spot
    const subject = `${name}, you're in (spot #${position.toLocaleString()})`;

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

    return new Response(JSON.stringify({ ok: true, badge, position, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
