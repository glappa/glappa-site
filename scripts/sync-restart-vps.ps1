# sync-restart-vps.ps1 — Code-Changes nach VPS pushen + Container neu starten + Logs
#
# Aufruf:
#   .\sync-restart-vps.ps1                  # full sync + rebuild + logs
#   .\sync-restart-vps.ps1 -NoBuild         # nur restart, kein rebuild (schneller wenn nur Static-Files geaendert)
#   .\sync-restart-vps.ps1 -OnlyApp         # nur home/app.py + cookies syncen (typisch nach Code-Tweaks)

param(
    [switch]$NoBuild,
    [switch]$OnlyApp,
    [string]$VPS = "glappa@45.142.115.252",
    [string]$Key = "$env:USERPROFILE\.ssh\glappa_vps_ed25519"
)

$ErrorActionPreference = "Stop"
$Local = "C:\Users\Prieb\glappa-site"
$Remote = "~/glappa-site"

Write-Host ""
Write-Host "=== Sync + Restart VPS ===" -ForegroundColor Cyan
Write-Host "Local:  $Local"
Write-Host "Remote: ${VPS}:${Remote}"
Write-Host ""

# ── 1) Sync ─────────────────────────────────────────────────────────
if ($OnlyApp) {
    Write-Host "→ Only app.py + cookies/youtube.txt syncen..." -ForegroundColor Cyan
    scp -i $Key "${Local}\home\app.py" "${VPS}:${Remote}/home/"
    if (Test-Path "${Local}\cookies\youtube.txt") {
        scp -i $Key "${Local}\cookies\youtube.txt" "${VPS}:${Remote}/cookies/"
    }
} else {
    Write-Host "→ Komplettes Projekt syncen..." -ForegroundColor Cyan
    ssh -i $Key $VPS "mkdir -p ${Remote}/home ${Remote}/cookies ${Remote}/docker ${Remote}/scripts"

    scp -i $Key `
        "${Local}\Dockerfile" `
        "${Local}\docker-compose.yml" `
        "${Local}\docker-compose.vps.yml" `
        "${Local}\.dockerignore" `
        "${Local}\requirements.txt" `
        "${Local}\restart.sh" `
        "${VPS}:${Remote}/"

    # Deploy-Skripte leben jetzt in scripts/
    scp -i $Key "${Local}\scripts\vps-deploy.sh" "${VPS}:${Remote}/scripts/"
    scp -i $Key "${Local}\docker\*" "${VPS}:${Remote}/docker/"
    scp -i $Key "${Local}\home\app.py" "${VPS}:${Remote}/home/"
    if (Test-Path "${Local}\cookies\youtube.txt") {
        scp -i $Key "${Local}\cookies\youtube.txt" "${VPS}:${Remote}/cookies/"
    }
}
Write-Host "✓ Sync fertig" -ForegroundColor Green
Write-Host ""

# ── 2) Restart auf VPS triggern + Logs streamen ─────────────────────
$flags = if ($NoBuild) { "--no-build" } else { "" }
$cmd = "cd ~/glappa-site && chmod +x restart.sh && bash restart.sh --vps $flags"

Write-Host "→ Triggere restart.sh auf VPS..." -ForegroundColor Cyan
Write-Host ""

# ssh -t damit Logs interaktiv durchkommen, Ctrl+C bricht nur Logs ab (Container laeuft weiter)
ssh -i $Key -t $VPS $cmd
