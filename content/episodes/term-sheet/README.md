# The Term Sheet (Season 1, 5 episodes × 60s)

Demo-night series for Saturday 19 Sep 2026 — "Bringing SF to Berlin II" (Almedia, Koppenstraße 8). 3-minute live slot among ~20 builders. In-world branding is generic: **DEMO NIGHT · BERLIN**. Do not put Almedia / M&M / Freecash on screen unless hosts approve.

Continuation of **Not In The Plan**: Nora (INTP) quit because she solved the job. Marcus (INTJ) had a blank page 48 in his five-year binder. She built an AI-drama company. He became an angel. They meet again in a dark room that looks exactly like the one we are standing in.

Logline: She has three minutes. He has a term sheet. Page 48 is no longer blank.

## Why this show is the demo

The product *is* the acquisition loop Pocket FM described:

1. 60s of story, hook every ~5s, cut on a cliffhanger.
2. The unfinished episode is the ad. The QR is the download.
3. Episodes 3–5 exist only on the site. If this room needs to know, every room will.

Nora pitches that machine in episode 1, in character. You name the company in the live 40s. The audience is inside the mechanic before you explain it.

## Cast

Anchor by look + voice in every video prompt. Cool wardrobe is the working assumption pending your pick.

- **Nora (INTP):** woman with a purple ponytail and rectangular glasses. Voice: calm, dry, curious, unhurried female. Working look: street (black cropped jacket, purple top, cargos, headphones, chunky sneakers).
- **Marcus (INTJ):** man with swept-back purple hair and a purple mustache. Voice: flat, clipped, calculating male. Working look: founder (long purple coat, black turtleneck, watch).

Two-hander only. Couple/relationship tension is what the account's data says wins. Julian (ENTP) is a text in ep 5, not a face — that seeds **Dilution** (S2) without breaking the pair.

## Saturday rundown (3:00)

| Time | What |
| --- | --- |
| 0:00–0:20 | You, live. Do not pitch features. Plant the frame. |
| 0:20–1:20 | Episode 1 on screen. Phone brightness up, sound on, captions on. |
| 1:20–1:25 | You: "Part two." |
| 1:25–2:25 | Episode 2. Hard stop on "I'm not asking a question. I'm making an offer." |
| 2:25–3:00 | QR slide. "SCAN TO CONTINUE." Say the 40s. Walk off. |

Do not play episodes 3–5 in the room. That would spend the cliffhanger.

### Live 20s (before ep 1)

"I'm building Typedramas. Tiny dramas, huge personalities. The plot engine is type. What you're about to watch was made this week, for about the price of the coffee in this room, and it takes place at a demo night. Like this one."

### Live 40s (after ep 2, over the QR)

"That cut is the business. Pocket FM took audio dramas from zero to five hundred million by cutting the story at the moment you cannot leave. We do it in sixty seconds. Vertical. Typed. AI-produced for a few dollars an episode. Three through five are not in this room. Scan this. If this room needs to know what happens, every room will."

End card on ep 2 (last 3s, also the QR slide): `PART 3 IS NOT IN THIS ROOM` / `SCAN TO CONTINUE`.

## Arc

| Ep | Title | Where | Turn | Cliff |
| --- | --- | --- | --- | --- |
| 1 | The Pitch | Demo stage | She describes the machine. A voice from the dark already knows it. | "Sit down. I'm not here for the pitch." |
| 2 | The Offer | Hallway after | He has a check. She has a company with no bank. | "I'm not asking a question. I'm making an offer." **LIVE STOP** |
| 3 | The Last Line | Her floor, then his office | Buried cofounder-appointment clause. | "I priced it. Sign it tomorrow." |
| 4 | Page 48 | His office, the binder | The blank page now reads RETURNS. She picks up the red pen. | "Don't sleep on the clause." |
| 5 | Partners | Morning, same office | She deletes the leash. He writes PARTNER. | Text from J: already filed in Delaware. |

Season 2 (**Dilution**) is original founder-betrayal, not a renamed movie. Julian re-papers the cap table. Do not produce it before demo night.

## Format

4 clips × 15s per episode. `minimax/h3-max-turbo` image-to-video, 1080P, audio on.

- Hook in the first 5s of clip 1.
- Every clip ends on a mini-turn.
- Clip 4 ends on a cliffhanger.
- Dialogue floor ≈ 2.5 words/sec + 3s headroom (~25–32 spoken words per clip).
- No caps, no ellipses inside quoted lines.
- First prompt line always: `Keep the characters and setting exactly as in the image. Static camera.`
- Last prompt line: concrete ambience + `no music, no subtitles.`
- `no other voices` guard on every clip.
- Title in clip-1 image prompt only: `THE TERM SHEET - PART N` (short, all-caps). If the model garbles it, overlay in post.

Frames: `openai/gpt-image-2.5/flare/edit`, 1080×1920, quality xhigh. Anchor clips 2–4 on approved frame-1. Refs: `_types/intp.png` + `_types/intj.png` + `car-lost/frame.png` style + the two chosen cool wardrobe stills.

`episode.mjs` still hardcodes ENFJ/ENTJ refs — patch before `--frames`, do not run against this folder until then.

## Pocket FM → Typedramas (the actual company)

This Saturday is Gate 0 of the company, not just Gate 0 of a season.

| Pocket FM | Typedramas |
| --- | --- |
| 90s trailer of an audio drama as the ad | 60s vertical episode as the ad |
| Cliffhanger forces the download | Cliffhanger forces the QR / site / follow |
| Optimize for CTR (2% → 2.25% ≈ −30% CAC) | Same: hook every 5s, kill trailers that don't hold 3s |
| 8–12 min chapters, daily free episode, pay to binge | 60s chapters, Part N+1 tomorrow, pay/ads to not wait |
| Localization > translation | Type-true stories rewritten per culture, not dubbed |
| AI production unlocked 100× hours | ~$3–4 and ~15 min per 60s episode, then volume |
| Pocket Saga = same shows as vertical video | We start at video. Audio/localization are later S-curves |
| Own supply and demand | We own the catalog *and* the audience (@shortmbtistories → typedramas.com) |

What we are not building this week: an app, a paywall, 17k ads/month, or a writer network. We are building one show that proves the loop in a room of 240 people who fund and build companies.

After Saturday, the only metric that matters is: did they scan, and did they finish episode 5.

## Production gates (do not skip)

1. **Paper (this folder).** You review all 5 scripts. Red-pen lines, not vibes.
2. **Looks.** Pick Nora + Marcus from the four cool stills. Recommended: Nora-street + Marcus-founder.
3. **Look-dev.** One approved frame-1 for ep 1. Then the other three frames. Then ep 1 clips one at a time, audio-verified (ffmpeg volumedetect + whisper vs script) before stitch.
4. **Episode 1 human review.** Then episode 2. Then 3–5.
5. **Site.** Pin the series. QR on ep 2 end card. Deploy mbtishorts. Domain if bought.
6. **Live run-through.** Phone + backup file + QR that actually opens part 3.

Every retake is per-clip (~$0.50). Never regenerate a whole episode.

## Files

- `ep1-the-pitch.md`
- `ep2-the-offer.md`
- `ep3-the-last-line.md`
- `ep4-page-48.md`
- `ep5-partners.md`
