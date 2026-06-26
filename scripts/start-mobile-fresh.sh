#!/bin/bash
# Visioryx - Complete Mobile Dev Reset & Start
# Run this script to kill all processes and start fresh

set -e

echo "============================================"
echo "🔄 Visioryx Mobile - Fresh Start"
echo "============================================"

# Kill ALL node processes (Metro, expo, etc)
echo "📍 Killing all node processes..."
pkill -f "node.*expo" 2>/dev/null || true
pkill -f "node.*metro" 2>/dev/null || true
pkill -f "ngrok" 2>/dev/null || true
sleep 2

# Kill anything on our port
echo "📍 Clearing port 8081..."
lsof -ti :8081 | xargs kill -9 2>/dev/null || true

# Start fresh ngrok
echo "🌐 Starting ngrok..."
ngrok http 8081 > /tmp/ngrok.log 2>&1 &
sleep 4

# Get ngrok URL
NGROK_URL=$(curl -s localhost:4040/api/tunnels 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'] if d.get('tunnels') else 'ERROR')" 2>/dev/null)

if [ "$NGROK_URL" = "ERROR" ] || [ -z "$NGROK_URL" ]; then
    echo "❌ ngrok failed to start"
    cat /tmp/ngrok.log
    exit 1
fi

echo "✅ ngrok: $NGROK_URL"

# Clean mobile cache
cd /Users/devendervutukuru/Desktop/My\ Projects/Visioryx/mobile
rm -rf node_modules/.cache 2>/dev/null || true

# Start expo
echo "📦 Starting Expo..."
npx expo start --port 8081 --clear > /tmp/expo.log 2>&1 &
EXPO_PID=$!
sleep 10

echo ""
echo "============================================"
echo "🎉 READY - Use these URLs in Expo Go:"
echo ""
echo "  1. Local:  exp://localhost:8081"
echo "  2. Remote: exp://$(echo $NGROK_URL | sed 's|https://||')"
echo ""
echo "Or use the QR code from terminal"
echo "============================================"

# Wait for user to stop
wait $EXPO_PID