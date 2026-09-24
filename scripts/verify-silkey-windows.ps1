$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$staged = @(Get-ChildItem 'src-tauri/transcribe-libs' -Filter '*.dll')
foreach ($required in @('msvcp140.dll', 'vcruntime140.dll', 'vcomp140.dll', 'onnxruntime.dll')) {
  if (-not ($staged | Where-Object Name -eq $required)) { throw "Missing staged DLL: $required" }
}
foreach ($pattern in @('*transcribe*', '*ggml*')) {
  if (-not ($staged | Where-Object Name -like $pattern)) { throw "Missing native runtime: $pattern" }
}
$packages = @(Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*setup.exe')
if ($packages.Count -eq 0) { throw 'No Silkey installer was produced.' }
foreach ($package in $packages) {
  $installDir = Join-Path ([IO.Path]::GetTempPath()) ('silkey-check-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory $installDir | Out-Null
  $process = Start-Process $package.FullName -ArgumentList @('/S', '/PORTABLE', "/D=$installDir") -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Portable installation failed: $($process.ExitCode)" }
  $exe = Get-ChildItem $installDir -Filter 'silkey.exe' -File -Recurse | Select-Object -First 1
  if (-not $exe) { throw 'The installer is missing silkey.exe.' }
  $appDir = $exe.DirectoryName
  foreach ($dll in $staged) {
    if (-not (Test-Path (Join-Path $appDir $dll.Name))) { throw "Installer missing $($dll.Name) beside silkey.exe" }
  }
  if ((Get-Content (Join-Path $appDir 'portable') -Raw).Trim() -ne 'Silkey Portable Mode') {
    throw 'Incorrect portable marker.'
  }
  $process = Start-Process $exe.FullName -ArgumentList '--list-devices' -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Silkey native engine failed to initialize: $($process.ExitCode)" }
  Write-Host "Portable install and native-engine check passed. Test install retained at $installDir"
}
