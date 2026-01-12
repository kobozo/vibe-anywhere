#!/bin/bash
# Debug script for CLI installation issues
# Run this inside the container: bash debug-cli.sh

echo "=== Checking agent directory ==="
ls -la /opt/session-hub-agent/cli/ 2>&1

echo ""
echo "=== Checking if session-hub CLI exists ==="
ls -la /usr/local/bin/session-hub 2>&1

echo ""
echo "=== Checking agent version ==="
cat /opt/session-hub-agent/package.json | grep version

echo ""
echo "=== Checking recent agent logs for CLI ==="
sudo journalctl -u session-hub-agent -n 200 --no-pager | grep -iE 'cli|install' | tail -20

echo ""
echo "=== Checking PATH ==="
echo $PATH

echo ""
echo "=== Checking if CLI file is executable ==="
if [ -f /opt/session-hub-agent/cli/session-hub ]; then
    ls -la /opt/session-hub-agent/cli/session-hub
    file /opt/session-hub-agent/cli/session-hub
else
    echo "CLI source file not found in agent directory"
fi

echo ""
echo "=== Trying to manually install CLI ==="
if [ -f /opt/session-hub-agent/cli/session-hub ]; then
    sudo cp /opt/session-hub-agent/cli/session-hub /usr/local/bin/session-hub
    sudo chmod +x /usr/local/bin/session-hub
    echo "Manual install complete, testing..."
    /usr/local/bin/session-hub --version 2>&1
else
    echo "Cannot install: source file missing"
fi
