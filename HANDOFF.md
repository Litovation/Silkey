# Silktone v0.1.1 handoff

Share this file with Claude at the start of a session to continue from here.
Last updated: 2026-10-04. Repo: `github.com/Litovation/Silkey`.

Branches:

There are two long-lived branches. On 2026-10-04 everything was folded into
them and the older branches (`silktone-rebrand`, `silktone-accounts`,
`silktone-model-choice`) were deleted; all their commits are in the history.

- `v0.1.1-ui`: the working branch. Changes go here. A collaborator may also
  push here, so pull before working.
- `main`: the stable branch. Move it forward only to a commit whose Windows
  build has passed.

The Windows build runs on every push to `main`, `v0.1.1-ui` and any
short-lived `silktone-*` side branch (docs-only pushes are skipped). A build
takes about 27 minutes, so push once per batch of changes.

## What Silktone is

A Windows desktop dictation app (Tauri 2: Rust backend, React + TypeScript
frontend). Speech is transcribed on the user's PC; nothing is sent online.
See `AGENTS.md` for architecture and commands.

## How to work with the owner

- Do not build or create anything until the owner clearly says to start.
  Loose phrases like "go forward" mean "keep explaining".
- The owner dictates by voice; restate ambiguous requests before acting.
- Credits are limited: prefer the cheapest order of work and say what is
  blocked before starting.
- The owner wants no manual work except account/payment setup steps.
- Make every change locally first and check it there (type-check, lint,
  Rust compile and tests, browser preview) before pushing to GitHub. Push
  only work that has passed those checks.

## Environment limits on the owner's PC

- No Rust toolchain, no Bun, no `gh`. Node and npm work.
- So Rust code and the NSIS installer cannot be compiled locally. They are
  only tested by the GitHub Actions build.
- The Windows build workflow runs on pushes to `main` and `silktone-*`
  branches, or by manual run. It does NOT run automatically on `v0.1.1-ui`.
- Frontend checks that work locally: `npx tsc --noEmit`, `npx eslint src`,
  `npx prettier --check <files>`, `npx vite build`.
- Run prettier only on files you changed. Running it on whole folders rewrites
  line endings across the repo.

## Previewing the UI without the Rust app

`dev/mock-preview.html` fakes the Tauri backend in a browser.

1. Start Vite: `node node_modules/vite/bin/vite.js --port 1420`
2. Open `http://localhost:1420/dev/mock-preview.html`
   (add `?theme=dark` for dark mode).

It is a stand-in: it proves layout and text, not real behaviour.

## Decisions already made

| Topic | Decision |
|---|---|
| Sign-in | Google only |
| Trial | 30 days free, no card, one per Google account |
| Access control | Server decides allowed / expired / banned; all processing stays local |
| Offline window | 3 days, then the app asks for a connection; block if the PC clock goes backwards |
| Admin | Owner edits users in the Supabase dashboard (extend trial, free access, ban) |
| Payments | Razorpay Subscriptions, one plan at ₹200 a month, UPI AutoPay preferred (card and eMandate also on) |
| Failed renewal | App keeps working for 3 days after the paid period, then locks |
| Cancelling | In the app but tucked away (Settings, Account, "Manage plan" link, then a quiet "Cancel subscription" link and one confirmation). Access continues to the end of the paid period |
| Paying during the trial | Charged at once; the paid month starts that day. A tooltip on Subscribe says how many free days are left |
| Backend | A new, separate Supabase project named for Silktone v0.1.1 (do not reuse `agency-media`) |
| Code signing | None for beta; buy a certificate before public launch |
| Post-processing | Bring your own key, off by default, with an in-app guide |
| Silence | After 5 seconds of silence, stop and paste what was said |
| Speech model | Downloads automatically; never shown to the user |
| Languages | English and Hindi only (interface and dictation) |
| Theme | Light by default; dark available |
| Glass effect | Toggle switches, dropdowns, and the recording overlay in the light theme (dark overlay stays flat) |

## Done in v0.1.1 so far (commit `425785c` and later on `v0.1.1-ui`)

- **Home page (Tone):** welcome heading, "Press Ctrl + Windows and start
  speaking" line, CommandGo banner (from the owner's Figma file), history
  (time left, text right), and a stats card (total words, wpm, day streak,
  speaking-pace score out of 10 with a tip).
- **Sidebar:** Tone, locked CommandGo; at the bottom Settings, Refer & earn
  (marked "Soon"), Sign in.
- **Settings pop-up** with tabs: General, System, Post Process (when
  enabled), Account, Debug (debug mode only), About.
- **Hidden from users:** Models page, Commands page, audio feedback, cancel
  shortcut setting, start hidden, unload model, keep mic open, keyboard
  implementation, paste method, clipboard handling, update checks, "show
  what's new", model name in the footer.
- **About:** data folder, log folder and licence credits in very small text.
- **Post Process guide:** free options (Groq, OpenRouter, Ollama) and steps.
- **Defaults (new installs only):** launch on login and start in the tray,
  overlay on top, unload after 2 minutes, mic kept open, direct paste,
  English, light theme.
- **Installer:** logo header, install-location screen only, auto-launch, no
  portable choice.
- **Trackpad:** rest two fingers for 1.5 seconds to dictate (Windows), off
  by default. The setting key is still `trackpad_double_tap_enabled`.
- **Silence auto-stop:** after 5 seconds with no speech, the recording stops
  and what was said is pasted, exactly as if the shortcut had been pressed.
  Setting `silence_auto_stop_secs` (0 = off); a "Stop When I Stop Talking"
  toggle sits in Settings → General. Works only while voice detection (VAD)
  is on, which is the default. Key files: `recorder.rs` (`SilenceWatch`),
  `transcription_coordinator.rs` (`on_silence`).
- **Automatic model + first-launch walkthrough:** the speech model downloads
  and is selected on its own (`src/hooks/useAutoModelSetup.ts`), also for a
  returning user whose model is missing. The walkthrough
  (`src/components/onboarding/FirstRunSetup.tsx`) follows the sign-in
  screen and has three steps: shortcut
  (with the trackpad option explained), a practice box where the held keys
  light up and the user says "From now on, my workflow will be very easy",
  then "You're all set", which hides the window to the tray. Preview it with
  `dev/mock-preview.html?firstRun=1`.

- **Recording overlay:** in the light theme the overlay is frosted glass
  (translucent white over a blur of what is behind it). The Live overlay is a
  fixed control island (K mark, waveform, timer, cancel) that overlaps a
  separate text box, so the two read as one object; the island no longer
  morphs into a panel. Dark keeps its flat surface with the same layout. The
  native overlay window grew to make room for the shadow (256x66 compact,
  432x164 Live). Files: `src/overlay/RecordingOverlay.css`,
  `src/overlay/RecordingOverlay.tsx`, `src-tauri/src/overlay.rs`.

Key files: `src/components/home/`, `src/components/Sidebar.tsx`,
`src/components/settings/SettingsModal.tsx`, `src/lib/dictationStats.ts`,
`src/hooks/useDictationStats.ts`, `src-tauri/src/settings.rs`,
`src-tauri/nsis/installer.nsi`.

## Not yet verified

- The Rust default changes, the login-launch-to-tray change and the installer
  edits have never been compiled or run.
- The stats card has only been seen with sample numbers, not real dictations.
- Silence auto-stop and the walkthrough have unit tests and a browser
  preview, but have not been tried in the real Windows app. In particular:
  whether the held-key glow sees the Windows key, and whether the practice
  dictation types into the practice box.
- The glass overlay has only been seen in a browser. Whether WebView2 blurs
  the desktop behind the transparent overlay window on Windows is untested;
  if it does not, the card shows as plain translucent white and the fix is a
  native Acrylic effect on the overlay window in `overlay.rs`.
- The walkthrough counts as finished once the model is selected (the backend
  marks onboarding complete then), so quitting mid-walkthrough after the
  download skips it next time.
- Whether the speech model supports Hindi. The language list only shows
  Hindi if the model reports it.

## Accounts

Backend: Supabase project `silktone-v0-1-1` (ref `ihslofjgydhpnaadbhnv`,
region ap-south-1). Schema is in `supabase/migrations/`.

- `public.profiles`: `email`, `plan` (`trial` / `paid` / `free_forever`),
  `trial_ends_at` (signup + 30 days), `banned`, plus the payment columns
  `razorpay_subscription_id`, `subscription_status`, `paid_until`,
  `cancel_at_period_end`. Users can only read their own row; the owner edits
  rows in the dashboard (Table Editor, `profiles`): a later `trial_ends_at`
  gives extra free time, `plan` = `free_forever` gives free access, `banned`
  blocks. Do not set `plan` = `paid` by hand; the webhook owns it.
- `public.silktone_get_access()`: the one call the app makes; answers with
  the server clock. `paid` counts only while `paid_until` + 3 days is in the
  future; after that the account falls back to trial time left, or expired.
- `public.razorpay_events`: ids of Razorpay notifications already handled,
  so repeats are ignored. Service role only.

App side:

- `src/lib/auth.ts`: Google sign-in (PKCE), session refresh, access check,
  3-day offline rule, clock-rollback check.
- `src/stores/authStore.ts`: state, re-check every 30 minutes.
- `src/components/account/AccountScreens.tsx`: sign-in and blocked screens.
- `src-tauri/src/access.rs`: the gate (`set_access_allowed`) and a one-shot
  loopback listener on `127.0.0.1:17645` that catches the browser's return.
- `src-tauri/src/transcription_coordinator.rs`: recording refuses to start
  when access is not allowed.
- `src/bindings.ts` was edited by hand for the two new commands.

Google sign-in works and is open to everyone (Google app "In production",
branding verified, 2026-10-04). The website has `privacy.html`, `terms.html`
and Google's ownership file `googlea7df478d04457611.html`, which must stay.

Preview states:
`dev/mock-preview.html?account=trial|offline|stale|expired|banned|paid|cancelling|due|lapsed`.
In the preview, Subscribe "succeeds" after a few seconds; add `&pay=fail` to
see the error text.

## Private beta: "Request beta access" and referral codes

No Telegram and no Discord (owner's decision, 2026-10-06: t.me links are
blocked for many users in India). Everything happens inside the app.

How it works:

- While the beta is **invite-only** (`beta_program.invite_only`), anyone can
  sign in and open Silktone, but dictation is locked. Pressing the dictation
  keys opens a pop-up (`BetaLockDialog`) with **Request beta access**; the
  same panel (`RequestAccess`) is in Settings, Account, "Beta access" and in
  the tutorial's practice step.
- **Request beta access**: with `auto_approve` on, the server approves at
  once (within `daily_limit`, counted per day on India time) and the app
  unlocks. Otherwise the request waits as `pending` in `beta_requests`; the
  app shows "Request sent" and re-checks when its window is focused. When
  today's limit is reached the request is saved as pending and the user sees
  "Today's spots are full".
- **Referral codes** ("Have a referral code?"): codes the owner makes and
  hands out (WhatsApp, X, ...). Each works once, for one account.
- Either way the account gets the `beta` plan: full access until the beta
  ends. Ending the beta also lifts the lock; requests and codes stop.
- Old 0.1.1/0.1.2 installs do not have "Request beta access"; they update
  to 0.1.3 or later on their next start.
- The updater is compiled in only with `SILKTONE_UPDATES_ENABLED=1` (see
  `update_checks_forced_disabled` in `settings.rs`). Releases 0.1.1 to 0.1.4
  were built without it, so they can never update themselves; their users
  must install the first release built with it (0.1.5 or later) once by
  hand. Both workflows set it since 2026-10-08.
- Copies installed from a "Build Silktone for Windows" artifact made before
  2026-10-08 carry a placeholder updater key and can never update
  themselves; reinstall them once from the Releases page. Since then the
  real public key is in `src-tauri/tauri.conf.json`, so test builds update
  like releases.

Owner controls (Supabase SQL editor):

| What | SQL |
|---|---|
| Lock accounts without access | `update public.beta_program set invite_only = true where id;` |
| Approve by hand instead of automatically | `update public.beta_program set auto_approve = false where id;` |
| Limit approvals per day | `update public.beta_program set daily_limit = 20 where id;` |
| No daily limit | `update public.beta_program set daily_limit = null where id;` |
| Stop new requests | `update public.beta_program set access_requests_open = false where id;` |
| Approve a waiting request | `select public.silktone_approve_beta_request('person@gmail.com');` (or set `status` to `approved` in Table Editor, `beta_requests`) |
| Referral codes to hand out | `select * from public.silktone_create_beta_codes(5);` |
| End the beta | `update public.beta_program set ends_at = now() where id;` |

Migrations: `20261005090000_beta_invites.sql` (lock, plan, codes),
`20261006180000_beta_access_requests.sql` (requests),
`20261006190000_remove_telegram.sql` (removes the Telegram pieces that were
live for a day: functions, columns, Vault secrets, cron job; disconnects the
bot). Also delete the `telegram-webhook` Edge Function in the dashboard.

Live since 2026-10-07: all three migrations applied (the clean-up was run by
the owner in the SQL editor, because the Supabase tool waits for an approval
on DROP, DELETE and UPDATE without WHERE and then times out), the
telegram-webhook function deleted, and `invite_only` turned on after 0.1.3
was published. Tested on a local Postgres 16, both from scratch and from a copy
of the live schema; screens checked in `dev/mock-preview.html?account=locked`
(`&request=pending|full_today|closed`; `window.__lockPopup()` fakes pressing
the dictation keys).

## Payments (Razorpay)

Built and deployed on 2026-10-04 in Razorpay **Test Mode**. No real payment
has been made yet, in test or live.

How it works:

1. Subscribe (trial-ended screen, or Settings, Account while on trial) calls
   the `create-subscription` function, which creates a Razorpay subscription
   and returns its hosted payment page. The app opens it in the browser.
2. Razorpay calls `razorpay-webhook`. It checks the signature, re-reads the
   subscription from Razorpay (notifications can arrive out of order) and
   sets `plan` = `paid` and `paid_until` when the subscription is active.
3. The app re-checks every 5 seconds for up to 15 minutes after opening the
   payment page, and unlocks when it sees `paid`.
4. `cancel-subscription` cancels at the end of the billing cycle.

Where things are:

- Functions: `supabase/functions/` (`_shared/razorpay.ts`,
  `create-subscription`, `cancel-subscription`, `razorpay-webhook`). The
  webhook is deployed with JWT verification off; the other two need a
  signed-in user.
- App: `createCheckoutUrl` and `cancelSubscription` in `src/lib/auth.ts`;
  `subscribe`, `cancelSubscription`, `awaitingPayment` in
  `src/stores/authStore.ts`; screens in `AccountScreens.tsx` and
  `src/components/settings/account/AccountSettings.tsx`. No Rust changes.
- Supabase Edge Function secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_PLAN_ID` (set, test values; plan `plan_Tjleob52ViYCEf`) and
  `RAZORPAY_WEBHOOK_SECRET` (not set yet). The app holds no Razorpay keys.
- Razorpay's cut on ₹200 at published rates: about ₹7.06 (2% + 0.99%
  subscriptions fee + 18% GST on the fees).

Known gaps:

- Account and payment text is English only.
- The ₹200 price is written in the English text, not read from the plan.
- If a user cancels the mandate in their UPI app instead of in Silktone, the
  app still says "renews" until the next renewal fails.

Going live (about 15 minutes, no new build): in Razorpay Live Mode create the
same plan, generate live keys, add the webhook again, then replace the four
secrets in Supabase. Reset any profiles marked `paid` by test payments.
Razorpay KYC is done; the website still lacks refund and contact pages.

## Updates and notifications

- Installed copies check GitHub Releases on launch, download the new version
  quietly, wait until no dictation is running, then install and restart.
  No permission is asked (owner's choice). Code:
  `src/components/update-checker/AutoUpdater.tsx`.
- Notifications are cards in the sidebar above Settings
  (`src/stores/notificationStore.ts`, `notify({...})` from anywhere).
- Releasing: Actions tab, "Release Silktone", Run workflow, enter a version
  higher than the last one. It builds, signs and publishes the release and
  `latest.json`. The app version comes from that input; there is no need to
  edit version numbers in files.
- Shortcut: the owner types `/silktone-update-push` (optionally with a
  version and notes). It saves the current `main` as `draft-main-N`,
  replaces `main` with `v0.1.1-ui` once its Windows build has passed, and
  starts the release. Steps: `.claude/skills/silktone-update-push/SKILL.md`.
  Run it only when the owner types it.
- Copies installed before this (0.1.0 builds) cannot update themselves and
  need one manual install.

## Placeholders that do nothing yet

- CommandGo sidebar item (locked) and Refer & earn (marked "Soon").

## Still to build, in suggested order

1. **Get a build.** Run the Windows workflow on this branch and fix whatever
   the Rust compile or installer reports.
2. **Accounts: finish testing.** Sign-in works on real builds. Still to try
   on a real build: sign-out, trial expiry, ban, and the offline rule.
3. **Razorpay: test, then go live.** Add the webhook (see Blockers), then on
   a build from this branch make a test payment, cancel it, and let a renewal
   fail. Then switch to live keys (see Payments).
4. **Later:** private admin page, signed Windows builds, a local
   post-processing model, real Refer & earn and CommandGo.

## Blockers that need the owner

- **Update signing key (owner, about 5 minutes, free):** needed before the
  first release.
  1. On the PC, in the repo folder: `npx @tauri-apps/cli signer generate -w silktone-updater.key`
     (choose a password or leave it empty). Keep the `.key` file private
     and backed up: losing it means installed copies can never update again.
  2. GitHub repo, Settings, Secrets and variables, Actions, add three
     secrets: `TAURI_SIGNING_PRIVATE_KEY` (contents of `silktone-updater.key`),
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the password, or empty), and
     `TAURI_SIGNING_PUBLIC_KEY` (contents of `silktone-updater.key.pub`).

- **Razorpay webhook (owner, about 5 minutes):** in Razorpay Test Mode,
  Account & Settings, Webhooks, add
  `https://ihslofjgydhpnaadbhnv.supabase.co/functions/v1/razorpay-webhook`
  with a secret of your choice and all the `subscription.*` events ticked.
  Save the same secret in Supabase, Edge Functions, Secrets as
  `RAZORPAY_WEBHOOK_SECRET`. Until this is done, payments succeed at
  Razorpay but the app never unlocks.

## Open questions for the owner

- Should the shortcut, language and microphone settings return to the home
  page, or stay in the Settings pop-up (current)?
- Keep or hide the "Shortcut Behavior" setting and the history-limit settings?
- Exact wording wanted for the CommandGo banner and where "Know More" and
  "Refer & earn" should lead.
