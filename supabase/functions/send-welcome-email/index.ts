// Supabase Edge Function — sends welcome email via Resend when a new waitlist signup happens
// Triggered by a Supabase database webhook on waitlist INSERT

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY'); // Set in Supabase Edge Function secrets
const FROM_EMAIL = 'Atleato <hello@atleato.com>'; // Replace once domain verified in Resend

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Vanguard Badge generator (same logic as upsell.html)
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

function generateEmailHTML(email: string, position: number, badge: string): string {
  const referralUrl = `https://atleato.com?ref=${encodeURIComponent(email)}`;
  const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Welcome to Atleato</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#0a0b0d;color:#fff;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:radial-gradient(ellipse at top left,rgba(255,107,53,0.15) 0%,#0a0b0d 50%),radial-gradient(ellipse at bottom right,rgba(255,128,80,0.12) 0%,transparent 50%),#0a0b0d;min-height:100vh;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:rgba(20,22,28,0.85);border:1px solid rgba(255,255,255,0.06);border-radius:24px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,0.6);">

<!-- Header with gradient bar -->
<tr><td style="background:linear-gradient(90deg,#ff8050,#ff6b35,#e84d20);height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>

<!-- Logo -->
<tr><td align="center" style="padding:40px 40px 20px;">
<table cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle">
<div style="display:inline-block;width:42px;height:42px;background:linear-gradient(135deg,#ff8050,#e84d20);border-radius:10px;line-height:42px;text-align:center;font-family:Arial Black,sans-serif;font-size:24px;color:#fff;font-weight:900;vertical-align:middle;box-shadow:0 6px 20px rgba(255,107,53,0.4);">A</div>
</td><td valign="middle" style="padding-left:12px;font-family:Arial Black,sans-serif;font-size:24px;color:#fff;letter-spacing:-0.5px;">Atleato<span style="font-size:10px;color:rgba(255,255,255,0.4);margin-left:2px;">™</span></td></tr></table>
</td></tr>

<!-- Hero -->
<tr><td align="center" style="padding:20px 40px 30px;">
<div style="display:inline-block;padding:6px 14px;background:rgba(57,224,138,0.15);border:1px solid rgba(57,224,138,0.3);border-radius:100px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;color:#39e08a;text-transform:uppercase;margin-bottom:24px;">✓ You're In</div>
<h1 style="margin:0 0 12px;font-family:Arial Black,sans-serif;font-size:42px;line-height:1.1;color:#fff;letter-spacing:-1.5px;">Welcome,<br/><span style="background:linear-gradient(135deg,#ff8050,#ff6b35,#e84d20);-webkit-background-clip:text;background-clip:text;color:transparent;display:inline-block;">${badge}</span></h1>
<p style="margin:0;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.6;">Your spot in the Atleato waitlist is reserved. Your 1-of-500 Vanguard Badge is locked in for life.</p>
</td></tr>

<!-- Stats cards -->
<tr><td style="padding:0 40px 30px;">
<table cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td width="50%" valign="top" style="padding-right:8px;">
<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px;text-align:center;">
<div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1.5px;color:rgba(255,255,255,0.45);margin-bottom:6px;">YOUR SPOT</div>
<div style="font-family:Arial Black,sans-serif;font-size:32px;color:#fff;line-height:1;">#${position.toLocaleString()}</div>
</div>
</td>
<td width="50%" valign="top" style="padding-left:8px;">
<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,107,53,0.2);border-radius:14px;padding:18px;text-align:center;">
<div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:1.5px;color:#ff8050;margin-bottom:6px;">VIP REMAINING</div>
<div style="font-family:Arial Black,sans-serif;font-size:32px;color:#fff;line-height:1;">88<span style="color:rgba(255,255,255,0.4);font-size:18px;">/500</span></div>
</div>
</td>
</tr>
</table>
</td></tr>

<!-- Badge showcase -->
<tr><td align="center" style="padding:10px 40px 30px;">
<div style="display:inline-block;padding:30px 40px;background:linear-gradient(135deg,rgba(255,107,53,0.1),rgba(20,22,28,0.6));border:2px solid rgba(255,107,53,0.4);border-radius:20px;box-shadow:0 0 40px rgba(255,107,53,0.2);">
<div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.5);margin-bottom:12px;">YOUR 1-OF-1 IDENTITY</div>
<div style="font-family:Arial Black,sans-serif;font-size:28px;background:linear-gradient(135deg,#ff8050,#ff6b35,#e84d20);-webkit-background-clip:text;background-clip:text;color:transparent;letter-spacing:-0.5px;">${badge}</div>
<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:8px;">Permanently yours · Visible on your profile forever</div>
</div>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 40px 30px;">
<h2 style="margin:0 0 14px;font-family:Arial Black,sans-serif;font-size:24px;color:#fff;letter-spacing:-0.5px;">Lock In Lifetime Founder Pricing</h2>
<p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">Pay $1.99 today → 1 month of Legend Tier FREE at launch (worth $19.99). Your founder pricing locks for LIFE. Only 88 VIP slots left.</p>
<a href="${upsellUrl}" style="display:inline-block;padding:18px 36px;background:linear-gradient(135deg,#ff8050,#ff6b35,#e84d20);color:#fff;text-decoration:none;border-radius:12px;font-family:Arial Black,sans-serif;font-size:14px;letter-spacing:1px;box-shadow:0 8px 24px rgba(255,107,53,0.4);">CLAIM MY VIP PASS — $1.99 →</a>
<p style="margin:14px 0 0;font-size:11px;color:rgba(255,255,255,0.4);font-family:'Courier New',monospace;">🔒 Secure · 14-day refund · One-time payment</p>
</td></tr>

<!-- Referral -->
<tr><td style="padding:0 40px 30px;">
<div style="padding:24px;background:rgba(57,224,138,0.05);border:1px solid rgba(57,224,138,0.25);border-radius:16px;text-align:center;">
<div style="font-family:Arial Black,sans-serif;font-size:18px;color:#39e08a;margin-bottom:8px;">🔗 Free Pass Alternative</div>
<p style="margin:0 0 14px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;">Invite 3 friends. Get your Vanguard Pass <strong style="color:#fff;">100% free.</strong></p>
<div style="padding:10px;background:rgba(0,0,0,0.4);border-radius:8px;font-family:'Courier New',monospace;font-size:11px;color:rgba(255,255,255,0.7);word-break:break-all;">${referralUrl}</div>
</div>
</td></tr>

<!-- What's coming -->
<tr><td style="padding:0 40px 30px;">
<h3 style="margin:0 0 16px;font-family:Arial Black,sans-serif;font-size:18px;color:#fff;letter-spacing:-0.3px;">What's coming when Atleato launches:</h3>
<table cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:8px 0;font-size:14px;color:rgba(255,255,255,0.85);">🥇 5 Legend AI Coaches (The Sculptor, The Governor, The Scientist, The Commander, Dr. Growth)</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:rgba(255,255,255,0.85);">📞 Wake-up calls that actually RING your phone like a real coach</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:rgba(255,255,255,0.85);">🎯 Live AI form correction (17-joint pose detection)</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:rgba(255,255,255,0.85);">🗺️ Territory conquest map (Splatoon meets Strava)</td></tr>
<tr><td style="padding:8px 0;font-size:14px;color:rgba(255,255,255,0.85);">🍽️ 1.2M food nutrition database</td></tr>
</table>
</td></tr>

<!-- Footer -->
<tr><td style="padding:30px 40px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.05);text-align:center;">
<p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,0.5);">— Rahul, Founder of Atleato</p>
<p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6;">Coach personas are fictional AI characters inspired by training philosophies.<br/>Not affiliated with any real individuals. <a href="https://atleato.com/privacy" style="color:rgba(255,255,255,0.5);text-decoration:underline;">Privacy Policy</a></p>
</td></tr>

</table>
</td></tr>
</table>
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
    // Supabase webhook payload: { record: { email, id, created_at, ... } }
    const record = body.record || body;
    const email = (record.email || '').toLowerCase().trim();
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email in payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const position = 2400 + (record.id || 1);
    const badge = generateBadge(email);
    const html = generateEmailHTML(email, position, badge);

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `${badge} - You're #${position.toLocaleString()} on the Atleato waitlist 🏆`,
        html,
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
