#!/bin/bash

# Build script for vibe-anywhere CLI
# Creates a standalone executable

set -e

echo "Building vibe-anywhere CLI..."

# Build TypeScript
npm run build

# Make the output executable
chmod +x dist/index.js

# Create a wrapper script that uses the Node.js binary
cat > dist/vibe-anywhere << 'EOF'
#!/usr/bin/env node
require('./index.js');
EOF

chmod +x dist/vibe-anywhere

echo "✓ Build complete: dist/vibe-anywhere"
