#!/bin/bash

# Build script for session-hub CLI
# Creates a standalone executable

set -e

echo "Building session-hub CLI..."

# Build TypeScript
npm run build

# Make the output executable
chmod +x dist/index.js

# Create a wrapper script that uses the Node.js binary
cat > dist/session-hub << 'EOF'
#!/usr/bin/env node
require('./index.js');
EOF

chmod +x dist/session-hub

echo "✓ Build complete: dist/session-hub"
