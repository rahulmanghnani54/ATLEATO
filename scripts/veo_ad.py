#!/usr/bin/env python3
"""
Evulto — "The Coach That Calls" — Veo 3 ad generator.

Generates the 6 × 8s scenes as MP4s using the Google Gemini API (Veo 3).

SECURITY: the API key is read from the GEMINI_API_KEY environment variable.
Never hard-code it here and never paste it into chat.

Setup:
    pip install google-genai
    # Windows PowerShell:   $env:GEMINI_API_KEY = "your-key"
    # macOS/Linux/WSL:      export GEMINI_API_KEY="your-key"
Run:
    python scripts/veo_ad.py            # all 6 scenes
    python scripts/veo_ad.py 1 3        # only scenes 1 and 3

Notes:
- Veo 3 is a PAID, long-running model. ~8s per clip; expect a few minutes each.
- Model name + aspect ratio support change over time — verify against the
  current Veo docs in AI Studio if a call 400s.
"""
import os
import sys
import time

try:
    from google import genai
    from google.genai import types
except ImportError:
    sys.exit("Missing dependency. Run:  pip install google-genai")

def _load_dotenv() -> None:
    """Load GEMINI_API_KEY from a local .env (scripts/.env or repo-root .env)
    WITHOUT printing it — keeps the key out of shell history and chat."""
    here = os.path.dirname(os.path.abspath(__file__))
    for path in (os.path.join(here, ".env"), os.path.join(here, "gemini.env"),
                 os.path.join(here, "..", ".env")):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()
API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not API_KEY:
    sys.exit("No key found. Create scripts/.env with one line:  GEMINI_API_KEY=your-key")

MODEL = "veo-3.0-generate-001"   # or "veo-3.0-fast-generate-001" (cheaper/faster)
ASPECT = "9:16"                  # vertical for Reels/TikTok/Shorts; use "16:9" for YouTube
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "ad_out")

# Shared look/character block prepended to every scene for consistency.
STYLE = (
    "Photorealistic, shot on a Sony FX3, 35mm lens, shallow depth of field, "
    "natural light, grounded documentary realism, NOT a glossy commercial. "
    "Character: Dev, a 27-year-old man, lean but slightly soft build, warm brown "
    "skin, short black hair, light stubble, tired expressive eyes, wearing a "
    "charcoal-grey t-shirt and black gym shorts. Phone app UI is dark with a bold "
    "lime-green accent labeled Evulto. No on-screen captions, no subtitles, no "
    "watermark, no warped text. "
)

SCENES = [
    # 1 — THE RING (hook)
    "Dark bedroom just before dawn, blue light. Dev is asleep, face in the pillow. "
    "His phone on the nightstand lights up and RINGS like a real incoming phone "
    "call, full-screen showing a coach avatar and the word Calling in lime-green. "
    "He stirs, groggy, squinting, confused it's a real call not an alarm. Handheld "
    "slow push-in. Audio: loud phone ringtone, faint morning birds; Dev mumbles, "
    "'who's calling me at 6 a.m.?'",

    # 2 — NO SNOOZE
    "Dev answers and puts the phone to his ear, half sitting up in bed, annoyance "
    "turning into a reluctant smile. Close-up, soft window light. Audio: a deep, "
    "warm, firm coach voice through the phone speaker: 'No snooze button on me, "
    "Dev. Leg day's waiting, up.' Dev laughs: 'Alright, alright, I'm up.'",

    # 3 — FORM CHECK (product moment)
    "Bright home gym. Phone propped on a tripod facing Dev as he does a barbell "
    "squat. On the phone screen a live lime-green skeleton overlay tracks his "
    "joints and a banner reads FORM knees caving in. He adjusts, pushes his knees "
    "out, nails the next rep. Side angle, crisp focus. Audio: barbell plates "
    "clinking; coach voice from phone: 'Knees out, there it is, perfect rep.'",

    # 4 — FIVE COACHES
    "Dev sits on a gym bench tapping his phone, swiping between coach profiles. The "
    "entire app recolors as he swipes, lime-green then orange then electric blue, "
    "each a different coach avatar and vibe. He smirks and picks one. "
    "Over-the-shoulder, screen clearly visible, shallow focus. Audio: soft UI tap "
    "and whoosh sounds; Dev intrigued: 'Five coaches, and the whole app changes.'",

    # 5 — REST DAY (twist)
    "Sunday afternoon, warm light. Dev relaxes on his couch with coffee, at ease. "
    "His phone is face-up on the table, silent, screen dark, no calls, no buzzing. "
    "He glances at it then leans back content. Calm cozy slow handheld drift. "
    "Audio: quiet room tone, a clock ticking, NO phone sounds; calm coach voiceover: "
    "'Rest day. Recover. I'll call you tomorrow.'",

    # 6 — LOGO + CTA
    "Clean product shot: a black phone held up, screen showing the Evulto "
    "incoming-call screen glowing lime-green against a dark background, phone "
    "rotating subtly, then resolving to the Evulto wordmark in lime-green on "
    "near-black. Premium, minimal, confident. Audio: one short ringtone sting, "
    "then a deep confident voiceover: 'Evulto. Your coach actually calls.'",
]


def generate(idx: int, prompt: str, client: "genai.Client") -> None:
    label = f"scene{idx}"
    print(f"[{label}] submitting…")
    op = client.models.generate_videos(
        model=MODEL,
        prompt=STYLE + prompt,
        config=types.GenerateVideosConfig(aspect_ratio=ASPECT, number_of_videos=1),
    )
    while not op.done:
        time.sleep(10)
        print(f"[{label}] rendering…")
        op = client.operations.get(op)

    if not getattr(op, "response", None) or not op.response.generated_videos:
        print(f"[{label}] FAILED — no video returned: {op}")
        return
    vid = op.response.generated_videos[0]
    client.files.download(file=vid.video)
    out = os.path.join(OUT_DIR, f"atleato_{label}.mp4")
    vid.video.save(out)
    print(f"[{label}] saved -> {out}")


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    client = genai.Client(api_key=API_KEY)
    wanted = [int(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else list(range(1, len(SCENES) + 1))
    for i in wanted:
        if 1 <= i <= len(SCENES):
            generate(i, SCENES[i - 1], client)
    print("Done. Clips are in:", os.path.abspath(OUT_DIR))


if __name__ == "__main__":
    main()
