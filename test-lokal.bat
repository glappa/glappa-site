@echo off
rem === Claudes Aenderungen lokal testen - der eigene Ordner bleibt unveraendert ===
rem Nimmt den neuesten glappa64-*.patch aus dem Download-Ordner (oder die Datei, die man auf dieses Skript zieht),
rem baut damit eine frische Testkopie in ..\glappa-test, startet einen Server (nur dieser Rechner, Port 8097)
rem und oeffnet das Spiel im Browser. Fenster schliessen = Server aus.
setlocal
cd /d "%~dp0"
set "PATCH=%~1"
rem echter Download-Ordner (kann verlegt sein, z. B. N:\Downloads)
set "DL="
for /f "delims=" %%d in ('powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path"') do set "DL=%%d"
if not defined DL set "DL=%USERPROFILE%\Downloads"
if not defined PATCH for /f "delims=" %%f in ('dir /b /o-d "%DL%\glappa64-*.patch" 2^>nul') do if not defined PATCH set "PATCH=%DL%\%%f"
if not defined PATCH (echo Kein glappa64-*.patch im Download-Ordner gefunden - den Patch einfach auf dieses Skript ziehen. & pause & exit /b 1)
echo Patch: %PATCH%
rem Testkopie auf dem Stand, fuer den der Patch gebaut ist (erste Zeile "Basis: <commit>"), sonst HEAD
set "BASE=HEAD"
for /f "tokens=2" %%b in ('findstr /b /c:"Basis: " "%PATCH%"') do (git cat-file -e %%b 2>nul && set "BASE=%%b")
set "TEST=%~dp0..\glappa-test"
git worktree remove --force "%TEST%" >nul 2>&1
if exist "%TEST%" rmdir /s /q "%TEST%"
git worktree prune
git worktree add --detach "%TEST%" %BASE% || (pause & exit /b 1)
git -C "%TEST%" apply --whitespace=nowarn "%PATCH%" || (echo Patch passt nicht auf diesen Stand - bitte Claude Bescheid sagen. & pause & exit /b 1)
set "PY=python"
where python >nul 2>&1 || set "PY=py"
set "URL=http://localhost:8097/secret/glappa64.html?debug"
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process '%URL%'"
echo.
echo Spiel: %URL%
echo Fenster schliessen = Server aus.
cd /d "%TEST%"
%PY% -c "import http.server as s;H=type('H',(s.SimpleHTTPRequestHandler,),{'end_headers':lambda self:(self.send_header('Cache-Control','no-store'),s.SimpleHTTPRequestHandler.end_headers(self))[1]});s.ThreadingHTTPServer(('127.0.0.1',8097),H).serve_forever()"
pause
