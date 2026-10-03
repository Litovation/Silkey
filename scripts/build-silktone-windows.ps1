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

# Job logs need a GitHub login, but annotations are public. On failure, publish
# the compiler/installer errors as annotations so they can be read without one.
function Publish-BuildErrors([string]$logPath) {
  $lines = @(Get-Content $logPath)
  $escape = { param($text) $text -replace '%', '%25' -replace "`r", '%0D' -replace "`n", '%0A' }
  $tail = ($lines | Select-Object -Last 40) -join "`n"
  Write-Host "::error title=Build log tail::$(& $escape $tail)"
  $blocks = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^(error|Error)(\[|:| )') {
      $end = [Math]::Min($i + 14, $lines.Count - 1)
      $blocks += ($lines[$i..$end] -join "`n")
    }
  }
  $perAnnotation = 5
  for ($i = 0; $i -lt $blocks.Count -and $i -lt 40; $i += $perAnnotation) {
    $last = [Math]::Min($i + $perAnnotation - 1, $blocks.Count - 1)
    $text = $blocks[$i..$last] -join "`n`n"
    Write-Host "::error title=Build errors $([int]($i / $perAnnotation) + 1)::$(& $escape $text)"
  }
}

$buildLog = Join-Path ([IO.Path]::GetTempPath()) 'silktone-build.log'
bun run tauri build 2>&1 | Tee-Object -FilePath $buildLog
if ($LASTEXITCODE -ne 0) {
  Publish-BuildErrors $buildLog
  throw 'Windows build failed.'
}

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
