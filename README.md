# Silktone

Silktone is a Windows voice-dictation app. Hold the shortcut, speak, and the text is typed into whatever app you are using. Speech recognition runs locally on the user's computer; nothing is sent to a server unless the user turns on AI post-processing with their own provider key.

## Speech models

Silktone offers exactly two models, both from NVIDIA, defined in [`src-tauri/src/catalog/catalog.json`](src-tauri/src/catalog/catalog.json):

| Model | Languages | Notes | License |
| --- | --- | --- | --- |
| Nemotron Streaming 3.5 | 28 (incl. Hindi) | Live streaming: text appears while you speak | NVIDIA Open Model License |
| Canary 180M Flash | 4 | Smallest and fastest, translation | CC-BY-4.0 |

Model files download from Hugging Face at the pinned revisions in the catalog and are verified against their sha256 hashes. Any other model found on disk is ignored.

## Build a Windows installer

Push to `main` (or run **Actions → Build Silktone for Windows → Run workflow**). The workflow builds the NSIS installer and uploads it as the **Silktone-Windows-x64** artifact.

To build locally on Windows 10/11 x64, install Rust, Bun, Microsoft C++ Build Tools, CMake, the LunarG Vulkan SDK and vcpkg, then run:

```powershell
./scripts/build-silktone-windows.ps1
```

The installer lands in `src-tauri/target/release/bundle/nsis/`. It is not code-signed.

## Updates

Update checks are locked off until Silktone update hosting exists. To enable them, publish a signed `latest.json`, replace the updater endpoint and public key in `src-tauri/tauri.conf.json`, and build with `SILKTONE_UPDATES_ENABLED=1`.

## License

MIT — see [`LICENSE`](LICENSE). Model licenses are listed above.
