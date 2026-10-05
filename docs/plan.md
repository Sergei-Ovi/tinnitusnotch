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
3. Audiometry (stage 4): 0.5, 1, 2, 3, 4, 6, 8, 10, 12 kHz, simplified Hughson-Westlake
   (down 10 dB / up 5 dB), each ear separately. Steep threshold drop edge → starting hypothesis;
   otherwise start at 4 kHz.
4. 2AFC: "which of A/B is closer to your tinnitus?", log-scale bisection, ~8–10 trials.
   Three runs from different starting points, result = median; spread > ½ octave → "unreliable match".
5. Octave check: f vs 2f vs f/2.
6. Manual fine-tune slider. "I know my frequency" manual mode stays available.
7. Loudness match: tone as loud as the tinnitus (dB over threshold) → objective diary metric.
8. Residual inhibition check (stage 5): 60 s narrowband noise at f, then silence; ask whether tinnitus
   got quieter and for how long. No effect → gently suggest trying ±½ octave, never block therapy.

## Screens

Tabs: Therapy / Setup / History (opens on Setup until the first session is saved).

- **Setup** — manual matching now (tone, log slider, octave/semitone steps, interactive spectrum);
  the wizard will be added here (mandatory on first run, re-runnable), manual mode stays.
- **Therapy** — session timer, noise colour, notch width, volume, 0–10 rating before/after.
- **History** — stats and session list with export/import; becomes **Progress** in stage 5
  (audiogram, frequency history, rating trend).

## Stages (one PR each)

1. ✅ Core fixes: log frequency scale, single volume scale, fades without clicks, octave notch,
   noise colours, volume ceiling, disclaimer. — PR #1, merged.
2. ✅ Therapy screen: timer, 0–10 diary, history, export/import. — PR #2, merged.
3. ⏭ Matching wizard: calibration → type → 2AFC ×3 + octave check → loudness match.
4. Audiometry → starting hypothesis.
5. Residual inhibition + Progress screen.

Each stage keeps its procedure logic in pure modules (`src/lib/…`) with Vitest, and is checked
end-to-end in a headless browser before the PR; sound itself is checked by ear.

## Open issues

- `tsc` fails on @kobalte/core typings in node_modules (no `skipLibCheck` in tsconfig); our code is
  clean. Fix: add `skipLibCheck` or upgrade kobalte.
- Session stats (today / 7 days) are computed on render and don't roll over at midnight while the
  History tab stays open.
- Only one browser tab should run sessions: two open tabs share one localStorage draft.

## Deferred

User music files, PWA / mobile background playback, i18n, per-ear therapy.
