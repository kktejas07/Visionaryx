#!/bin/bash
# Visioryx - Mobile App Build Script
# Builds iOS and Android apps

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📱 Visioryx Mobile App Builder"
echo "=============================="

# Check for Expo
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Install Node.js first."
    exit 1
fi

# Parse arguments
PLATFORM="${1:-all}"
OUTPUT_DIR="$PROJECT_ROOT/mobile-builds"

mkdir -p "$OUTPUT_DIR"

build_android() {
    echo ""
    echo "🤖 Building Android APK..."
    echo "------------------------"
    
    cd "$PROJECT_ROOT/mobile"
    
    # Prebuild
    npx expo prebuild --platform android --clean
    
    # Build debug APK
    cd android
    ./gradlew assembleDebug
    
    # Copy output
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
        cp "$APK_PATH" "$OUTPUT_DIR/visioryx-android.apk"
        echo "✅ Android APK: $OUTPUT_DIR/visioryx-android.apk"
    else
        echo "❌ Android build failed"
    fi
}

build_ios() {
    echo ""
    echo "🍎 Building iOS..."
    echo "-----------------"
    
    cd "$PROJECT_ROOT/mobile"
    
    # Prebuild
    npx expo prebuild --platform ios --clean
    
    echo "⚠️  iOS build requires Xcode on macOS"
    echo "Open Xcode and build from: $PROJECT_ROOT/mobile/ios/"
    echo ""
    echo "Or use EAS (Expo Application Services):"
    echo "  npx eas login"
    echo "  npx eas build --platform ios"
}

echo ""
echo "Select platform:"
echo "  1) Android only"
echo "  2) iOS only"
echo "  3) Both"
echo ""

read -p "Enter choice [3]: " choice
choice="${choice:-3}"

case $choice in
    1)
        build_android
        ;;
    2)
        build_ios
        ;;
    3)
        build_android
        build_ios
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📦 Build outputs saved to: $OUTPUT_DIR"
echo ""
echo "To configure mobile app URLs in admin:"
echo "1. Upload APK/IPA to your CDN or cloud storage"
echo "2. Go to Settings > Mobile App in admin dashboard"
echo "3. Enter the download URLs and version"
