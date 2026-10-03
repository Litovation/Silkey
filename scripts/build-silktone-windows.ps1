$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'Build Silktone on Windows with Microsoft C++ Build Tools and the Vulkan SDK installed.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

. (Join-Path $PSScriptRoot 'prepare-silktone-windows.ps1')

foreach ($tool in @('bun', 'cargo', 'cmake', 'glslc')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Missing $tool. See BUILD.md for Windows prerequisites."
  }
}

# The Silero VAD model (MIT) is committed under src-tauri/resources/models.
$vadFile = Join-Path $repoRoot "src-tauri/resources/models/silero_vad_v4.onnx"
if (-not (Test-Path $vadFile)) { throw "Missing $vadFile." }

bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

# The release workflow passes extra Tauri config (version, signed updater files).
if ($env:SILKTONE_TAURI_CONFIG) {
  bun run tauri build --config $env:SILKTONE_TAURI_CONFIG
} else {
  bun run tauri build
}
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }

& (Join-Path $PSScriptRoot 'verify-silktone-windows.ps1')

Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*setup.exe' |
  Select-Object FullName, Length

# Phrase-rule tests for Voice Commands. Reuses the release build's dependencies.
# A failure is reported as a warning: it must not block the installer above.
$env:PATH = "$ortLib;$(Join-Path $repoRoot 'src-tauri/transcribe-libs');$env:PATH"
Push-Location (Join-Path $repoRoot 'src-tauri')
$testOutput = cargo test --release --lib voice_commands:: 2>&1 | Out-String
$testExit = $LASTEXITCODE
Pop-Location
$summary = ($testOutput -split "`n" | Where-Object { $_ -match '^test result|FAILED|panicked' } | Select-Object -First 8) -join ' | '
if ($testExit -eq 0) {
  Write-Host "::notice title=Voice command tests::$summary"
} else {
  Write-Host "::warning title=Voice command tests failed::$summary"
}
$global:LASTEXITCODE = 0
