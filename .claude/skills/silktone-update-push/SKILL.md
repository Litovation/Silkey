---
name: silktone-update-push
description: Ship the working branch to users. Saves the current main as a numbered draft-main-N backup branch, replaces main with the working branch (v0.1.1-ui), then starts the "Release Silktone" workflow with the next version so installed apps update on their next launch. Run only when the owner types /silktone-update-push.
disable-model-invocation: true
argument-hint: "[version, e.g. 0.2.0] [release notes]"
---

# /silktone-update-push

The owner typing this command is the go-ahead to change `main` and publish a
release. Do not ask again for permission; do stop and report at any failed
check below. Never run this skill on your own initiative.

## Branches

- **Working branch:** `v0.1.1-ui` (all edits happen here).
- **Running branch:** `main`. Owner's rule: `main` must always equal what
  users run, so `main` only changes together with a release, never on its
  own.
- **Backups:** `draft-main-1`, `draft-main-2`, … Each run saves the old
  `main` under the next free number. Backups are never deleted or reused.

## Arguments

`$ARGUMENTS` may hold a version (`X.Y.Z`) and/or release notes, in that order.
There is no "no release" mode: if the owner asks to skip the release, do not
change `main` either; tell them `main` and the release go together.

- No version given: take the latest GitHub release tag `vX.Y.Z` and add one
  to the last number (0.1.4 -> 0.1.5). If there is no release yet, ask the
  owner which version to start at (this is the only question allowed).
- A given version must be higher than the latest release.
- No notes given: write one short plain-English line from the commit
  subjects being shipped (no commit hashes, no jargon), e.g.
  "Faster dictation start and a fix for the settings window."

## Steps

Report progress to the owner in short plain lines; they are not a developer.

1. **Sync the working branch.**
   Other people and other AI sessions also push to `v0.1.1-ui`, so always
   start from GitHub's copy, never from an old local one:
   `git fetch origin main v0.1.1-ui --prune` and also fetch all
   `draft-main-*` branches (`git ls-remote --heads origin 'draft-main-*'`).
   If there are local commits on `v0.1.1-ui` that are not pushed, push them
   first (`git push origin v0.1.1-ui`). Uncommitted changes in the working
   tree: stop and tell the owner what is uncommitted.

2. **Anything to ship?** If `origin/main` already equals
   `origin/v0.1.1-ui`, and the latest release tag already points at that
   commit, say "Nothing new to ship" and stop. If they are equal but no
   release exists for that commit, do step 3, then skip to step 6.

3. **Build check.** The tested installer must match what ships. Find the
   latest "Build Silktone for Windows" run (workflow file
   `silktone-windows.yml`) for the tip of `origin/v0.1.1-ui`.
   - Success: continue.
   - Running or queued: tell the owner it is still building and stop.
   - Failed: stop and report the failure.
   - Cancelled, or no run for the tip: allowed only if nothing that goes
     into the app changed since the last successfully built commit, i.e.
     `git diff --name-only <last good sha> origin/v0.1.1-ui` lists only
     `*.md`, `.gitignore`, `.claude/**` or `.github/workflows/**` files.
     Show the owner that list. Otherwise stop: "This version was never
     built."

4. **Save the old main.** Next number N = highest existing
   `draft-main-N` + 1 (start at 1). Then
   `git push origin origin/main:refs/heads/draft-main-N`.
   Confirm the branch exists on origin before continuing; if this fails,
   stop: main must never be replaced without its backup.

5. **Replace main with the working branch.**
   Fetch `v0.1.1-ui` once more first; if it moved since step 3 (someone
   pushed meanwhile), go back to step 3 for the new tip. Then
   `git push --force-with-lease=main:<old main sha> origin <checked v0.1.1-ui sha>:refs/heads/main`
   (`<old main sha>` is what was just saved; push the exact sha that passed
   step 3, not whatever the branch points at now). Then verify
   `origin/main` equals `origin/v0.1.1-ui`. If the push is refused (branch
   protection, permissions), report exactly that; the backup stays.

6. **Release.** Work out the version and notes (see Arguments), then start
   the `silktone-release.yml` workflow on ref `main` with inputs
   `version` and `notes`:
   - In a Claude cloud session use the GitHub MCP tool
     `actions_run_trigger` (method `run_workflow`).
   - Elsewhere use `gh workflow run silktone-release.yml --ref main -f version=X.Y.Z -f notes="..."`.
   Then find the new run and give the owner its link.

7. **Final report** (short):
   - Old main saved as `draft-main-N`.
   - `main` now matches `v0.1.1-ui`.
   - Release `vX.Y.Z` started: link. It takes 30–60 minutes; when it is
     green, installed apps update on their next launch.
   - If the release run fails at "Check inputs and secrets", the signing key
     secrets are missing: point to "Update signing key" in `HANDOFF.md`.

## Rolling back

If the owner asks to undo a push: replace `main` with the newest
`draft-main-N` the same way as step 5 (saving the current main first as the
next draft number). Note that a release already published stays published;
fixing users requires releasing a new, higher version from the restored
main.
