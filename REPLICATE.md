# Moving Silktone to another account

Everything account-specific lives in a handful of places. To run Silktone from a different GitHub account and Hugging Face org:

## 1. GitHub

```bash
git remote add neworigin https://github.com/<new-account>/<new-repo>.git
git push neworigin --all
```

The Windows build workflow (`.github/workflows/silktone-windows.yml`) needs no secrets. It runs on the new repo as soon as you push to `main` or to any `silktone-*` branch. The installer appears under **Actions → latest run → Artifacts**.

## 2. Hugging Face models

1. On huggingface.co, duplicate each of the five model repos (**⋯ → Duplicate this repository**) into the new org. The current sources are listed in `src-tauri/src/catalog/catalog.json` (`"id"` fields).
2. Check the copies, then repoint the app:

```bash
node scripts/point-models-to-org.mjs <new-org>          # verifies sizes + sha256
node scripts/point-models-to-org.mjs <new-org> --write  # updates catalog.json
```

Commit the updated `catalog.json`.

## 3. Company name

- `src-tauri/tauri.conf.json` → `bundle.publisher` and `bundle.copyright`
- `src-tauri/Cargo.toml` → `authors`
- `LICENSE` → add the new copyright line (keep the existing lines; the MIT license requires them)

## 4. Only if it becomes a separate product

Change `identifier` in `src-tauri/tauri.conf.json` (currently `com.silktone.desktop`). A different identifier installs side by side and starts with fresh settings.
