#!/bin/bash
set -e

echo "======================================"
echo "Chrome Bridge Binary Builder"
echo "======================================"

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Create build directory
BUILD_DIR="$SCRIPT_DIR/chrome-bridge-build"
DIST_DIR="$SCRIPT_DIR/chrome-bridge-dist"

echo "[1/6] Cleaning previous builds..."
rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

echo "[2/6] Bundling code with esbuild..."
npx esbuild chrome-bridge.js \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$BUILD_DIR/chrome-bridge-bundled.js" \
  --external:node:* \
  --minify \
  --sourcemap

BUNDLE_SIZE=$(du -h "$BUILD_DIR/chrome-bridge-bundled.js" | cut -f1)
echo "   Bundle size: $BUNDLE_SIZE"

# Function to build binary for a platform
build_binary() {
  local platform=$1
  local arch=$2
  local node_bin=$3
  local output_name=$4

  echo "Building for ${platform}-${arch}..."

  # Generate SEA config
  cat > "$BUILD_DIR/sea-config.json" <<EOF
{
  "main": "$BUILD_DIR/chrome-bridge-bundled.js",
  "output": "$BUILD_DIR/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true
}
EOF

  # Generate SEA blob
  node --experimental-sea-config "$BUILD_DIR/sea-config.json"

  # Copy appropriate Node.js binary
  if [ -f "$node_bin" ]; then
    cp "$node_bin" "$BUILD_DIR/$output_name"

    # Inject SEA blob
    npx postject "$BUILD_DIR/$output_name" NODE_SEA_BLOB "$BUILD_DIR/sea-prep.blob" \
      --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
      ${platform:+--macho-segment-name NODE_SEA}

    # Make executable
    chmod +x "$BUILD_DIR/$output_name"

    # Move to dist
    mv "$BUILD_DIR/$output_name" "$DIST_DIR/"

    BINARY_SIZE=$(du -h "$DIST_DIR/$output_name" | cut -f1)
    echo "   ✓ $output_name created ($BINARY_SIZE)"
  else
    echo "   ⚠ Skipping $platform-$arch (Node.js binary not available)"
  fi
}

echo "[3/6] Building Linux binary..."
build_binary "linux" "x64" "$(which node)" "chrome-bridge-linux"

echo "[4/6] Building MacOS binary..."
# For Mac, we need a Mac Node.js binary - if running on Linux, we can't build Mac binaries easily
if [ "$(uname)" = "Darwin" ]; then
  build_binary "darwin" "x64" "$(which node)" "chrome-bridge-macos"
else
  echo "   ⚠ Skipping MacOS binary (requires building on MacOS or using node-sea-packager)"
fi

echo "[5/6] Building Windows binary..."
# For Windows, we need a Windows Node.js binary - skip for now
echo "   ⚠ Skipping Windows binary (requires node.exe from Windows or using node-sea-packager)"
echo "   💡 Windows users can use: node chrome-bridge.js"

echo "[6/6] Creating download archive..."
cd "$DIST_DIR"
if ls chrome-bridge-* 1> /dev/null 2>&1; then
  tar -czf chrome-bridge-binaries.tar.gz chrome-bridge-*
  echo "   ✓ Archive created: chrome-bridge-binaries.tar.gz"
fi

echo ""
echo "======================================"
echo "Build Complete!"
echo "======================================"
echo ""
echo "Available binaries:"
ls -lh "$DIST_DIR"/chrome-bridge-* 2>/dev/null || echo "  (none - use node chrome-bridge.js)"
echo ""
echo "To run:"
echo "  Linux:   ./chrome-bridge-linux"
echo "  MacOS:   ./chrome-bridge-macos"
echo "  Windows: node chrome-bridge.js"
echo ""
