#!/bin/bash
# Installs Nour AI on this Mac. Safe to run again to update.
cd "$(dirname "$0")" || exit 1
HERE="$(pwd)"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
OJ="${OPENJARVIS_HOME:-$HOME/.openjarvis}"
REPO="https://github.com/alioumahmadou05-prog/OpenJarvis.git"
BRANCH="feat/nour-assistant"
fail() { echo; echo "❌ $1"; echo "Copy the lines above and send them to Claude for help."; read -r -p "Press Enter to close…" _; exit 1; }

echo "=============================="
echo "   Installing Nour AI"
echo "=============================="

echo; echo "Step 1/4 · OpenJarvis (Nour's engine) and Ollama (Nour's brain)"
if [ -x "$OJ/.venv/bin/jarvis" ] && [ -d "$OJ/src/.git" ]; then
  echo "Already installed ✓"
else
  echo "Installing… this takes a few minutes and downloads a small AI model."
  curl -fsSL https://open-jarvis.github.io/OpenJarvis/install.sh | bash -s -- --no-analytics || fail "The OpenJarvis installer stopped."
fi
[ -d "$OJ/src/.git" ] || fail "OpenJarvis files weren't found in $OJ/src."

echo; echo "Step 2/4 · Getting the Nour AI version"
cd "$OJ/src" || fail "Can't open $OJ/src"
git remote get-url nour >/dev/null 2>&1 || git remote add nour "$REPO"
git fetch --quiet nour "$BRANCH" || fail "Couldn't download Nour AI from GitHub. Check your internet connection."
git checkout --quiet -B nour-ai "nour/$BRANCH" || fail "Couldn't switch to the Nour AI version."
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
"$UV" pip install --quiet --python "$OJ/.venv/bin/python" -e . || fail "Couldn't install Nour AI's Python parts."
echo "Done ✓"

echo; echo "Step 3/4 · Installing the Nour interface"
rm -rf "$OJ/src/src/openjarvis/server/static"
cp -R "$HERE/payload/static" "$OJ/src/src/openjarvis/server/static" || fail "Couldn't copy the interface."
echo "Done ✓"

echo; echo "Step 4/4 · Adding Nour AI to your Applications"
APPDIR="$HOME/Applications"; mkdir -p "$APPDIR"
rm -rf "$APPDIR/Nour AI.app"
cp -R "$HERE/Nour AI.app" "$APPDIR/" || fail "Couldn't copy the app."
chmod +x "$APPDIR/Nour AI.app/Contents/MacOS/NourAI"
xattr -cr "$APPDIR/Nour AI.app" 2>/dev/null
# restart a server that may be running the old version
pkill -f "jarvis serve" 2>/dev/null  # any older OpenJarvis server, so the Nour version loads
echo "Done ✓"

echo; echo "✅ Nour AI is installed in: $APPDIR"
echo "Tip: open Finder → Go → Home → Applications, and drag Nour AI to your Dock."
echo "Opening Nour AI now…"
open "$APPDIR/Nour AI.app"
open "$APPDIR"
sleep 2
