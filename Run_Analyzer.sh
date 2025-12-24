#!/bin/bash

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================================"
echo "       INSTAGRAM GIVEAWAY ANALYZER (WEB)"
echo "========================================================"
echo ""
echo "Starting local server..."
echo ""

cd "$PROJECT_DIR"

# Try to open the browser (works on macOS and most Linux distros)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:3000
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:3000 2>/dev/null || echo "Please open http://localhost:3000 in your browser."
fi

# Start the server
npm run serve
