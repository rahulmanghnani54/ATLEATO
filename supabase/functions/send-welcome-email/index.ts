// Supabase Edge Function — sends welcome email via Resend when a new waitlist signup happens
// Triggered by a Supabase database webhook on waitlist INSERT
//
// ⚠️ INBOX TAB STRATEGY (anti-Promotions):
// - From a real person name ("Rahul" not "Atleato Team")
// - Plain text PRIMARY content (HTML is minimal fallback)
// - Conversational tone, no marketing words in subject
// - Single CTA, links not buttons
// - No images, no gradients, no <table> layouts
// - Reply-To set so people can actually reply
// - Subject mentions the recipient's name (not "Welcome to...")

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
// IMPORTANT: This needs to be from your verified domain in Resend
// Use a personal-sounding from address to land in Primary tab
const FROM_EMAIL = 'Rahul from Atleato <rahul@atleato.com>';
const REPLY_TO = 'rahul@atleato.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vanguard Badge generator (matches upsell.html)
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

// Extract first name from email (heuristic, plain-looking subject helps Primary tab)
function guessName(email: string): string {
  const local = email.split('@')[0];
  // Take first segment before . or _ or - or digits
  const first = local.split(/[._\-0-9]/)[0];
  if (first.length < 2) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// ═══════════════════════════════════════════════
// PLAIN TEXT email — this is what Gmail reads
// for tab classification. Keep it personal + low-marketing.
// ═══════════════════════════════════════════════
function generatePlainText(name: string, email: string, position: number, badge: string): string {
  const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(email)}`;
  return `Hey ${name},

Thanks for joining the Atleato waitlist. You're #${position.toLocaleString()} in line.

Quick update from me directly:

I'm building Atleato because every fitness app I've used felt the same. Atleato gives you 5 distinct AI coach personas — pick one and the whole app transforms around their style.

You got assigned a unique identity: ${badge}. That's 1 of only 500 — yours forever once you claim it.

Two ways to claim it before public launch:

1. Pay a $1.99 deposit today: locks in 1 month free Legend tier at launch ($19.99 value) + founder pricing for life.

2. Or invite 3 friends to the waitlist: same Vanguard pass, 100% free.

Here's your reservation page:
${upsellUrl}

The reservation holds for 30 minutes — after that the spot opens to the next person on the list.

If you have any questions, just reply to this email. I read every reply.

Talk soon,
Rahul
Founder, Atleato

P.S. — Want to know exactly what I built and why? Reply with "story" and I'll send you the full backstory.

---
You're receiving this because you joined the waitlist at atleato.com.
Reply STOP to unsubscribe.`;
}

// ═══════════════════════════════════════════════
// MINIMAL HTML — text-style with one subtle button
// Looks like a personal email, not a marketing newsletter
// ═══════════════════════════════════════════════
function generateHTML(name: string, email: string, position: number, badge: string): string {
  const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(email)}`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Your Atleato spot</title></head>
<body style="margin:0;padding:0;background:#ffffff;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">

<div style="max-width:560px;margin:0 auto;padding:32px 24px;">

<p style="margin:0 0 16px;">Hey ${name},</p>

<p style="margin:0 0 16px;">Thanks for joining the Atleato waitlist. You're <strong>#${position.toLocaleString()}</strong> in line.</p>

<p style="margin:0 0 16px;">Quick update from me directly:</p>

<p style="margin:0 0 16px;">I'm building Atleato because every fitness app I've used felt the same. Atleato gives you 5 distinct AI coach personas — pick one and the whole app transforms around their style.</p>

<p style="margin:0 0 16px;">You got assigned a unique identity:</p>

<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:20px;color:#ff6b35;font-weight:600;">${badge}</p>

<p style="margin:0 0 16px;">That's 1 of only 500. Yours forever once you claim it.</p>

<p style="margin:0 0 16px;">Two ways to claim it before public launch:</p>

<p style="margin:0 0 12px;"><strong>1.</strong> Pay a $1.99 deposit today: locks in 1 month free Legend tier at launch ($19.99 value) + founder pricing for life.</p>

<p style="margin:0 0 24px;"><strong>2.</strong> Or invite 3 friends to the waitlist: same Vanguard pass, 100% free.</p>

<p style="margin:0 0 24px;">Here's your reservation page:<br/>
<a href="${upsellUrl}" style="color:#ff6b35;text-decoration:underline;">${upsellUrl}</a></p>

<p style="margin:0 0 16px;">The reservation holds for 30 minutes — after that the spot opens to the next person on the list.</p>

<p style="margin:0 0 16px;">If you have any questions, just reply to this email. I read every reply.</p>

<p style="margin:0 0 8px;">Talk soon,<br/>
Rahul<br/>
Founder, Atleato</p>

<p style="margin:24px 0 0;color:#666;font-size:14px;">P.S. — Want to know exactly what I built and why? Reply with "story" and I'll send you the full backstory.</p>

<hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;"/>

<p style="margin:0;color:#999;font-size:12px;">You're receiving this because you joined the waitlist at atleato.com. <a href="mailto:${REPLY_TO}?subject=unsubscribe" style="color:#999;">Unsubscribe</a></p>

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

    // Subject lines that look personal, NOT marketing
    // Avoid: "Welcome to...", "Claim your...", "% off", "FREE", emojis at start
    // Use: first name + casual + lowercase looks human
    const subject = `${name}, here's your Atleato spot (#${position.toLocaleString()})`;

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
        text: plain,    // ← Gmail uses text version for tab classification
        html,
        // List-Unsubscribe header (RFC 8058) — Gmail rewards this
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
