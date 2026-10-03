# Silktone v0.1.1 handoff

Share this file with Claude at the start of a session to continue from here.
Last updated: 2026-10-04. Branch: `v0.1.1-ui` on `github.com/Litovation/Silkey`.

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
| Glass effect | Toggle switches and dropdowns only |

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
- **Trackpad:** two-finger double-tap to dictate (Windows), off by default.

Key files: `src/components/home/`, `src/components/Sidebar.tsx`,
`src/components/settings/SettingsModal.tsx`, `src/lib/dictationStats.ts`,
`src/hooks/useDictationStats.ts`, `src-tauri/src/settings.rs`,
`src-tauri/nsis/installer.nsi`.

## Not yet verified

- The Rust default changes, the login-launch-to-tray change and the installer
  edits have never been compiled or run.
- The stats card has only been seen with sample numbers, not real dictations.
- Whether the speech model supports Hindi. The language list only shows
  Hindi if the model reports it.

## Placeholders that do nothing yet

- Sign in button and Account tab (greyed out).
- CommandGo sidebar item (locked) and Refer & earn (marked "Soon").

## Still to build, in suggested order

1. **Get a build.** Run the Windows workflow on this branch and fix whatever
   the Rust compile or installer reports.
2. **Stop and paste after 5 seconds of silence.** Rust, medium.
3. **Automatic model download + first-launch walkthrough.** Medium to large.
   Steps: sign in, set the shortcut (trackpad double-tap explained), a
   practice box where the pressed keys glow, then say "From now on, my
   workflow will be very easy", then finish to the tray. Shown once.
4. **Accounts (large, blocked).** Supabase table with email, trial end date,
   plan (`trial`, `paid`, `free_forever`) and banned flag; a trigger that
   starts the 30-day trial; a server-clock access check; Google sign-in via
   the browser and a `silktone://` link back to the app; log out; a block at
   the point where recording starts; trial-ended and banned screens; the
   3-day offline rule.
5. **Razorpay with UPI recurring (large, blocked).** Checkout link and a
   function that marks the user `paid` on Razorpay's notification.
6. **Later:** private admin page, signed Windows builds, a local
   post-processing model, real Refer & earn and CommandGo.

## Blockers that need the owner

- **Supabase:** the free plan's two-project limit is reached, so a new
  project cannot be created. The owner must pause an unused project or
  upgrade (about $25/month).
- **Google sign-in:** the owner registers Silktone in Google Cloud and pastes
  two values into Supabase (about 10 minutes, free).
- **Razorpay:** account, verification, subscription plan with UPI AutoPay,
  and keys.

## Open questions for the owner

- Should the shortcut, language and microphone settings return to the home
  page, or stay in the Settings pop-up (current)?
- Keep or hide the "Shortcut Behavior" setting and the history-limit settings?
- Exact wording wanted for the CommandGo banner and where "Know More" and
  "Refer & earn" should lead.
