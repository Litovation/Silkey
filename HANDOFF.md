# Silktone v0.1.1 handoff

Share this file with Claude at the start of a session to continue from here.
Last updated: 2026-11-09. Repo: `github.com/Litovation/Silkey`.

**Latest work (2026-11-08/09) is on the test branch
`claude/peaceful-fermi-g3aiab`, not yet on `main` or released.** See the
two sections starting at "Accuracy, Silktone bar and dashboard" below. The
latest released version is **0.1.6** (9 Oct 2026); the release workflow only
accepts a higher version, so the next release is 0.1.7 or later. The owner
asked for this branch to carry **0.1.5** (app version and release notes):
fine for test builds, but a 0.1.5 release cannot be published (the workflow
refuses it, and installed 0.1.6 copies would never update to it). Release it
as 0.1.7, renaming `src/content/release-notes/0.1.5.md` to match.

Test builds of this branch stay **not for users**: the updater is off in both
the Windows and the Linux workflow (`SILKTONE_UPDATES_ENABLED: "0"`). Latest
good builds (2026-11-09): Windows build #47, Linux build #2.

Linux: `claude/silktone-linux` is the same app plus a Linux build workflow
(`.github/workflows/silktone-linux.yml`, .deb and AppImage, unsigned, updater
off). Keep it in step with this branch by merging this branch into it. It
builds on Ubuntu 24.04 because the prebuilt ONNX Runtime needs glibc 2.38+
(22.04 failed to link), so the packages need Ubuntu 24.04+, Debian 13+ or
Fedora 39+. Supporting older distros means linking ONNX Runtime dynamically
and shipping `libonnxruntime.so` with the app.

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
  returning user whose model is missing. The tutorial
  (`src/components/onboarding/FirstRunSetup.tsx`) follows the sign-in
  screen: performance, language, your keys (with the touchpad option),
  practice 1, hold & tap (with the Shortcut Behavior setting), practice 2
  (hold), practice 3 (tap), touchpad (only when it is on: hold time + an
  optional try), ready. A looping animation on the left acts out each step
  (`TutorialAnimation.tsx`, CSS in `App.css`, transform/opacity only).
- **The tutorial is mandatory (since 0.1.6):** practice 1 must succeed
  before anything else can be skipped; a success is a finished dictation
  matching the sentence (any words for Hindi/auto, or after 3 tries).
  That success saves `tutorial_version` (settings.rs
  `CURRENT_TUTORIAL_VERSION`, mirrored as `TUTORIAL_VERSION` in `App.tsx`).
  Below it, the app opens the tutorial on start (also for upgrading users,
  who skip the performance step) and the backend refuses dictation unless
  the Silktone window has focus. Raise both numbers together to make
  everyone take a changed tutorial again. Beta-locked accounts can only
  "Finish later"; it comes back once they have access.
  Preview: `dev/mock-preview.html?firstRun=1&account=beta` (new user),
  `?tutorial=1&account=beta&touchpad=1` (upgrading user with the touchpad
  step); in the console `__dictate("text")` fakes a finished dictation.

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

## Accuracy, Silktone bar and dashboard (branch `claude/peaceful-fermi-g3aiab`)

How the owner wants to work on this branch: build and check everything in
the cloud session first, commit locally, and push only when the owner says
"push". Test installers come from the "Build Silktone for Windows" run on
this branch (Actions, the run, Artifacts, Silktone-Windows-x64).

- **Speech model by language:** English uses Parakeet Unified English (about
  half the mistakes of Nemotron in Handy's tests, and faster); Hindi and auto
  use Nemotron Streaming 3.5, also on the Light tier (Canary has no Hindi).
  Existing users keep dictating while the better model downloads, then switch
  between dictations (`src/hooks/useAutoModelSetup.ts`). Needs transcribe-cpp
  0.2.4 (bumped). The tutorial now asks the language first so the right model
  downloads.
- **Tray model menu:** models read as quality levels, never names: Low
  (Canary 180M Flash), Medium (Nemotron, also Hindi), High (Parakeet Unified
  English). The submenu label is "Quality: High" etc. (`tray.rs`
  `quality_level`).
- **Model stays loaded 15 minutes** (was 2): settings schema 5 moves stores
  still on the old default.
- **Microphone check:** tutorial step 2 and Settings > General > Microphone.
  The user reads a sentence; `check_microphone` measures voice and background
  levels for 5 s and the boost is set so the voice lands near -20 dBFS. Verdicts:
  good, quiet, noisy, no speech, silent (`commands/audio.rs`).
- **Silktone bar:** the overlay window's resting state, a slim frosted pill at
  the top or bottom of the screen, kept at ~60% opacity so it does not pull
  the eye. Hover does not expand it: the pill lights up with a slowly flowing
  purple gradient (same transparency) and stretches a little; pressing it
  squishes like liquid and starts dictation. Shown only after the tutorial
  and with access. After a long stretch of typing (180 characters in 90 s)
  outside Silktone it opens a nudge card ("Typing a lot? Say it instead")
  that grows out of the pill and stays 10 seconds (a thin line drains to
  show the time), at most 4 times per run, 20 minutes apart. Only keystroke
  counts are kept. Both can be turned off in Settings > General
  (`silktone_bar.rs`, `overlay.rs`, `src/overlay/RecordingOverlay.tsx/.css`).
  Preview: `dev/overlay-preview.html?state=idle|nudge|answer|edited`.
- **Dashboard:** greeting, four stat tiles (words, wpm with pace bar, streak,
  time saved vs typing at 40 wpm), slimmer CommandGo card, history grouped by
  day with actions on hover and the player on demand; new `surface` colour
  token for cards; sidebar and settings tabs share one active style. Colour
  balance asked by the owner: about 20% pink (brand pink `#f650ae`: active
  nav marker and icon, stat icons, pace bar, shortcut keys, saved stars,
  account avatar, settings section icons), about 10% green (switches, main
  buttons, success), the rest neutral and white.
- **Before this goes to users:** the test build workflow
  (`.github/workflows/silktone-windows.yml`) is set to
  `SILKTONE_UPDATES_ENABLED: "0"` on this branch, so test copies never
  update themselves. Set it back to `"1"` when merging to `main`. The
  release workflow (`silktone-release.yml`) still has it on. A test copy
  built with it off cannot update itself; its tester installs the next
  release by hand once.

## Dictation quality upgrade (owner's build spec, same branch)

The owner's spec is the doc "Silktone Dictation Quality Upgrade: Build Spec"
(15 features, numbered as in the spec). Built:

- **Rule cleanup on every dictation, offline** (`src-tauri/src/audio_toolkit/cleanup/`):
  self-corrections (1, rules layer), stutters/restarts/fragments (2, in
  `text.rs`), spoken lists (3), numbers/dates/money/times written by our own
  English rules (4; the spec's text-processing-rs could not be run in the
  cloud session, so it is not used), "No speech heard" instead of made-up
  text on silence (6), spoken punctuation incl. "at the rate" (7), snippets
  (11), learned corrections (8, step 1). Order and English-only gating are
  documented in `cleanup/mod.rs`; everything runs inside
  `fail_open_text_transform`.
- **Quality test sets:** `src-tauri/tests/text_quality/*.tsv`, run by
  `cargo test --test text_quality`, each with the spec's pass mark. All at
  100% today, but small (8-24 cases each; the spec asks 60-120): grow them
  with real dictations.
- **AI cleanup:** better default prompt (self-corrections, repeats, grammar,
  lists, two examples; schema 6 upgrades untouched old prompts), custom and
  learned words sent as "spell exactly" (12, part 1), a safety check that
  falls back to the rule text if the AI drops content or invents names or
  numbers, and "Smart cleanup: Cloud AI" to run it on every dictation.
- **Screens:** Settings > Writing (cleanup level, formatting switches with
  examples, spoken-punctuation cheat-sheet, Voice AI, "Help AI cleanup
  with", style memory, dictionary and learned words); Settings > Snippets
  (also in the sidebar); History gets Fix word (with Undo) and Original
  (text before AI cleanup).
- **Voice AI (behind one switch, off by default; uses the Post Process
  provider):** Command Mode Ctrl+Alt+E (15), Draft Ctrl+Alt+D (16), Ask
  Ctrl+Alt+Q with an answer card, Copy and Insert (24). Context for AI
  cleanup: app name (Windows), selected text, clipboard (14, each off by
  default). Style memory with Clear my style (9). Code: `voice_ai.rs`.
- **Not built yet:** local AI cleanup model (1, layer 2: needs llama.cpp and
  model hosting), smart spacing at the cursor (5) and auto-learning from the
  user's own edits (8, step 2) (both need reading other apps' text fields),
  screen text OCR (part of 14), model hotwords (part of 12).
- **Spec questions still open for the owner:** 20 mixed-language (Hinglish)
  dictation keep or remove; 25 MCP server keep or remove; 21 is the
  "translate" item the one removed; switch Smart cleanup to Local AI
  automatically once that model exists?

## Windows build fixes (2026-11-08/09)

GitHub's release-download server answered HTTP 504 for most of a day, which
broke builds before any code compiled. The build no longer depends on it:
Bun installs from npm (pinned 1.4.2); ONNX Runtime falls back to NuGet;
Tauri's NSIS tools are fetched up front with SourceForge as a fallback;
vcpkg uses the runner's CMake (`VCPKG_FORCE_SYSTEM_BINARIES`); NSIS tools
and vcpkg packages are cached between runs. Same changes in the release
workflow. Build #46 on the test branch was the first fully green build with
all of the above (installer artifact `Silktone-Windows-x64`).

## Not yet tried on a real Windows PC (this branch)

- The bar's hover glow and press, and the nudge's keyboard hook.
- The mic check on real microphones.
- Command Mode / Draft / "Selected text" copying the selection (it presses
  Ctrl+C, then puts the clipboard back) and Undo after Command Mode.
- The app-name context (Windows only; compiled in build #46 but not run).
- Two old unit tests fail on this branch and on the base too (mic boost
  default and an old "Handy" name); unrelated to this work.

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

## Window frame and status ledge (2026-11-09)

On Windows and Linux the main window has no native title bar any more. It is
see-through (`decorations(false)`, `transparent(true)`, `shadow(false)` in
`lib.rs`, size `MAIN_WINDOW_SIZE`) and the app draws its own frame,
`src/components/frame/WindowFrame.tsx` + `.css`:

- A rounded shape whose bottom right steps down into a **ledge** (the owner
  picked design 1 "Ledge" from `dev/frame-variants.html`). The ledge is
  translucent with a violet-to-pink tint; its status (Ready, Quality
  Low/Medium/High, language, version) sits on near-solid chips so the text
  stays readable over any wallpaper.
- A 14 px transparent margin holds a soft shadow drawn from the same SVG path
  (content is never filtered, for scroll speed). A hairline edge with a slow
  violet-to-pink light runs along the outline; it pauses when the window loses
  focus and is off with reduced motion. Maximized: no margin, square corners.
- Own drag strip (32 px, `data-tauri-drag-region`) with minimize / maximize /
  close (close hides to the tray as before), and resize edges along the visible
  outline. Permissions for these are in `capabilities/default.json`.
- `.silk-content` has a transform so `position: fixed` screens fill the shape;
  `.h-screen` inside it means the shape's height. Dialogs and the settings
  sheet render into `#silk-portal` (`src/lib/portalRoot.ts`) so their backdrop
  stays inside the shape. Tooltips still go to `document.body`.
- The old bottom version bar (`components/footer`) is gone; the version is on
  the ledge and next to the wordmark.
- macOS keeps its native window (not built or tested here).

Untested on a real PC: drag, resize, snap layouts, maximize, and how the
transparent margin behaves (clicks in the see-through areas still land on the
window, not on what is behind it). Linux needs a compositor for transparency.

## Placeholders that do nothing yet

- CommandGo sidebar item (locked) and Refer & earn (marked "Soon").

## Still to build, in suggested order

1. **Test the branch build** (`claude/peaceful-fermi-g3aiab`, build #47 or
   later) on a real PC, fix what comes up, then merge to `main` (switch the
   test workflow's updater back on first) and release 0.1.7.
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
