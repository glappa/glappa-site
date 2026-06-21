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
$Local       = "C:\Users\Prieb\glappa-site"
$LocalDocker = "$Local\_docker"
$Remote      = "~/glappa-site"

Write-Host ""
Write-Host "=== Sync + Restart VPS ===" -ForegroundColor Cyan
Write-Host "Local:  $Local"
Write-Host "Remote: ${VPS}:${Remote}"
Write-Host ""

# ── 1) Sync ─────────────────────────────────────────────────────────
if ($OnlyApp) {
    Write-Host "-> Only home/app.py + cookies/youtube.txt syncen..." -ForegroundColor Cyan
    scp -i $Key "${Local}\home\app.py" "${VPS}:${Remote}/home/"
    if (Test-Path "${LocalDocker}\cookies\youtube.txt") {
        scp -i $Key "${LocalDocker}\cookies\youtube.txt" "${VPS}:${Remote}/_docker/cookies/"
    }
} else {
    Write-Host "-> Komplettes Projekt syncen..." -ForegroundColor Cyan
    ssh -i $Key $VPS "mkdir -p ${Remote}/home ${Remote}/_docker/cookies ${Remote}/_docker/docker ${Remote}/_docker/caddy ${Remote}/_docker/searxng"

    # Build/Container-Files in _docker/
    scp -i $Key `
        "${LocalDocker}\Dockerfile" `
        "${LocalDocker}\docker-compose.yml" `
        "${LocalDocker}\docker-compose.vps.yml" `
        "${LocalDocker}\requirements.txt" `
        "${LocalDocker}\vps-deploy.sh" `
        "${LocalDocker}\vps-search-setup.sh" `
        "${LocalDocker}\restart.sh" `
        "${LocalDocker}\logs.sh" `
        "${VPS}:${Remote}/_docker/"
    scp -i $Key "${LocalDocker}\docker\*" "${VPS}:${Remote}/_docker/docker/"

    # Caddy + SearXNG-Config (search.glappa.de)
    if (Test-Path "${LocalDocker}\caddy\Caddyfile") {
        scp -i $Key "${LocalDocker}\caddy\Caddyfile" "${VPS}:${Remote}/_docker/caddy/"
    }
    # settings.yml NIE ueberschreiben wenn auf VPS schon ein secret_key drin ist.
    # Erstdeploy: einmal manuell scp'en (siehe _docker/SEARXNG_SETUP.md).
    ssh -i $Key $VPS "test -f ${Remote}/_docker/searxng/settings.yml" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "-> searxng/settings.yml fehlt auf VPS -> einmaliges initiales scp" -ForegroundColor Yellow
        scp -i $Key "${LocalDocker}\searxng\settings.yml" "${VPS}:${Remote}/_docker/searxng/"
        Write-Host "   WICHTIG: secret_key in settings.yml auf dem VPS ersetzen (siehe SEARXNG_SETUP.md)" -ForegroundColor Yellow
    } else {
        Write-Host "-> searxng/settings.yml existiert auf VPS, nicht ueberschrieben" -ForegroundColor DarkGray
    }

    # .dockerignore liegt im Projekt-Root (Build-Context)
    scp -i $Key "${Local}\.dockerignore" "${VPS}:${Remote}/"

    # Application files
    scp -i $Key "${Local}\home\app.py" "${VPS}:${Remote}/home/"

    # Cookies (falls vorhanden)
    if (Test-Path "${LocalDocker}\cookies\youtube.txt") {
        scp -i $Key "${LocalDocker}\cookies\youtube.txt" "${VPS}:${Remote}/_docker/cookies/"
    }
}
Write-Host "OK Sync fertig" -ForegroundColor Green
Write-Host ""

# ── 2) Restart auf VPS triggern + Logs streamen ─────────────────────
$flags = if ($NoBuild) { "--no-build" } else { "" }
# restart.sh + docker-compose.vps.yml liegen jetzt in _docker/
$cmd = "cd ~/glappa-site/_docker && chmod +x restart.sh && bash restart.sh --vps $flags"

Write-Host "-> Triggere restart.sh auf VPS..." -ForegroundColor Cyan
Write-Host ""

ssh -i $Key -t $VPS $cmd
