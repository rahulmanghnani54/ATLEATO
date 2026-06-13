// Supabase Edge Function — Lemon Squeezy webhook receiver.
//
// LS calls this on every payment-related event for the Atleato store. We:
//   1. Verify the X-Signature header against LEMONSQUEEZY_WEBHOOK_SECRET
//      (HMAC-SHA256 of the raw request body)
//   2. Insert/update the order in public.vanguard_orders (idempotent on ls_order_id)
//   3. On a paid order: assign a 1-500 pass number and flip waitlist.is_vanguard
//   4. On a paid order: send the personalized "You're a Vanguard" email via Resend
//   5. On a refund: flip status='refunded' (do NOT free the pass # — they had it)
//
// Setup:
//   supabase secrets set LEMONSQUEEZY_WEBHOOK_SECRET=<from LS dashboard>
//   supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
//   Then in LS: Settings → Webhooks → Add endpoint:
//     URL: https://kbldncrurztfwlqzajen.supabase.co/functions/v1/lemonsqueezy-webhook
//     Events: order_created, order_refunded
//     Signing secret: copy → save in Supabase secrets above

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LS_SECRET = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET') || '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
// Allow the dev/staging bypass only when explicitly opted in.
// In production, missing LS_SECRET = reject every request (fail-closed).
const ALLOW_UNSIGNED = Deno.env.get('LEMONSQUEEZY_ALLOW_UNSIGNED') === '1';
// Replay window: drop webhooks whose payload created_at is older than this.
// LS retries failed webhooks for ~3 days; 7 days gives generous headroom.
const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Product whitelist — comma-separated LS product_ids that should mint a
// Vanguard pass. If unset, falls back to "accept any paid product" (legacy
// behavior, OK only when the LS store has a single product).
// Set via: supabase secrets set LEMONSQUEEZY_VANGUARD_PRODUCT_IDS=12345,67890
const ALLOWED_PRODUCT_IDS = (Deno.env.get('LEMONSQUEEZY_VANGUARD_PRODUCT_IDS') || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const FROM_EMAIL = 'Rahul from Atleato <hello@atleato.com>';
const REPLY_TO = 'hello@atleato.com';
// Set via: supabase secrets set DISCORD_INVITE_URL=https://discord.gg/yourcode
// If unset, the email omits the Discord block gracefully.
const DISCORD_INVITE_URL = Deno.env.get('DISCORD_INVITE_URL') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-event-name',
};

// ─── HMAC-SHA256 verification (Web Crypto API, Deno-native) ───
async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Constant-time comparison
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) {
    diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Deterministic badge from email (mirrors send-welcome-email) ───
const adjectives = ["Obsidian","Aesthetic","Zenith","Primal","Solar","Lunar","Chrono","Carbon","Titanium","Neon","Phantom","Astral","Pyro","Rogue","Savage","Apex","Iron","Crimson","Emerald","Shadow","Sonic","Eternal","Catalyst","Vector","Orbit","Helix","Core","Delta","Alpha","Prime","Nova","Matrix","Cobalt","Kinetic"];
const nouns = ["Vanguard","Nomad","Ranger","Sentinel","Titan","Gladiator","Spectre","Warden","Raider","Enforcer","Dynamo","Monarch","Phoenix","Crusader","Spartan","Overlord","Oracle","Catalyst","Outlaw","Striker","Tempest","Reaper","Falcon","Maverick","Centurion","Brute","Sage","Ronin","Juggernaut"];

function hashStr(s: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function badgeName(email: string): string {
  const h1 = hashStr(email, 7);
  const h2 = hashStr(email, 131);
  return `${adjectives[h1 % adjectives.length]} ${nouns[h2 % nouns.length]}`;
}
function guessName(email: string): string {
  const local = email.split('@')[0];
  const first = local.split(/[._\-0-9]/)[0];
  if (first.length < 2) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// ─── Confirmation email (sent AFTER successful payment, separate from waitlist welcome) ───
async function sendVanguardConfirmedEmail(opts: {
  email: string; name: string; passNo: number; badge: string; orderNumber: string; totalFormatted: string;
}) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY missing — skipping vanguard confirmation email');
    return;
  }
  const passStr = String(opts.passNo).padStart(4, '0');
  const hostedUrl = `https://atleato.com/welcome-email.html?email=${encodeURIComponent(opts.email)}&name=${encodeURIComponent(opts.name)}&pass=${opts.passNo}`;
  const upsellUrl = `https://atleato.com/upsell.html?email=${encodeURIComponent(opts.email)}&paid=true`;

  const plain = `Hey ${opts.name},

PAYMENT CONFIRMED. Pass #${passStr} of 500 is yours forever.

Your identity: ${opts.badge} #${passStr}
Permanently yours · 1 of 500 ever created · Founder Tier

Order #${opts.orderNumber} · ${opts.totalFormatted}

What happens next:
- TODAY: this confirmation + Lemon Squeezy receipt in your inbox
${DISCORD_INVITE_URL ? `- TODAY: Join the private Vanguard Discord → ${DISCORD_INVITE_URL}\n` : ''}- +2 WEEKS: first Vanguards-only build update from me
- LAUNCH -14d: Google Play closed-testing invite (before public sees it)
- LAUNCH DAY: Legend tier auto-activates for 30 days FREE
- LAUNCH +30d: drops back to Free tier (NO auto-charge). Continue at $19.99/mo only if you choose.

Your Vanguard page: ${upsellUrl}
View animated welcome: ${hostedUrl}

Just hit reply if you have any questions. I read every message.

— Rahul
Founder, Atleato

P.S. — Lemon Squeezy handles refunds via reply to this email or your receipt. Refundable anytime before launch. No questions.`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f5f1;color:#1a1a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">
<div style="max-width:580px;margin:0 auto;background:#ffffff;">
  <div style="height:4px;background:linear-gradient(90deg,#39e08a 0%,#2bb56e 100%);"></div>
  <div style="padding:28px 32px 8px;border-bottom:1px solid #eee;">
    <span style="display:inline-block;width:28px;height:28px;background:#0a0b0d;border-radius:7px;text-align:center;line-height:28px;font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#ff6b35;vertical-align:middle;">A</span>
    <span style="margin-left:8px;font-size:15px;font-weight:600;color:#0a0b0d;vertical-align:middle;">Atleato</span>
  </div>
  <div style="padding:32px 32px 0;">
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:2px;color:#39e08a;text-transform:uppercase;">● Payment Confirmed</p>
    <p style="margin:0 0 16px;font-size:24px;font-weight:800;color:#0a0b0d;line-height:1.3;">Hey ${opts.name}, Pass #${passStr} of 500 is yours forever.</p>
  </div>
  <div style="padding:8px 32px 0;">
    <div style="border:1px solid #e8e3da;border-radius:12px;padding:24px;background:linear-gradient(135deg,#fffaf3 0%,#fff5e8 100%);text-align:center;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:1.5px;color:#8b6f4e;text-transform:uppercase;">Your 1-of-500 Identity</p>
      <p style="margin:0 0 6px;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#e84d20;letter-spacing:-0.5px;line-height:1.2;">${opts.badge} #${passStr}</p>
      <p style="margin:0;font-size:13px;color:#7a6a52;">Permanently yours · Founder Tier · 1 of 500</p>
    </div>
  </div>
  <div style="padding:28px 32px 0;">
    <p style="margin:0 0 12px;font-size:14px;color:#666;">Order summary:</p>
    <p style="margin:0 0 24px;padding:14px 18px;background:#faf8f5;border-radius:8px;font-family:'JetBrains Mono','SF Mono',monospace;font-size:13px;color:#1a1a1a;line-height:1.6;">
      <strong>Order #${opts.orderNumber}</strong><br/>
      VIP Vanguard Pass — Atleato<br/>
      Amount: ${opts.totalFormatted}<br/>
      Status: <span style="color:#39e08a;font-weight:700;">PAID</span>
    </p>
  </div>
  <div style="padding:0 32px 0;">
    <p style="margin:0 0 16px;font-size:15px;font-weight:600;color:#0a0b0d;">What happens next:</p>
    ${DISCORD_INVITE_URL ? `<p style="margin:0 0 10px;font-size:14px;color:#444;padding-left:14px;border-left:3px solid #5865F2;"><strong>Today</strong> — <a href="${DISCORD_INVITE_URL}" style="color:#5865F2;font-weight:700;text-decoration:none;border-bottom:2px solid #5865F2;">Join the private Vanguard Discord →</a></p>` : ''}
    <p style="margin:0 0 10px;font-size:14px;color:#444;padding-left:14px;border-left:3px solid #ff6b35;"><strong>+2 weeks</strong> — first Vanguards-only build update from me</p>
    <p style="margin:0 0 10px;font-size:14px;color:#444;padding-left:14px;border-left:3px solid #ff6b35;"><strong>Launch -14d</strong> — Google Play closed-testing invite (before public)</p>
    <p style="margin:0 0 10px;font-size:14px;color:#444;padding-left:14px;border-left:3px solid #39e08a;"><strong>Launch day (Q3 2026)</strong> — Legend tier auto-activates for 30 days FREE</p>
    <p style="margin:0 0 24px;font-size:14px;color:#444;padding-left:14px;border-left:3px solid #999;"><strong>Launch +30 days</strong> — drops back to Free tier (no auto-charge). Continue at $19.99/mo only if you choose.</p>
  </div>
  <div style="padding:0 32px 8px;">
    <p style="margin:0 0 8px;font-size:14px;color:#666;">Your Vanguard page:</p>
    <p style="margin:0 0 24px;"><a href="${upsellUrl}" style="display:inline-block;color:#0a0b0d;font-size:15px;font-weight:600;text-decoration:none;border-bottom:2px solid #39e08a;padding:2px 0;">atleato.com/upsell →</a></p>
  </div>
  <div style="padding:0 32px 0;">
    <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Just hit reply if you have any questions. I read every message.</p>
    <p style="margin:0 0 4px;font-size:16px;color:#1a1a1a;">— Rahul</p>
    <p style="margin:0 0 24px;font-size:14px;color:#888;">Founder, Atleato</p>
  </div>
  <div style="padding:0 32px 32px;">
    <div style="padding:16px 18px;background:#faf8f5;border-radius:8px;border-left:3px solid #ddd;">
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6;"><strong style="color:#0a0b0d;">P.S.</strong> — Refundable anytime before launch via Lemon Squeezy. Just reply with "refund" — no questions.</p>
    </div>
  </div>
  <div style="padding:24px 32px;border-top:1px solid #eee;background:#fafafa;">
    <p style="margin:0;font-size:12px;color:#999;line-height:1.6;">Payment processed by Lemon Squeezy on behalf of Atleato. Coach personas are fictional AI characters. <a href="mailto:${REPLY_TO}" style="color:#999;">${REPLY_TO}</a></p>
  </div>
</div>
</body></html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [opts.email],
      reply_to: REPLY_TO,
      subject: `Pass #${passStr} confirmed — welcome, Vanguard`,
      text: plain,
      html,
      headers: {
        'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `atleato-vanguard-${opts.orderNumber}`,
      },
      tags: [
        { name: 'category', value: 'vanguard_confirmation' },
        { name: 'list_id', value: 'atleato_vanguards' },
      ],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error('Resend vanguard email failed:', resp.status, err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') || '';
  const eventName = req.headers.get('x-event-name') || '';

  // ── 1. Verify signature (FAIL-CLOSED) ──
  // If the secret is missing in production we reject every request rather
  // than silently accepting unsigned POSTs. Set LEMONSQUEEZY_ALLOW_UNSIGNED=1
  // (and ONLY in dev/staging) to opt into the legacy bypass.
  if (!LS_SECRET && !ALLOW_UNSIGNED) {
    console.error('LEMONSQUEEZY_WEBHOOK_SECRET not configured — rejecting webhook');
    return new Response(JSON.stringify({ error: 'webhook misconfigured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  if (LS_SECRET) {
    const valid = await verifySignature(rawBody, signature, LS_SECRET);
    if (!valid) {
      console.warn('Invalid signature:', { eventName, sig: signature.slice(0, 16) });
      return new Response(JSON.stringify({ error: 'invalid signature' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } else {
    console.warn('LEMONSQUEEZY_ALLOW_UNSIGNED=1 — accepting unsigned webhook (DEV ONLY)');
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return new Response('invalid json', { status: 400, headers: corsHeaders }); }

  // ── 1b. Replay-window check ──
  // LS payloads include `data.attributes.created_at` (ISO 8601). A valid
  // captured webhook replayed weeks later will fall outside the window and
  // be rejected before we touch any DB row.
  const createdAtIso = payload?.data?.attributes?.created_at;
  if (createdAtIso) {
    const ts = Date.parse(createdAtIso);
    if (Number.isFinite(ts) && Date.now() - ts > REPLAY_WINDOW_MS) {
      console.warn('Stale webhook rejected:', { eventName, createdAtIso });
      return new Response(JSON.stringify({ error: 'stale webhook outside replay window' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── 2. Extract order fields ──
  const attrs = payload?.data?.attributes || {};
  const orderId = String(payload?.data?.id || '');
  const orderNumber = String(attrs.order_number || orderId);
  const email = String(attrs.user_email || attrs.customer_email || '').toLowerCase().trim();
  const customerName = String(attrs.user_name || attrs.customer_name || '');
  const customerId = String(attrs.customer_id || '');
  const productId = String(attrs.first_order_item?.product_id || attrs.product_id || '');
  const variantId = String(attrs.first_order_item?.variant_id || attrs.variant_id || '');
  const totalCents = Number(attrs.total || 0);
  const currency = String(attrs.currency || 'USD');
  const status = String(attrs.status || '').toLowerCase();
  const testMode = Boolean(attrs.test_mode);
  const refundedAt = attrs.refunded_at || null;

  console.log(`[ls-webhook] ${eventName} order=${orderId} email=${email} status=${status} test=${testMode}`);

  if (!orderId || !email) {
    return new Response(JSON.stringify({ error: 'missing order id or email' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // ── 3. Branch by event ──
  if (eventName === 'order_created' && status === 'paid') {
    // Product gate — only paid orders of the Vanguard product mint a pass.
    // Without this, any future LS product on this store (a t-shirt, an
    // add-on, etc.) would silently grant pass numbers and confirmation emails.
    if (ALLOWED_PRODUCT_IDS.length > 0 && !ALLOWED_PRODUCT_IDS.includes(productId)) {
      console.log(`[ls-webhook] non-vanguard product ${productId} ignored (order=${orderId})`);
      // Still record the order for audit, but mark as 'ignored' and skip pass logic
      await supabase.from('vanguard_orders').insert({
        ls_order_id: orderId,
        ls_order_number: orderNumber,
        ls_event: eventName,
        ls_customer_id: customerId,
        email,
        customer_name: customerName,
        product_id: productId,
        variant_id: variantId,
        total_cents: totalCents,
        currency,
        status: 'ignored_other_product',
        test_mode: testMode,
        pass_no: null,
        raw_payload: payload,
      }).then(({ error }) => {
        if (error && !String(error.message).includes('duplicate')) {
          console.error('ignored-order insert error:', error);
        }
      });
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'non-vanguard product' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Assign pass # atomically via RPC
    const { data: passData, error: passErr } = await supabase
      .rpc('assign_next_vanguard_pass_no');
    if (passErr) console.error('pass_no RPC error:', passErr);
    const passNo: number | null = (passData as any) ?? null;

    // Insert order ledger row (idempotent on ls_order_id)
    const { error: insErr } = await supabase
      .from('vanguard_orders')
      .insert({
        ls_order_id: orderId,
        ls_order_number: orderNumber,
        ls_event: eventName,
        ls_customer_id: customerId,
        email,
        customer_name: customerName,
        product_id: productId,
        variant_id: variantId,
        total_cents: totalCents,
        currency,
        status: 'paid',
        test_mode: testMode,
        pass_no: passNo,
        raw_payload: payload,
      });
    if (insErr) {
      // If duplicate (idempotency), it's fine
      if (!String(insErr.message).includes('duplicate')) {
        console.error('order insert error:', insErr);
      } else {
        console.log(`[ls-webhook] duplicate order ${orderId} — already processed`);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Flip waitlist row → vanguard, store pass #
    if (passNo) {
      const { error: updErr } = await supabase
        .from('waitlist')
        .update({ is_vanguard: true, vanguard_pass_no: passNo, vanguard_at: new Date().toISOString() })
        .ilike('email', email);
      if (updErr) console.error('waitlist vanguard flip error:', updErr);
    }

    // Send confirmation email (real test_mode purchases get it too)
    if (passNo) {
      try {
        await sendVanguardConfirmedEmail({
          email,
          name: guessName(email),
          passNo,
          badge: badgeName(email),
          orderNumber,
          totalFormatted: `${(totalCents / 100).toFixed(2)} ${currency}`,
        });
      } catch (e) {
        console.error('confirmation email error:', e);
      }
    }

    return new Response(JSON.stringify({ ok: true, pass_no: passNo, order_id: orderId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (eventName === 'order_refunded') {
    const { error } = await supabase
      .from('vanguard_orders')
      .update({ status: 'refunded', refunded_at: refundedAt || new Date().toISOString() })
      .eq('ls_order_id', orderId);
    if (error) console.error('refund update error:', error);
    // NOTE: we do NOT free the pass_no — they had it for a moment, audit trail matters.
    return new Response(JSON.stringify({ ok: true, refunded: true, order_id: orderId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Unhandled event types — accept and log so LS doesn't retry forever
  console.log(`[ls-webhook] unhandled event '${eventName}' — accepted but not processed`);
  return new Response(JSON.stringify({ ok: true, handled: false, event: eventName }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
