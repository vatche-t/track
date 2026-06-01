$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$link = Join-Path $env:TEMP "productivity-tracker-vite-link"

if (Test-Path $link) {
  $item = Get-Item $link -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
    throw "Cannot create Vite dev link because '$link' already exists and is not a junction."
  }

  cmd /c rmdir "$link" | Out-Null
}

cmd /c mklink /J "$link" "$root" | Out-Null
Set-Location $link

& ".\node_modules\.bin\vite.cmd" --host 127.0.0.1 @args
