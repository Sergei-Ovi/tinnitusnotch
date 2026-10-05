# Tinnitus Notch

**Open the app: <https://sergei-ovi.github.io/tinnitusnotch/>** — works in any desktop browser, nothing to install.

Notched sound therapy for tinnitus: noise with a band removed around your tinnitus frequency, plus a
guided test to find that frequency and a diary to see whether it helps. Interface in English and Russian.

> **Not a medical treatment.** Notched sound therapy (TMNMT, Okamoto/Pantev 2010) may reduce tinnitus
> loudness for some people, but the evidence is limited: small early studies showed a moderate effect,
> the largest trial (Stein et al. 2016) found no significant difference from placebo. It is expected to
> work best for tonal tinnitus below ~8 kHz, and only if the frequency is matched accurately.
> See a doctor if your tinnitus pulses with your heartbeat, appeared suddenly in one ear, or comes with
> hearing loss or dizziness.

## What it does

- **Finds your tinnitus frequency** in about 10 minutes, with headphones:
  volume calibration → optional hearing check (both ears, with catch trials) → tone or hiss →
  24 A/B comparisons in three rounds → octave check → fine-tuning → optional loudness match →
  optional after-effect check (residual inhibition). Or set the frequency by hand.
- **Plays therapy noise** — white, pink or brown, with a 0.25–1 octave band removed ≥ 40 dB deep
  around your frequency. Timed sessions of 15–60 minutes, with a hard volume ceiling.
- **Tracks progress** — tinnitus loudness 0–10 before and after each session, a daily trend chart,
  therapy time, the history of frequency matches with their loudness and hearing check.

Everything stays in your browser (localStorage); export a JSON backup to move it to another device.
Optional anonymous usage events (umami) never include frequencies or ratings.

## How it works

The notched noise is synthesised in the frequency domain — coloured spectrum, zeroed bins in the notch,
inverse FFT into a looped buffer — because filters can't cut a full octave 40 dB deep without eating the
neighbouring frequencies. Procedure logic (matching, hearing check, sessions, backup) lives in pure
modules under `src/lib` and is covered by Vitest. Design decisions and history: [docs/plan.md](docs/plan.md).

Stack: [Solid](https://solidjs.com), Vite, Tailwind, Web Audio API.

## Development

```bash
pnpm install     # or npm install
pnpm dev         # http://localhost:3000
pnpm test        # Vitest: matching, hearing check, sessions, backup, audio synthesis, translations
pnpm build       # production build into dist/
```

On Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

## Deployment

Every push to `main` of the public repository builds and deploys to GitHub Pages
(`.github/workflows/main.yml`); the base path is the repository name. Set the repository variables
`UMAMI_WEBSITE_ID` and `UMAMI_SCRIPT_SRC` to enable analytics; without them no analytics script is added.
Repositories, the release process and how changes are verified: [docs/plan.md](docs/plan.md).

## Credits

Started by [Vladislav Ploskov](https://github.com/vladplskv) as
[vladplskv/tinnitusnotch](https://github.com/vladplskv/tinnitusnotch). MIT licence.
