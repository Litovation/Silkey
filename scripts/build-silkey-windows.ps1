$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
  throw 'Build Silkey on Windows with Microsoft C++ Build Tools and the Vulkan SDK installed.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

. (Join-Path $PSScriptRoot 'prepare-silkey-windows.ps1')

foreach ($tool in @('bun', 'cargo', 'cmake', 'glslc')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Missing $tool. See BUILD.md for Windows prerequisites."
  }
}

$vadDir = Join-Path $repoRoot 'src-tauri/resources/models'
$vadFile = Join-Path $vadDir 'silero_vad_v4.onnx'
New-Item -ItemType Directory -Path $vadDir -Force | Out-Null
if (-not (Test-Path $vadFile)) {
  Invoke-WebRequest -Uri 'https://blob.handy.computer/silero_vad_v4.onnx' -OutFile $vadFile
}

bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

bun run tauri build
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }

& (Join-Path $PSScriptRoot 'verify-silkey-windows.ps1')

Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*setup.exe' |
  Select-Object FullName, Length
