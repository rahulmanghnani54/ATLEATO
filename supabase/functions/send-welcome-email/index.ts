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

YOU'RE IN.

Your spot to train under a legend is locked. You're spot #${position.toLocaleString()} on the waitlist — and pass #${String(passNo).padStart(4,'0')} of the first 500 ever issued.

Your identity: ${badge}
Permanently yours · 1 of 500 ever created

— This is how training starts —

Your coach calls. Not a notification you can swipe away — an actual incoming call. Decline, and your coach rings back in 5 minutes. No excuses.

Your 5 legend coaches:
- The Sculptor — Classic Physique · 5x Champion
- The Governor — Golden Era · 7x Mr. O
- The Scientist — Evidence-Based · PubMed
- The Commander — Iron Asylum · No Excuses
- Dr. Growth — Hypertrophy Science · MEV/MAV/MRV

Start in 60 seconds:
1. Pick a coach — the whole app transforms around their philosophy
2. Set your wake-up — tomorrow your phone rings like a real call
3. Train. Eat. Conquer.

Don't lose your spot. Vanguard passes are first-come — confirm yours and lock in lifetime Pro pricing.

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

// HTML version — replicates docs/welcome-email.html with server-side personalization
function generateHTML(name: string, email: string, position: number, badge: string, passNo: number, upsellUrl: string, hostedUrl: string): string {
  const safeName = escapeHtml(name);
  const safePass = String(passNo).padStart(4,'0');
  const safePos = position.toLocaleString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Atleato — You're In.</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Semi+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  :root{--bg:#070809;--page:#040506;--surface:#101216;--surface-2:#16191f;--line:rgba(255,255,255,.09);--line-strong:rgba(255,255,255,.16);--ink:#f5f6f3;--muted:#8b909a;--muted-2:#5d626b;--accent:#d4ff3d;--accent-ink:#0a0b0d;--accent-glow:rgba(212,255,61,.35);--danger:#ff3b30;--gold:#f4b53a;--ice:#3bd6ff;--violet:#b06bff;--grad:radial-gradient(120% 80% at 50% -10%,rgba(212,255,61,.10) 0%,rgba(212,255,61,0) 55%);}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{background:var(--page);color:var(--ink);font-family:"Barlow",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;background-image:radial-gradient(60% 50% at 50% 0%,rgba(212,255,61,.06),transparent 70%);}
  .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;font-size:1px;line-height:1px;}
  .browserbar{text-align:center;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;color:var(--muted-2);text-transform:uppercase;padding:18px 16px 6px;}
  .browserbar a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent);padding-bottom:1px;}
  .wrap{max-width:640px;margin:0 auto;padding:14px 14px 60px;}
  .email{background:var(--bg);border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 40px 120px -40px rgba(0,0,0,.9);background-image:var(--grad);}
  .mast{display:flex;align-items:center;justify-content:space-between;padding:22px 34px;border-bottom:1px solid var(--line);}
  .word{font-family:"Anton",sans-serif;font-size:23px;letter-spacing:.12em;color:var(--ink);text-transform:uppercase;display:flex;align-items:center;gap:2px;}
  .word sup{font-size:10px;color:var(--accent);top:-.9em;}
  .word .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 14px var(--accent-glow);margin-right:10px;display:inline-block;}
  .mast .tagchip{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.16em;color:var(--muted);text-transform:uppercase;border:1px solid var(--line);border-radius:999px;padding:6px 11px;}
  .hero{padding:46px 34px 30px;position:relative;text-align:center;}
  .kicker{display:inline-flex;align-items:center;gap:9px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);border:1px solid rgba(212,255,61,.3);border-radius:999px;padding:7px 14px;background:rgba(212,255,61,.05);}
  .live{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 var(--accent-glow);display:inline-block;animation:pulseGlow 2s ease-out infinite;}
  h1.big{font-family:"Anton",sans-serif;font-weight:400;text-transform:uppercase;font-size:clamp(64px,16vw,116px);line-height:.86;letter-spacing:.01em;margin:22px 0 0;color:var(--ink);}
  h1.big .stroke{color:transparent;-webkit-text-stroke:2px var(--accent);text-shadow:0 0 38px var(--accent-glow);}
  .lead{max-width:430px;margin:20px auto 0;color:#c4c8cd;font-size:17.5px;font-weight:500;}
  .lead b{color:var(--ink);font-weight:800;}
  .marquee{margin-top:30px;overflow:hidden;border-top:1px solid var(--line);border-bottom:1px solid var(--line);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);}
  .marquee .track{display:flex;gap:34px;width:max-content;padding:13px 0;animation:slide 22s linear infinite;}
  .marquee span{font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;text-transform:uppercase;font-size:14px;letter-spacing:.13em;color:var(--muted);display:flex;align-items:center;gap:34px;white-space:nowrap;}
  .marquee span::after{content:"";width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:.7;}
  .ticket-sec{padding:34px 34px 8px;}
  .ticket{position:relative;border:1px solid var(--line-strong);border-radius:18px;overflow:hidden;background:linear-gradient(135deg,rgba(212,255,61,.10),rgba(212,255,61,0) 40%),var(--surface);}
  .ticket::before{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.14) 48%,transparent 64%);transform:translateX(-120%);animation:sweep 4.6s ease-in-out infinite;}
  .ticket .row{display:flex;align-items:stretch;position:relative;z-index:1;}
  .ticket .stub{flex:0 0 96px;border-right:2px dashed var(--line-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:22px 10px;background:rgba(212,255,61,.04);}
  .ticket .stub .barcode{display:flex;gap:2px;height:54px;align-items:stretch;}
  .ticket .stub .barcode i{width:2px;background:var(--accent);opacity:.85;display:block;border-radius:1px;}
  .ticket .stub small{font-family:"JetBrains Mono",monospace;font-size:8.5px;letter-spacing:.14em;color:var(--muted);text-transform:uppercase;}
  .ticket .body{flex:1;padding:22px 22px 22px 24px;}
  .ticket .label{font-family:"JetBrains Mono",monospace;font-size:10px;letter-spacing:.22em;color:var(--accent);text-transform:uppercase;}
  .ticket .ttl{font-family:"Anton",sans-serif;font-size:30px;line-height:1;letter-spacing:.02em;text-transform:uppercase;margin:9px 0 2px;}
  .ticket .meta{display:flex;gap:26px;margin-top:16px;flex-wrap:wrap;padding:0;}
  .ticket .meta div{min-width:64px;}
  .ticket .meta dt{font-family:"JetBrains Mono",monospace;font-size:9px;letter-spacing:.16em;color:var(--muted-2);text-transform:uppercase;margin-bottom:4px;}
  .ticket .meta dd{margin:0;font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;font-size:18px;color:var(--ink);}
  .ticket .meta dd .of{color:var(--muted);font-weight:600;font-size:13px;}
  .call-sec{padding:42px 34px 8px;text-align:center;}
  .seclabel{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);}
  .sechead{font-family:"Anton",sans-serif;font-size:clamp(32px,7vw,46px);line-height:.95;text-transform:uppercase;letter-spacing:.01em;margin:13px 0 0;}
  .sechead .accent{color:var(--accent);}
  .call{margin:28px auto 0;max-width:360px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,var(--surface-2),var(--surface));padding:28px 26px 24px;position:relative;}
  .ring-wrap{position:relative;width:104px;height:104px;margin:4px auto 0;}
  .ring{position:absolute;inset:0;border-radius:50%;border:2px solid var(--accent);opacity:0;animation:ring 2.6s ease-out infinite;}
  .ring:nth-child(2){animation-delay:.8s;}
  .ring:nth-child(3){animation-delay:1.6s;}
  .avatar{position:absolute;inset:14px;border-radius:50%;background:linear-gradient(150deg,#23272e,#0e1014);border:1px solid var(--line-strong);display:flex;align-items:center;justify-content:center;font-family:"Anton",sans-serif;font-size:30px;color:var(--ink);}
  .avatar .badge{position:absolute;bottom:-2px;right:-2px;width:26px;height:26px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;border:3px solid var(--surface);animation:shake 1.2s ease-in-out infinite;}
  .avatar .badge svg{width:13px;height:13px;}
  .call .who{font-family:"Anton",sans-serif;font-size:24px;text-transform:uppercase;margin:18px 0 2px;letter-spacing:.02em;}
  .call .status{font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;color:var(--accent);text-transform:uppercase;}
  .call .status .pulse{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);margin-right:6px;vertical-align:middle;animation:blink 1s steps(2) infinite;}
  .call .btns{display:flex;gap:12px;margin-top:22px;}
  .call .btns a{flex:1;text-decoration:none;border-radius:13px;padding:13px 0;font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:14px;text-align:center;}
  .call .decline{background:rgba(255,59,48,.12);color:#ff756d;border:1px solid rgba(255,59,48,.35);}
  .call .accept{background:var(--accent);color:var(--accent-ink);box-shadow:0 12px 30px -10px var(--accent-glow);}
  .call-cap{max-width:380px;margin:20px auto 0;color:var(--muted);font-size:15px;font-weight:500;}
  .call-cap b{color:var(--ink);font-weight:800;}
  .coaches-sec{padding:46px 34px 10px;}
  .coaches-head{text-align:center;margin-bottom:24px;}
  .cgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .coach{border:1px solid var(--line);border-radius:15px;background:var(--surface);padding:15px 16px;display:flex;gap:13px;align-items:center;position:relative;overflow:hidden;}
  .coach::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c);}
  .coach .ini{flex:0 0 46px;height:46px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-family:"Anton",sans-serif;font-size:18px;color:#0a0b0d;background:var(--c);box-shadow:0 8px 22px -8px var(--c);}
  .coach .info{min-width:0;flex:1;display:flex;flex-direction:column;justify-content:center;}
  .coach .nm{font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;text-transform:uppercase;font-size:15px;letter-spacing:.02em;line-height:1.15;white-space:nowrap;}
  .coach .tg{font-size:12px;color:var(--muted);font-weight:500;margin-top:3px;line-height:1.25;}
  .coach.span2{grid-column:1 / -1;}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:15px;overflow:hidden;margin:30px 34px 0;}
  .stat{background:var(--bg);padding:20px 12px;text-align:center;}
  .stat .num{font-family:"Anton",sans-serif;font-size:32px;color:var(--accent);line-height:1;letter-spacing:.01em;}
  .stat .lbl{font-family:"JetBrains Mono",monospace;font-size:9.5px;letter-spacing:.13em;color:var(--muted);text-transform:uppercase;margin-top:8px;}
  .steps-sec{padding:48px 34px 10px;}
  .step{display:flex;gap:18px;padding:20px 0;border-top:1px solid var(--line);align-items:flex-start;}
  .step:first-of-type{border-top:none;}
  .step .no{font-family:"Anton",sans-serif;font-size:34px;color:transparent;-webkit-text-stroke:1.5px var(--line-strong);line-height:1;flex:0 0 auto;width:54px;}
  .step h3{font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;text-transform:uppercase;font-size:19px;margin:2px 0 5px;letter-spacing:.02em;}
  .step p{margin:0;color:var(--muted);font-size:14.5px;font-weight:500;}
  .step p b{color:#c4c8cd;font-weight:700;}
  .cta-sec{padding:44px 34px 50px;text-align:center;}
  .cta-card{border:1px solid rgba(212,255,61,.25);border-radius:20px;padding:38px 26px;position:relative;overflow:hidden;background:radial-gradient(90% 120% at 50% 0%,rgba(212,255,61,.10),transparent 60%),var(--surface);}
  .cta-card h2{font-family:"Anton",sans-serif;font-size:clamp(30px,7vw,42px);line-height:.95;text-transform:uppercase;margin:0 0 12px;}
  .cta-card p{color:var(--muted);font-size:15px;font-weight:500;margin:0 auto 24px;max-width:340px;}
  .btn{display:inline-block;text-decoration:none;background:var(--accent);color:var(--accent-ink);white-space:nowrap;font-family:"Barlow Semi Condensed",sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:.05em;font-size:18px;padding:17px 36px;border-radius:14px;box-shadow:0 16px 40px -12px var(--accent-glow);}
  .cta-fine{font-family:"JetBrains Mono",monospace;font-size:10.5px;letter-spacing:.1em;color:var(--muted-2);text-transform:uppercase;margin-top:18px;}
  .playrow{display:inline-flex;align-items:center;gap:8px;margin-top:16px;color:var(--muted);font-size:12.5px;font-weight:600;}
  .playrow svg{width:16px;height:16px;}
  .foot{border-top:1px solid var(--line);padding:30px 34px 34px;text-align:center;}
  .foot .fword{font-family:"Anton",sans-serif;font-size:18px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;}
  .foot .links{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:12px;font-weight:600;color:var(--muted);}
  .foot .links a{color:var(--muted);text-decoration:none;}
  .foot .links span{color:var(--muted-2);}
  .foot .fine{color:var(--muted-2);font-size:11px;margin-top:16px;line-height:1.6;max-width:440px;margin-left:auto;margin-right:auto;}
  .foot .fine a{color:var(--muted);}
  @keyframes slide{to{transform:translateX(-50%);}}
  @keyframes sweep{0%{transform:translateX(-120%);}55%,100%{transform:translateX(120%);}}
  @keyframes ring{0%{transform:scale(.62);opacity:.9;}80%{opacity:0;}100%{transform:scale(1.25);opacity:0;}}
  @keyframes shake{0%,100%{transform:rotate(0);}20%{transform:rotate(-16deg);}40%{transform:rotate(13deg);}60%{transform:rotate(-9deg);}80%{transform:rotate(6deg);}}
  @keyframes blink{50%{opacity:.25;}}
  @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 var(--accent-glow);}50%{box-shadow:0 0 0 7px rgba(212,255,61,0);}}
  @media(max-width:520px){.mast{padding:20px 22px;}.mast .tagchip{display:none;}.hero{padding:38px 22px 26px;}.ticket-sec{padding:30px 22px 4px;}.call-sec{padding:38px 22px 4px;}.coaches-sec{padding:40px 22px 6px;}.cgrid{grid-template-columns:1fr;}.stats{margin:28px 22px 0;grid-template-columns:repeat(2,1fr);}.steps-sec{padding:42px 22px 6px;}.cta-sec{padding:40px 22px 44px;}.foot{padding:28px 22px 30px;}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;}.ticket::before{display:none;}}
</style>
</head>
<body>
  <div class="preheader">You're in. Your VIP Vanguard pass #${safePass} is reserved — train under a legend. No excuses.</div>
  <div class="browserbar">Trouble viewing? <a href="${hostedUrl}">Open animated version in browser ↗</a></div>
  <div class="wrap">
    <div class="email">
      <div class="mast">
        <div class="word"><span class="dot"></span>ATLEATO<sup>™</sup></div>
        <div class="tagchip">YOUR COACH CALLS</div>
      </div>
      <div class="hero">
        <div class="kicker"><span class="live"></span> VIP VANGUARD · ACCESS CONFIRMED</div>
        <h1 class="big">YOU'RE<br /><span class="stroke">IN.</span></h1>
        <p class="lead">Hey ${safeName}, your spot to <b>train under a legend</b> is locked. You're <b>spot #${safePos}</b> of the first <b>500</b> — before the world even gets a download link.</p>
        <div class="marquee">
          <div class="track">
            <span>The Sculptor</span><span>The Governor</span><span>The Scientist</span><span>The Commander</span><span>Dr. Growth</span>
            <span>The Sculptor</span><span>The Governor</span><span>The Scientist</span><span>The Commander</span><span>Dr. Growth</span>
          </div>
        </div>
      </div>
      <div class="ticket-sec">
        <div class="ticket">
          <div class="row">
            <div class="stub">
              <div class="barcode"><i style="width:3px"></i><i style="width:1px"></i><i style="width:2px"></i><i style="width:4px"></i><i style="width:1px"></i><i style="width:3px"></i><i style="width:1px"></i><i style="width:2px"></i><i style="width:3px"></i><i style="width:1px"></i><i style="width:4px"></i><i style="width:1px"></i><i style="width:2px"></i><i style="width:1px"></i><i style="width:3px"></i><i style="width:1px"></i><i style="width:2px"></i></div>
              <small>VANGUARD</small>
            </div>
            <div class="body">
              <div class="label">// VIP VANGUARD PASS</div>
              <div class="ttl">EARLY ACCESS</div>
              <dl class="meta">
                <div><dt>Pass No.</dt><dd>${safePass} <span class="of">/ 500</span></dd></div>
                <div><dt>Tier</dt><dd>Lifetime Pro</dd></div>
                <div><dt>Status</dt><dd style="color:var(--accent)">Active</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>
      <div class="call-sec">
        <div class="seclabel">// THIS IS HOW TRAINING STARTS</div>
        <h2 class="sechead">YOUR COACH<br /><span class="accent">CALLS.</span></h2>
        <div class="call">
          <div class="ring-wrap">
            <div class="ring"></div><div class="ring"></div><div class="ring"></div>
            <div class="avatar">CT
              <span class="badge"><svg viewBox="0 0 24 24" fill="#0a0b0d"><path d="M6.6 10.8a15.3 15.3 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.24 1z"/></svg></span>
            </div>
          </div>
          <div class="who">The Commander</div>
          <div class="status"><span class="pulse"></span>INCOMING CALL · 06:00 AM</div>
          <div class="btns">
            <a class="decline" href="${upsellUrl}">Snooze</a>
            <a class="accept" href="${upsellUrl}">Answer</a>
          </div>
        </div>
        <p class="call-cap">Not a notification you can swipe away — <b>an actual incoming call.</b> Decline, and your coach rings back in 5 minutes. No excuses.</p>
      </div>
      <div class="coaches-sec">
        <div class="coaches-head">
          <div class="seclabel">// YOUR LINEUP</div>
          <h2 class="sechead">5 LEGENDS. <span class="accent">1 APP.</span></h2>
        </div>
        <div class="cgrid">
          <div class="coach" style="--c:#d4ff3d"><div class="ini">TS</div><div class="info"><div class="nm">The Sculptor</div><div class="tg">Classic Physique · 5× Champion</div></div></div>
          <div class="coach" style="--c:#f4b53a"><div class="ini">TG</div><div class="info"><div class="nm">The Governor</div><div class="tg">Golden Era · 7× Mr. O</div></div></div>
          <div class="coach" style="--c:#3bd6ff"><div class="ini">SC</div><div class="info"><div class="nm">The Scientist</div><div class="tg">Evidence-Based · PubMed</div></div></div>
          <div class="coach" style="--c:#ff3b30"><div class="ini">CM</div><div class="info"><div class="nm">The Commander</div><div class="tg">Iron Asylum · No Excuses</div></div></div>
          <div class="coach span2" style="--c:#b06bff"><div class="ini">DG</div><div class="info"><div class="nm">Dr. Growth</div><div class="tg">Hypertrophy Science · MEV / MAV / MRV</div></div></div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="num">5</div><div class="lbl">Legend Coaches</div></div>
        <div class="stat"><div class="num">17</div><div class="lbl">Joints Tracked</div></div>
        <div class="stat"><div class="num">1.2M</div><div class="lbl">Foods DB</div></div>
        <div class="stat"><div class="num">24/7</div><div class="lbl">Wake-Up Calls</div></div>
      </div>
      <div class="steps-sec">
        <div class="coaches-head" style="text-align:left;margin-bottom:8px;">
          <div class="seclabel">// WHEN WE LAUNCH</div>
          <h2 class="sechead">START IN <span class="accent">60 SECONDS.</span></h2>
        </div>
        <div class="step"><div class="no">01</div><div><h3>Pick a coach</h3><p>The whole app <b>transforms</b> around their philosophy — colors, programs, nutrition, and voice.</p></div></div>
        <div class="step"><div class="no">02</div><div><h3>Set your wake-up</h3><p>Pick a time and a ringtone. Tomorrow your phone <b>rings like a real call.</b></p></div></div>
        <div class="step"><div class="no">03</div><div><h3>Train. Eat. Conquer.</h3><p>Live form check, global macro tracking, and <b>territory you claim</b> with every run.</p></div></div>
      </div>
      <div class="cta-sec">
        <div class="cta-card">
          <h2>DON'T LOSE<br />YOUR SPOT.</h2>
          <p>Vanguard passes are first-come. Confirm yours and lock in lifetime Pro pricing.</p>
          <a class="btn" href="${upsellUrl}">CONFIRM MY PASS →</a>
          <div class="cta-fine">FREE FOREVER · NO CREDIT CARD</div>
          <div class="playrow">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3l16 9-16 9zM5 6.5v11l9.8-5.5z"/></svg>
            Launching first on Google Play
          </div>
        </div>
      </div>
      <div class="foot">
        <div class="fword">ATLEATO™</div>
        <div class="links">
          <a href="https://atleato.com">atleato.com</a><span>·</span>
          <a href="${hostedUrl}">View in browser</a><span>·</span>
          <a href="https://atleato.com/privacy">Privacy</a><span>·</span>
          <a href="mailto:${REPLY_TO}?subject=unsubscribe">Unsubscribe</a>
        </div>
        <p class="fine">You're receiving this because you joined the Atleato waitlist. Your identity: ${badge}.<br />Coach personas are fictional AI characters and are not affiliated with any real individuals.<br />© 2026 Atleato™ · Just hit reply if you have any questions.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
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
