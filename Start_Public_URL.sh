#!/bin/bash

echo "---------------------------------------------------------"
echo "  Instagram Analyzer: Public URL Generator"
echo "---------------------------------------------------------"
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null
then
    echo "[!] Cloudflared is not installed."
    echo ""
    echo "To use this, please install cloudflared:"
    echo "  macOS: brew install cloudflared"
    echo "  Linux: Use your package manager (apt/yum/etc)"
    echo "  More info: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/installation/"
    exit
fi

echo "[*] Starting Cloudflare Tunnel..."
echo "[*] NOTE: You may see 'ERR Cannot determine default origin certificate'."
echo "[*] THIS IS NORMAL. Please wait for the 'trycloudflare.com' link to appear."
echo ""

cloudflared tunnel --url http://127.0.0.1:3000
