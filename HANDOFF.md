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
| Payments | Razorpay with UPI recurring (UPI AutoPay), later |
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
  `trial_ends_at` (signup + 30 days), `banned`. Users can only read their own
  row; the owner edits rows in the dashboard.
- `public.silktone_get_access()`: the one call the app makes; answers with
  the server clock.

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

Sign-in does not work until the owner finishes the Google step (see
Blockers). Until then any build from this branch stops at the sign-in screen
and cannot dictate.

Preview states: `dev/mock-preview.html?account=trial|offline|stale|expired|banned`.

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
- Copies installed before this (0.1.0 builds) cannot update themselves and
  need one manual install.

## Placeholders that do nothing yet

- CommandGo sidebar item (locked) and Refer & earn (marked "Soon").
- The "trial ended" screen links to the website; there is no checkout yet.

## Still to build, in suggested order

1. **Get a build.** Run the Windows workflow on this branch and fix whatever
   the Rust compile or installer reports.
2. **Accounts: finish and test.** Code is written
   but has never run for real: the Rust parts are uncompiled and no one has
   signed in yet. After the owner's Google step, test sign-in, sign-out,
   trial expiry, ban, and the offline rule on a real build.
3. **Razorpay with UPI recurring (large, blocked).** Checkout link and a
   function that marks the user `paid` on Razorpay's notification.
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

- **Google sign-in (owner, about 10 minutes, free):**
  1. Google Cloud Console: create an OAuth client of type "Web application"
     with the authorised redirect URI
     `https://ihslofjgydhpnaadbhnv.supabase.co/auth/v1/callback`.
  2. Supabase dashboard, Authentication, Sign In / Providers, Google: turn it
     on and paste the client ID and client secret.
  3. Supabase dashboard, Authentication, URL Configuration, Redirect URLs:
     add `http://127.0.0.1:17645/callback`.
- **Razorpay:** account, verification, subscription plan with UPI AutoPay,
  and keys.

## Open questions for the owner

- Should the shortcut, language and microphone settings return to the home
  page, or stay in the Settings pop-up (current)?
- Keep or hide the "Shortcut Behavior" setting and the history-limit settings?
- Exact wording wanted for the CommandGo banner and where "Know More" and
  "Refer & earn" should lead.
