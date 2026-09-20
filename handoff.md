# Session Handoff — 2026-09-11

## Goal
Apply the swarm security audit at `~/Projects/swarm/audits/toll-e/2026-09-11/`
(findings.md, proposals.md): TOLLE-007 (next RCE), TOLLE-008 (security headers),
TOLLE-001 (pnpm audit advisories), one PR each, then mark the ledger.

## Current State
Done. All three PRs merged by Shahar on 2026-09-11 (#7 → #8 → #9); main is
`f4a99b6`, CI green on it. Verified on local `main` after `git pull` +
`pnpm install --frozen-lockfile`:
- `next` 16.3.3 installed; both audit tests PASS
  (`test_next_security_release.py`, `test_next_config_hardening.py`)
- `pnpm audit --audit-level moderate` → no known vulnerabilities
- vitest 217/217, `tsc --noEmit` clean, `pnpm lint` clean
- Playwright smoke 15/15 (run on the #7 branch, locally)

Ledger `~/Projects/swarm/audits/toll-e/ledger.jsonl`: TOLLE-007 → PR #7,
TOLLE-008 → PR #8, TOLLE-001 → PR #9 (was PR #1; note added that #1 left
advisories open). All three still say `fixed-in-pr`, not updated after merge.

Not verified: the new headers were checked via the audit test (config level)
and a build, not with `curl -I` against a running server or the Vercel prod
deployment.

`handoff.md` is the only uncommitted file.

## Active Files
- `package.json` — `next`/`eslint-config-next` 16.3.3, `vitest` ^4.1.11.
- `pnpm-lock.yaml` — next 16.3.3, sharp 0.35.4, js-yaml 4.3.2,
  vitest/@vitest/* 4.1.11, rolldown/oxc patch bumps.
- `next.config.ts` — `headers()` returning nosniff, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  (camera/microphone/geolocation/payment off). No CSP.
- `~/Projects/swarm/audits/toll-e/ledger.jsonl` — three rows updated.

## Changes Made This Session
1. **#7 (`6b2d666`)** — audit's `next-security-release.diff` via `git apply`.
   GHSA-2xp9-vwfh-vxw4 / GHSA-p293-qw3h-jr36, fixed in 16.3.3.
2. **#8 (`2ae1117`)** — audit's `security-headers.diff`. Branched from main,
   independent of #7. CSP left out: next-intl + inline theme script need
   nonces first.
3. **#9 (`06593e9`)** — dependency bumps. Stacked on #7 (base `main`) because
   `pnpm audit` isn't clean without next 16.3.3. PRs used despite the
   `commit-straight-to-main` memory because Shahar explicitly asked for
   one PR per step this time.
4. `@claude review` commented on each PR (auto-review also ran). All three:
   no bugs. #8 review's optional follow-up: HSTS (Vercel adds it by default),
   COOP/CORP later with CSP.

## Failed Attempts
- **`pnpm install --frozen-lockfile` aborts with no TTY**
  (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`) and the next `pnpm build`
  silently uses the OLD node_modules. Use
  `pnpm install --frozen-lockfile --config.confirm-modules-purge=false`
  and confirm with `node -e "console.log(require('next/package.json').version)"`.
- **`pnpm update sharp js-yaml vitest @vitest/mocker` only moved vitest** —
  sharp (via next) and js-yaml (via @eslint/eslintrc) are transitive. Needed
  `pnpm update --depth Infinity sharp js-yaml`. Cooldown (`minimumReleaseAge:
  1440`) was not the blocker; fixes were 16 days old.
- Note: `pnpm build` runs `drizzle-kit migrate` first — against `.env.local`'s
  DATABASE_URL, which is the local docker Postgres (127.0.0.1:5432). Fine
  locally; check before running it anywhere else.

## Next Step
Nothing required. Optional, ask Shahar first:
1. Ledger: flip TOLLE-001/007/008 from `fixed-in-pr` to fixed (PRs merged
   2026-09-11).
2. Delete local branches whose remote is gone: `security/audit-deps`,
   `security/next-16.3.3`, `security/response-headers`,
   `ci/checkout-no-persist-credentials`, `ci/claude-workflows-keep-credentials`,
   `ci/skip-auto-review-for-bots` (`git branch -vv | grep gone`).
3. Open audit proposals (not in scope, not started): per-IP rate limit on
   `app/api/market/*`, a `denied()` logging helper for 401/404 refusals,
   CSP report-only via `proxy.ts`, `SECURITY.md`.

Carried from the 2026-08-27 handoff, not re-checked this session: US index
strip switched to futures (ES=F/NQ=F/YM=F/RTY=F) was never looked at in a
browser; futures chart fallback previous close uses the 23:59 ET bar instead
of the 17:00 settlement (`pickSession`, `src/market-data/yahoo.ts`).
