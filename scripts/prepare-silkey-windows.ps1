$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
  throw 'This build targets Windows x64.'
}
$repoRoot = Split-Path -Parent $PSScriptRoot
if ($env:VULKAN_SDK) { $env:PATH = "$env:VULKAN_SDK\Bin;$env:PATH" }
foreach ($tool in @('bun', 'cargo', 'cmake', 'glslc', 'vcpkg')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Missing $tool. See SILKEY-README.md or use the GitHub Windows workflow."
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
$env:HANDY_VC_REDIST_DIRS = "$($crt.FullName);$($omp.FullName)"

# Upstream's baseline ONNX runtime avoids an AVX2 startup requirement.
$depsDir = Join-Path $repoRoot '.silkey-build'
New-Item -ItemType Directory -Path $depsDir -Force | Out-Null
$ortVersion = '1.24.2'
$ortLib = Join-Path $depsDir "onnxruntime-win-x64-$ortVersion/lib"
if (-not (Test-Path (Join-Path $ortLib 'onnxruntime.dll'))) {
  $archive = Join-Path $depsDir 'ort.zip'
  Invoke-WebRequest "https://github.com/microsoft/onnxruntime/releases/download/v$ortVersion/onnxruntime-win-x64-$ortVersion.zip" -OutFile $archive
  Expand-Archive $archive -DestinationPath $depsDir -Force
}
$env:ORT_LIB_LOCATION = $ortLib
$env:ORT_PREFER_DYNAMIC_LINK = '1'
vcpkg install spirv-headers:x64-windows
if ($LASTEXITCODE -ne 0) { throw 'SPIRV-Headers installation failed.' }
$vcpkgRoot = if ($env:VCPKG_INSTALLATION_ROOT) { $env:VCPKG_INSTALLATION_ROOT } elseif ($env:VCPKG_ROOT) { $env:VCPKG_ROOT } else { Split-Path (Get-Command vcpkg).Source }
$prefix = (Join-Path $vcpkgRoot 'installed/x64-windows') -replace '\\', '/'
$env:CMAKE_PREFIX_PATH = if ($env:CMAKE_PREFIX_PATH) { "$prefix;$env:CMAKE_PREFIX_PATH" } else { $prefix }
