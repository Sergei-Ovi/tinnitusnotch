# AGENTS.md

Tinnitus Notch: notched sound therapy for tinnitus in the browser — frequency matching wizard, therapy
noise, progress diary. Solid + Vite + Web Audio; English and Russian UI.

## Read first

[docs/plan.md](docs/plan.md) is the single source of truth: positioning, decisions, the matching
procedure, screens, stages with their PRs, repositories and release process, verification techniques,
open issues. Read the relevant section before changing behaviour; record each finished stage there.

## Rules

- **Stages**: one branch and one PR per stage on `origin` (the private repo), PR descriptions say what
  was checked and how. `main` is updated only through merged PRs.
- **Deploying** happens only on `git push public main`, and only when the user asks for a deploy or a
  release; merging doesn't change the public site.
- **Pure core**: procedure logic lives in `src/lib` — no Web Audio, no Solid, no locale — and is covered
  by Vitest. `src/app` holds controllers and screens, `src/components` the shared UI.
- **Strings** live only in `src/i18n/en.ts` and `src/i18n/ru.ts`; add every new string to both
  (`ru` is typed by `en`, so `tsc` catches a gap). `lib` returns codes, the dictionaries word them.
- **Levels** are dB relative to the hard output ceiling; every sound goes through that ceiling.
- **Stored data stays readable**: new fields in localStorage and backups are optional, older backups
  keep importing, `src/lib/therapy/backup.ts` validates every field.
- **Claims**: describe therapy as possibly reducing loudness for some people, with limited evidence.
- **Analytics**: anonymous events only; frequencies and ratings stay on the device.

## Done

- `pnpm test` and `npx tsc --noEmit` pass.
- UI changes checked in headless Chromium in both languages (plan → Verification).
- Changes to how something sounds are handed to the user to check by ear on headphones.
- `docs/plan.md` updated.
