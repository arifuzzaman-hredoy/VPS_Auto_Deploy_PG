$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $PatchRoot
Write-Host "Applying TechTeam Deploy OS UI process fix..."
Copy-Item -Path (Join-Path $PatchRoot "files\*") -Destination $ProjectRoot -Recurse -Force
Write-Host "Done. Now run: npm run build"
