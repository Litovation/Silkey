# Silkey

Silkey is a Windows-focused branded build of [Handy v0.9.7](https://github.com/cjpais/Handy/tree/v0.9.7). It keeps the same React/Tauri interface and local speech-to-text features. The supplied Silkey wordmark and its orange `#FF5C00` inform the app icon, onboarding, sidebar, tray, and selective accent colors.

The core transcription engine runs on the user's computer. Model downloads still use the URLs maintained by the upstream Handy project and Hugging Face. Optional post-processing may use a provider API if the user explicitly configures one in the app.

## Build a Windows installer

The GitHub route needs no Windows development tools on your computer: put the contents of this folder in your own GitHub repository, including `.github/workflows/silkey-windows.yml`. Pushing to `main` starts the Windows build automatically. You can also open **Actions → Build Silkey for Windows → Run workflow** to rerun it. After a successful run, download the **Silkey-Windows-x64** artifact and extract its installer. The workflow does not publish a release. It has not been executed here; Windows compilation and its installation checks still need to run.

Alternatively, on Windows 10/11 x64, install Rust, Bun, Microsoft C++ Build Tools, CMake, the LunarG Vulkan SDK, and vcpkg. Ensure vcpkg is on PATH. Open a new PowerShell terminal after installing them, then run:

```powershell
./scripts/build-silkey-windows.ps1
```

The script installs JavaScript dependencies, obtains the required VAD model, and builds an NSIS installer at `src-tauri/target/release/bundle/nsis/Silkey_0.9.7_x64-setup.exe` (the precise filename comes from Tauri). It does not sign the installer. Test installation, model download, recording, transcription, paste, shortcuts, history, and portable mode on Windows before distribution.

## Updates and distribution

Silkey uses a separate app identifier, `com.silkey.desktop`, so it does not overwrite Handy or adopt Handy's settings automatically. The original Handy updater cannot be used for a Silkey release. Update checks are safely locked off in this build; the rest of the update implementation remains in the source. To enable Silkey updates in a future release, provide a Silkey update manifest, signing key pair, and release hosting, replace the placeholder updater endpoint and public key in `src-tauri/tauri.conf.json`, and build with `SILKEY_UPDATES_ENABLED=1`. Do not point Silkey at the Handy update feed.

The app's About page links to the original Handy repository and donation page. The upstream MIT license is retained in [`LICENSE`](LICENSE). Source credits and model provenance remain in the source.

The original project documentation is preserved in [`HANDY-UPSTREAM-README.md`](HANDY-UPSTREAM-README.md).
