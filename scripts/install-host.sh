#!/bin/bash
set -e

HOST_NAME="com.tabclaude.host"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOST_DIR="$PROJECT_DIR/native-host"
HOST_SCRIPT="$HOST_DIR/host.js"

# Determine Chrome NativeMessagingHosts directory
case "$(uname -s)" in
  Darwin)
    TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  Linux)
    TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "Windows: use the registry-based installer or manually register."
    echo "Registry key: HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\$HOST_NAME"
    exit 1
    ;;
  *)
    echo "Unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

mkdir -p "$TARGET_DIR"

# Resolve node path
NODE_PATH="$(which node)"
if [ -z "$NODE_PATH" ]; then
  echo "Error: Node.js not found. Install it first."
  exit 1
fi

# Prompt for extension ID
if [ -z "$1" ]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo ""
  echo "To find your extension ID:"
  echo "  1. Load the extension at chrome://extensions (Developer mode)"
  echo "  2. Copy the ID shown under the extension name"
  exit 1
fi

EXTENSION_ID="$1"

# Create wrapper script (to ensure node is found)
WRAPPER="$HOST_DIR/run-host.sh"
cat > "$WRAPPER" << EOF
#!/bin/bash
exec "$NODE_PATH" "$HOST_SCRIPT"
EOF
chmod +x "$WRAPPER"

# Write native messaging manifest
MANIFEST="$TARGET_DIR/$HOST_NAME.json"
cat > "$MANIFEST" << EOF
{
  "name": "$HOST_NAME",
  "description": "Tabclaude — AI Tab Manager Native Messaging Host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo "Native messaging host installed successfully."
echo "  Manifest: $MANIFEST"
echo "  Host:     $WRAPPER"
echo ""
echo "Restart Chrome to pick up the changes."
