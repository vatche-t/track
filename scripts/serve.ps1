$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Push-Location $projectRoot
try {
  & ".\node_modules\.bin\vite.cmd" build
  & ".\node_modules\.bin\vite.cmd" preview --host 127.0.0.1 @args
} finally {
  Pop-Location
}
