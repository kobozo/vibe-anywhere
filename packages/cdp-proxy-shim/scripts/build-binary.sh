#!/bin/bash
set -e

echo "======================================"
echo "CDP Proxy Shim Binary Builder"
echo "======================================"
echo ""

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"
BINARY_NAME="cdp-shim"
SEA_CONFIG="$PROJECT_DIR/sea-config.json"

cd "$PROJECT_DIR"

# Step 1: Clean previous builds
echo "[1/8] Cleaning previous builds..."
rm -rf "$DIST_DIR/sea-prep.blob" "$DIST_DIR/$BINARY_NAME"

# Step 2: Ensure dist directory exists
echo "[2/8] Creating dist directory..."
mkdir -p "$DIST_DIR"

# Step 3: Bundle code with esbuild
echo "[3/8] Bundling code with esbuild..."
npm run bundle:code

# Verify bundle was created
if [ ! -f "$DIST_DIR/cdp-shim-bundled.js" ]; then
  echo "Error: Bundle creation failed"
  exit 1
fi

BUNDLE_SIZE=$(du -h "$DIST_DIR/cdp-shim-bundled.js" | cut -f1)
echo "   Bundle size: $BUNDLE_SIZE"

# Step 4: Generate SEA preparation blob
echo "[4/8] Generating SEA preparation blob..."
node --experimental-sea-config "$SEA_CONFIG"

# Verify blob was created
if [ ! -f "sea-prep.blob" ]; then
  echo "Error: SEA blob generation failed"
  exit 1
fi

BLOB_SIZE=$(du -h sea-prep.blob | cut -f1)
echo "   Blob size: $BLOB_SIZE"

# Step 5: Copy Node.js binary
echo "[5/8] Copying Node.js binary..."
NODE_PATH=$(command -v node)
if [ -z "$NODE_PATH" ]; then
  echo "Error: node binary not found in PATH"
  exit 1
fi

cp "$NODE_PATH" "$DIST_DIR/$BINARY_NAME"

# Step 6: Remove code signature (macOS only)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "[6/8] Removing code signature (macOS)..."
  codesign --remove-signature "$DIST_DIR/$BINARY_NAME" 2>/dev/null || true
else
  echo "[6/8] Skipping code signature removal (not macOS)..."
fi

# Step 7: Inject SEA blob into binary
echo "[7/8] Injecting application into binary..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  npx postject "$DIST_DIR/$BINARY_NAME" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA
else
  npx postject "$DIST_DIR/$BINARY_NAME" NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
fi

# Make executable
chmod +x "$DIST_DIR/$BINARY_NAME"

# Cleanup blob
rm sea-prep.blob

# Step 8: Test binary
echo "[8/8] Testing binary..."
VERSION_OUTPUT=$("$DIST_DIR/$BINARY_NAME" --version 2>&1 || true)
if [ -z "$VERSION_OUTPUT" ]; then
  echo "Warning: Binary test produced no output (this may be normal if --version not implemented)"
fi

if [ -n "$VERSION_OUTPUT" ]; then
  echo "   Version check: $VERSION_OUTPUT"
fi

# Final stats
BINARY_SIZE=$(du -h "$DIST_DIR/$BINARY_NAME" | cut -f1)
echo ""
echo "======================================"
echo "Build complete!"
echo "======================================"
echo "Binary: $DIST_DIR/$BINARY_NAME"
echo "Size: $BINARY_SIZE"
echo ""
