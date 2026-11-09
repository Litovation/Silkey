$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
  throw 'This build targets Windows x64.'
}
$repoRoot = Split-Path -Parent $PSScriptRoot
if ($env:VULKAN_SDK) { $env:PATH = "$env:VULKAN_SDK\Bin;$env:PATH" }
foreach ($tool in @('bun', 'cargo', 'cmake', 'glslc', 'vcpkg')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Missing $tool. See BUILD.md or use the GitHub Windows workflow."
  }
}

# Match the VC runtime to the Visual Studio C++ installation.
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) { throw 'Install Visual Studio C++ Build Tools first.' }
$vsRoot = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsRoot) { throw 'No Visual Studio x64 C++ toolchain found.' }
$redistVersion = (Get-Content (Join-Path $vsRoot 'VC/Auxiliary/Build/Microsoft.VCRedistVersion.default.txt')).Trim()
$archDir = Join-Path $vsRoot "VC/Redist/MSVC/$redistVersion/x64"
$crt = Get-ChildItem $archDir -Directory -Filter 'Microsoft.VC*.CRT' | Sort-Object Name | Select-Object -Last 1
$omp = Get-ChildItem $archDir -Directory -Filter 'Microsoft.VC*.OpenMP' | Sort-Object Name | Select-Object -Last 1
if (-not $crt -or -not $omp) { throw 'The Visual Studio CRT/OpenMP redistributable is missing.' }
$env:SILKTONE_VC_REDIST_DIRS = "$($crt.FullName);$($omp.FullName)"

# Upstream's baseline ONNX runtime avoids an AVX2 startup requirement.
$depsDir = Join-Path $repoRoot '.silktone-build'
New-Item -ItemType Directory -Path $depsDir -Force | Out-Null
$ortVersion = '1.24.2'
$ortLib = Join-Path $depsDir "onnxruntime-win-x64-$ortVersion/lib"
if (-not (Test-Path (Join-Path $ortLib 'onnxruntime.dll'))) {
  $archive = Join-Path $depsDir 'ort.zip'
  try {
    Invoke-WebRequest "https://github.com/microsoft/onnxruntime/releases/download/v$ortVersion/onnxruntime-win-x64-$ortVersion.zip" -OutFile $archive -MaximumRetryCount 2 -RetryIntervalSec 15
    Expand-Archive $archive -DestinationPath $depsDir -Force
  } catch {
    # GitHub release downloads can answer 504 for long stretches. Microsoft
    # publishes the same build on NuGet; its win-x64 native folder holds the
    # onnxruntime.dll and onnxruntime.lib this build needs.
    Write-Warning "GitHub download of ONNX Runtime failed ($($_.Exception.Message)); using NuGet."
    $package = Join-Path $depsDir 'ort-nuget.zip'
    Invoke-WebRequest "https://www.nuget.org/api/v2/package/Microsoft.ML.OnnxRuntime/$ortVersion" -OutFile $package -MaximumRetryCount 6 -RetryIntervalSec 20
    $unpacked = Join-Path $depsDir 'ort-nuget'
    Expand-Archive $package -DestinationPath $unpacked -Force
    New-Item -ItemType Directory -Path $ortLib -Force | Out-Null
    Copy-Item (Join-Path $unpacked 'runtimes/win-x64/native/*') $ortLib -Force
  }
  foreach ($file in @('onnxruntime.dll', 'onnxruntime.lib')) {
    if (-not (Test-Path (Join-Path $ortLib $file))) { throw "ONNX Runtime $file is missing from $ortLib." }
  }
}
$env:ORT_LIB_LOCATION = $ortLib
$env:ORT_PREFER_DYNAMIC_LINK = '1'
# Tauri fetches its NSIS installer tools from GitHub releases at the very end
# of the build, and those downloads can answer 504 for long stretches. Fetch
# them here instead, with retries and SourceForge (NSIS's official host) as a
# fallback, into the folder Tauri checks first; the workflow caches it.
# The names, folder layout and helper hash match tauri-bundler 2.9.4.
$tauriTools = Join-Path $env:LOCALAPPDATA 'tauri'
$nsisDir = Join-Path $tauriTools 'NSIS'
if (-not (Test-Path (Join-Path $nsisDir 'Bin/makensis.exe'))) {
  New-Item -ItemType Directory -Path $tauriTools -Force | Out-Null
  $nsisZip = Join-Path $tauriTools 'nsis-3.11.zip'
  $nsisSources = @(
    'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip',
    'https://downloads.sourceforge.net/project/nsis/NSIS%203/3.11/nsis-3.11.zip'
  )
  $nsisDownloaded = $false
  foreach ($url in $nsisSources) {
    try {
      Invoke-WebRequest $url -OutFile $nsisZip -MaximumRetryCount 4 -RetryIntervalSec 20
      $nsisDownloaded = $true
      break
    } catch {
      Write-Warning "NSIS download from $url failed: $($_.Exception.Message)"
    }
  }
  if (-not $nsisDownloaded) { throw 'Could not download NSIS.' }
  $extracted = Join-Path $tauriTools 'nsis-3.11'
  if (Test-Path $extracted) { Remove-Item $extracted -Recurse -Force }
  Expand-Archive $nsisZip -DestinationPath $tauriTools -Force
  if (Test-Path $nsisDir) { Remove-Item $nsisDir -Recurse -Force }
  Rename-Item $extracted 'NSIS'
  Remove-Item $nsisZip -Force
}
$tauriUtils = Join-Path $nsisDir 'Plugins/x86-unicode/additional/nsis_tauri_utils.dll'
$tauriUtilsSha1 = '75197FEE3C6A814FE035788D1C34EAD39349B860'
if (-not (Test-Path $tauriUtils) -or (Get-FileHash $tauriUtils -Algorithm SHA1).Hash -ne $tauriUtilsSha1) {
  New-Item -ItemType Directory -Path (Split-Path $tauriUtils) -Force | Out-Null
  Invoke-WebRequest 'https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll' -OutFile $tauriUtils -MaximumRetryCount 10 -RetryIntervalSec 30
}

vcpkg install spirv-headers:x64-windows
if ($LASTEXITCODE -ne 0) { throw 'SPIRV-Headers installation failed.' }
$vcpkgRoot = if ($env:VCPKG_INSTALLATION_ROOT) { $env:VCPKG_INSTALLATION_ROOT } elseif ($env:VCPKG_ROOT) { $env:VCPKG_ROOT } else { Split-Path (Get-Command vcpkg).Source }
$prefix = (Join-Path $vcpkgRoot 'installed/x64-windows') -replace '\\', '/'
$env:CMAKE_PREFIX_PATH = if ($env:CMAKE_PREFIX_PATH) { "$prefix;$env:CMAKE_PREFIX_PATH" } else { $prefix }
