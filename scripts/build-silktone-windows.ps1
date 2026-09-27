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

bun run tauri build
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }

& (Join-Path $PSScriptRoot 'verify-silktone-windows.ps1')

Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*setup.exe' |
  Select-Object FullName, Length
