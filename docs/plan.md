# Tinnitus Notch — development plan

## Position

Notched sound therapy (TMNMT, Okamoto/Pantev 2010) is not a cure. Small early studies showed moderate
loudness reduction; the largest RCT (Stein et al. 2016, n≈100) found no significant difference from
placebo on the primary outcome. It works best for tonal tinnitus below ~8 kHz, and the strongest
success factor is an accurate frequency match. The app is positioned as non-commercial sound therapy
for relief, with no medical claims.

## Decisions

- Core method: continuous noise with an octave-wide band removed around the tinnitus frequency.
- Sound source: noise only for now (white / pink / brown, pink by default). User music files — later.
- Notch: width in octaves (0.25–1, default 1), depth ≥40 dB with steep edges.
  Implemented as frequency-domain synthesis (zeroed FFT bins + colour slope → inverse FFT → looped
  buffer), because a biquad cascade cannot reach ≥40 dB across a full octave without eating the
  neighbouring frequencies.
- One frequency for both ears; mono playback. Per-ear therapy — later.
- Desktop only for now; UI in English.
- Hard volume ceiling in code; therapy level hint: at or below tinnitus loudness, tinnitus stays audible.
- Data in localStorage with JSON export/import. Import merges sessions by id; settings are restored
  only into an empty history (new device).
- Sessions: 15 / 30 / 45 / 60 min timer, 30 by default. Loudness rating 0–10 before and after, both
  skippable. Sessions under a minute are not saved; a session cut off by closing the tab is saved
  with the time listened (checkpointed every 15 s).
- Screens are tabs: Therapy / Setup / History. The session owns the audio output: the matching tone
  is disabled while a session is active.
- Analytics (umami): anonymous events only (wizard step reached/abandoned, session start/finish with
  duration). No frequencies or ratings.
- Procedure logic lives in pure modules without Web Audio, covered by Vitest.

## Frequency auto-matching

1. Headphones required; calibration: user sets system volume so a 1 kHz reference tone is quiet but
   clear. All levels are relative to it.
2. Tinnitus type: tonal or hissing. Hissing → match with narrowband noise and warn that notch therapy
   is expected to be less effective.
3. Hearing check (optional, right after calibration): 0.5, 1, 2, 3, 4, 6, 8, 10, 12 kHz, each ear
   separately, three pulsed beeps per presentation with a yes/no answer. Simplified Hughson-Westlake:
   down 10 dB / up 5 dB (up 10 until the first response), threshold = two responses at one level on
   the way up, at most 14 presentations per frequency; each frequency starts 15 dB above the previous
   threshold. Thresholds are corrected by a rough normal-hearing curve; the largest rise ≥15 dB between
   neighbouring frequencies (either ear) is the edge, and its geometric middle the starting hypothesis.
   The hypothesis sets the first split of each run (on it, then ∓0.15 of the range); without one the
   default splits stay. The audiogram also equalises the sounds being compared (match, octave,
   fine-tune) to the same level above threshold as 1 kHz, better ear, within −15…+30 dB.
4. 2AFC: "which of A/B is closer to your tinnitus?", log-scale bisection over 500 Hz–12 kHz,
   8 trials per run (candidates are the centres of the two halves, 10% overlap past the split,
   "about the same" keeps the stretch between them; A/B order random). Three runs with different
   first splits, result = median; spread > ½ octave → "unreliable match".
5. Octave check: f vs 2f vs f/2.
6. Manual fine-tune slider. "I know my frequency" manual mode stays available.
7. Loudness match (optional): threshold at f, then tone as loud as the tinnitus; the difference
   (dB over threshold) is the objective diary metric.

Levels are in dB re the hard output ceiling, independent of the therapy volume; the 1 kHz
calibration tone plays at −30 dB. Matches are kept as a history (`matches` in localStorage and in the
backup, optional there so older backups still import); the latest one sets the therapy frequency.
The audiogram is kept with its match (optional field, absent in older matches).
8. Residual inhibition ("after-effect", optional, after the loudness match): 60 s of ½-octave noise at
   f, 10 dB above the loudness match (or 5 dB above the comparison level without one), adjustable while
   it plays; then silence. Answer: gone / quieter / no change / louder; after an effect a stopwatch
   from the end of the noise until "it's back" (capped at 5 min). No effect at f → gently offer to try
   f·2^±½; an alternative that shows an effect can be adopted as the therapy frequency. Never blocks
   therapy. Checks are kept with the match (`inhibition`, optional in older data and backups).

## Screens

Tabs: Therapy / Setup / Progress (opens on Setup until the first session is saved).

- **Setup** — the matching wizard (the only option on first run, with an "I know my frequency" way
  out; re-runnable) and its last result, plus manual matching (tone, log slider, octave/semitone
  steps, interactive spectrum). Wizard progress survives tab switches; a running session pauses it.
- **Therapy** — session timer, noise colour, notch width, volume, 0–10 rating before/after.
- **Progress** — therapy time stats; daily mean before/after ratings as a trend chart (from two
  rated days); frequency matches with loudness and after-effect, plus the latest hearing check;
  session list with export/import.

## Stages (one PR each)

1. ✅ Core fixes: log frequency scale, single volume scale, fades without clicks, octave notch,
   noise colours, volume ceiling, disclaimer. — PR #1, merged.
2. ✅ Therapy screen: timer, 0–10 diary, history, export/import. — PR #2, merged.
3. ✅ Matching wizard: calibration → type → 2AFC ×3 + octave check → fine-tune → loudness match.
   — PR #3, merged.
4. ✅ Hearing check → starting hypothesis, level equalisation, audiogram on the result.
   — PR #4, merged.
5. ✅ Residual inhibition + Progress screen. — PR #5, merged.

Each stage keeps its procedure logic in pure modules (`src/lib/…`) with Vitest, and is checked
end-to-end in a headless browser before the PR; sound itself is checked by ear.

## Open issues

- `tsc` fails on @kobalte/core typings in node_modules (no `skipLibCheck` in tsconfig); our code is
  clean. Fix: add `skipLibCheck` or upgrade kobalte.
- Only one browser tab should run sessions: two open tabs share one localStorage draft.
- Matching tones are loudness-equalised only when the hearing check was done; after skipping it,
  with high-frequency hearing loss the user may need the level slider to hear the upper candidates.
- The hearing check is a yes/no task without catch trials, so a listener who says "yes" to their own
  tinnitus gets thresholds that are too low. Pulsed beeps and the hint to listen for the rhythm are
  the only guard.

## Deferred

User music files, PWA / mobile background playback, i18n, per-ear therapy.
