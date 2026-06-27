#!/bin/bash
# Download Stitch project screens - DJ Pro Master Design System
# Project ID: 13268962760631203709

set -e

PROJECT_ID="13268962760631203709"
BASE_URL="https://stitch.withgoogle.com"
OUTPUT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Create subdirectories
mkdir -p "$OUTPUT_DIR/images"
mkdir -p "$OUTPUT_DIR/code"

# Screen definitions: slug|id|name
SCREENS=(
  "track-library-overlay|3b41033f23f24b92af89a3f46087c360|Track Library Library Overlay"
  "track-library-optimized|e4046d084889498eaf9fb5e8715f8cf0|Track Library - Optimized Density"
  "smart-mix-dashboard|ed1acd70be11458b8566e1e0cc0ecb93|Smart Mix Pro Dashboard"
  "track-library-pro-grade|a269f82406304146a61242ed6581e928|Track Library - Pro Performance Grade"
  "eq-popup|278717ed9d7d4ce289f3917eabe789c8|EQ Popup"
  "mixing-interface|8edf883604ce47df9eadc7e308782553|Mixing Interface"
  "pro-mixing-optimized|a062af2d8a4d48c1b7531e061ba3c050|Pro Mixing Interface - Optimized"
  "dj-pro-master-pro|6f598ebf55b94d1db88da5887deb653e|DJ Pro Master - Professional Edition"
  "pro-eq-interface|9c75fdfaace6493b8d3c746db79d347e|Pro EQ Interface"
  "settings-modal|2c320563d2854f81bf460f97b53b2ee3|Settings Modal"
  "orientation-lock|595e83f1f6fe4512a772c1b7b8f9e077|Orientation Lock Overlay"
  "design-system|asset-stub-assets_e9150d8f54c9429c9e0fe95a2b462b2e|Design System"
  "orientation-polished|f2ede3311e32488ba5bfef4fef13a302|Orientation Lock - Polished"
  "auth-modal|a1a132e283c34b6dbbea81523cbab784|Auth Modal"
  "smart-mix-optimized|d36b53126f97400bb1d7ed49e6b2252d|Smart Mix Panel - Optimized"
  "smart-mix-panel|aa892dd54b4b4f54860398e8b72900c6|Smart Mix Panel"
)

echo "🎵 Downloading DJ Pro Master Design System screens from Stitch..."
echo "================================================================"
echo ""

# Try multiple URL patterns for images
download_image() {
  local slug="$1"
  local screen_id="$2"
  local name="$3"
  local success=false

  echo "📸 Downloading image: $name ($screen_id)"

  # Pattern 1: Direct preview image via Stitch CDN
  local url1="${BASE_URL}/api/project/${PROJECT_ID}/screen/${screen_id}/preview.png"
  if curl -fsSL -o "$OUTPUT_DIR/images/${slug}.png" "$url1" 2>/dev/null; then
    # Check if we got an actual image (not HTML)
    file_type=$(file -b "$OUTPUT_DIR/images/${slug}.png" 2>/dev/null || echo "unknown")
    if echo "$file_type" | grep -qi "image\|PNG\|JPEG"; then
      echo "   ✅ Downloaded via preview.png endpoint"
      success=true
    else
      rm -f "$OUTPUT_DIR/images/${slug}.png"
    fi
  fi

  # Pattern 2: Thumbnail via companion API
  if [ "$success" = false ]; then
    local url2="https://app-companion-430619.appspot.com/api/project/${PROJECT_ID}/screen/${screen_id}/thumbnail"
    if curl -fsSL -o "$OUTPUT_DIR/images/${slug}.png" "$url2" 2>/dev/null; then
      file_type=$(file -b "$OUTPUT_DIR/images/${slug}.png" 2>/dev/null || echo "unknown")
      if echo "$file_type" | grep -qi "image\|PNG\|JPEG"; then
        echo "   ✅ Downloaded via thumbnail endpoint"
        success=true
      else
        rm -f "$OUTPUT_DIR/images/${slug}.png"
      fi
    fi
  fi

  # Pattern 3: Preview via companion with format param
  if [ "$success" = false ]; then
    local url3="https://app-companion-430619.appspot.com/api/project/${PROJECT_ID}/screen/${screen_id}/preview?format=png"
    if curl -fsSL -o "$OUTPUT_DIR/images/${slug}.png" "$url3" 2>/dev/null; then
      file_type=$(file -b "$OUTPUT_DIR/images/${slug}.png" 2>/dev/null || echo "unknown")
      if echo "$file_type" | grep -qi "image\|PNG\|JPEG"; then
        echo "   ✅ Downloaded via preview?format=png endpoint"
        success=true
      else
        rm -f "$OUTPUT_DIR/images/${slug}.png"
      fi
    fi
  fi

  # Pattern 4: Image via stitch API
  if [ "$success" = false ]; then
    local url4="${BASE_URL}/api/project/${PROJECT_ID}/screen/${screen_id}/image"
    if curl -fsSL -o "$OUTPUT_DIR/images/${slug}.png" "$url4" 2>/dev/null; then
      file_type=$(file -b "$OUTPUT_DIR/images/${slug}.png" 2>/dev/null || echo "unknown")
      if echo "$file_type" | grep -qi "image\|PNG\|JPEG"; then
        echo "   ✅ Downloaded via image endpoint"
        success=true
      else
        rm -f "$OUTPUT_DIR/images/${slug}.png"
      fi
    fi
  fi

  # Pattern 5: Export image via stitch
  if [ "$success" = false ]; then
    local url5="${BASE_URL}/api/project/${PROJECT_ID}/screen/${screen_id}/export/image"
    if curl -fsSL -o "$OUTPUT_DIR/images/${slug}.png" "$url5" 2>/dev/null; then
      file_type=$(file -b "$OUTPUT_DIR/images/${slug}.png" 2>/dev/null || echo "unknown")
      if echo "$file_type" | grep -qi "image\|PNG\|JPEG"; then
        echo "   ✅ Downloaded via export/image endpoint"
        success=true
      else
        rm -f "$OUTPUT_DIR/images/${slug}.png"
      fi
    fi
  fi

  if [ "$success" = false ]; then
    echo "   ❌ Could not download image (all patterns failed)"
  fi
}

# Try to download code
download_code() {
  local slug="$1"
  local screen_id="$2"
  local name="$3"
  local success=false

  echo "💻 Downloading code: $name"

  # Pattern 1: Code via companion API
  local url1="https://app-companion-430619.appspot.com/api/project/${PROJECT_ID}/screen/${screen_id}/code"
  if curl -fsSL -o "$OUTPUT_DIR/code/${slug}.html" "$url1" 2>/dev/null; then
    file_size=$(wc -c < "$OUTPUT_DIR/code/${slug}.html" 2>/dev/null || echo "0")
    if [ "$file_size" -gt 100 ]; then
      echo "   ✅ Downloaded code ($file_size bytes)"
      success=true
    else
      rm -f "$OUTPUT_DIR/code/${slug}.html"
    fi
  fi

  # Pattern 2: Export code via stitch
  if [ "$success" = false ]; then
    local url2="${BASE_URL}/api/project/${PROJECT_ID}/screen/${screen_id}/export/code"
    if curl -fsSL -o "$OUTPUT_DIR/code/${slug}.html" "$url2" 2>/dev/null; then
      file_size=$(wc -c < "$OUTPUT_DIR/code/${slug}.html" 2>/dev/null || echo "0")
      if [ "$file_size" -gt 100 ]; then
        echo "   ✅ Downloaded code ($file_size bytes)"
        success=true
      else
        rm -f "$OUTPUT_DIR/code/${slug}.html"
      fi
    fi
  fi

  # Pattern 3: Code via stitch API
  if [ "$success" = false ]; then
    local url3="${BASE_URL}/api/project/${PROJECT_ID}/screen/${screen_id}/code"
    if curl -fsSL -o "$OUTPUT_DIR/code/${slug}.html" "$url3" 2>/dev/null; then
      file_size=$(wc -c < "$OUTPUT_DIR/code/${slug}.html" 2>/dev/null || echo "0")
      if [ "$file_size" -gt 100 ]; then
        echo "   ✅ Downloaded code ($file_size bytes)"
        success=true
      else
        rm -f "$OUTPUT_DIR/code/${slug}.html"
      fi
    fi
  fi

  if [ "$success" = false ]; then
    echo "   ❌ Could not download code (all patterns failed)"
  fi
}

# Process each screen
for screen_entry in "${SCREENS[@]}"; do
  IFS='|' read -r slug screen_id name <<< "$screen_entry"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎯 Processing: $name"
  echo "   ID: $screen_id"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  download_image "$slug" "$screen_id" "$name"
  download_code "$slug" "$screen_id" "$name"
done

echo ""
echo "================================================================"
echo "📊 Download Summary:"
echo "   Images: $(ls -1 "$OUTPUT_DIR/images/" 2>/dev/null | wc -l | tr -d ' ') files"
echo "   Code:   $(ls -1 "$OUTPUT_DIR/code/" 2>/dev/null | wc -l | tr -d ' ') files"
echo ""
echo "📁 Output directory: $OUTPUT_DIR"
echo "================================================================"
