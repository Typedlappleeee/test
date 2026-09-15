@echo off
REM ===========================================================
REM  Talent Deck - demarrage automatique
REM ===========================================================
REM  Pour qu'il se lance tout seul a chaque allumage du PC :
REM    1. Touche Windows + R
REM    2. Tape :  shell:startup    puis Entree
REM    3. Glisse un RACCOURCI vers ce fichier dans le dossier
REM       qui s'ouvre (clic droit sur demarrer.bat > Creer un
REM       raccourci, puis deplace le raccourci).
REM
REM  A chaque ouverture de session, le worker rattrapera ce qui
REM  a ete publie pendant que le PC etait eteint, puis restera
REM  a l'ecoute.
REM
REM  Pour l'arreter : ferme simplement cette fenetre.
REM ===========================================================

cd /d "%~dp0"
title Talent Deck - ne ferme pas cette fenetre

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js est introuvable.
  echo   Installe-le depuis https://nodejs.org ^(bouton LTS^), puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   Premiere execution : installation des dependances...
  echo.
  call npm install
)

if not exist .env (
  echo.
  echo   Aucune session Telegram enregistree.
  echo   Lance d'abord :  npm run login
  echo.
  pause
  exit /b 1
)

echo.
echo   Talent Deck demarre. Ouvre http://localhost:8787
echo   Laisse cette fenetre ouverte : c'est elle qui capte les annonces.
echo.

REM --backfill rattrape l'historique de chaque salon avant d'ecouter,
REM pour recuperer ce qui est paru pendant que le PC etait eteint.
node src\standalone.mjs --backfill

echo.
echo   Le worker s'est arrete. Appuie sur une touche pour fermer.
pause >nul
