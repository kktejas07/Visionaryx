#!/bin/bash
# Visioryx - Complete Mobile Dev Server
# Usage: ./start-mobile.sh

set -e

PORT=8081

echo "🔄 Killing existing processes..."
pkill -f "ngrok" 2>/dev/null || true
lsof -ti :$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -f "node.*expo" 2>/dev/null || true
sleep 2

echo "🌐 Starting ngrok tunnel to port $PORT..."
ngrok http $PORT > /tmp/ngrok.log 2>&1 &
sleep 4

# Verify ngrok is working
NGROK_URL=$(curl -s localhost:4040/api/tunnels 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'] if d.get('tunnels') else 'NONE')" 2>/dev/null)

if [ "$NGROK_URL" = "NONE" ] || [ -z "$NGROK_URL" ]; then
    echo "❌ ngrok failed!"
    cat /tmp/ngrok.log
    exit 1
fi

echo "✅ Ngrok URL: $NGROK_URL"
echo "   Forwarding to localhost:$PORT"

echo ""
echo "📦 Starting Expo Metro on port $PORT..."
cd /Users/devendervutukuru/Desktop/My\ Projects/Visioryx/mobile
npx expo start --port $PORT --clear > /tmp/expo.log 2>&1 &
EXPO_PID=$!

sleep 8

# Check if Metro started
if lsof -ti :$PORT > /dev/null 2>&1; then
    echo "✅ Metro running on port $PORT"
else
    echo "❌ Metro failed to start"
    cat /tmp/expo.log
    exit 1
fi

echo ""
echo "=========================================="
echo "🎉 READY!"
echo ""
echo "📱 In Expo Go, scan QR code or enter:"
echo ""
echo "   exp://$(echo $NGROK_URL | sed 's|https://||')"
echo ""
echo "   OR use localhost if on same WiFi:"
echo "   exp://localhost:$PORT"
echo ""
echo "=========================================="
echo "Press Ctrl+C to stop"
echo ""

wait $EXPO_PID