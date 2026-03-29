#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec /opt/homebrew/bin/node "$DIR/host.js" 2>>/tmp/tabclaude-host.log
