#!/bin/bash
# Build the Bun backend as a standalone executable

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/apps/backend"
BUNDLE_DIR="$SCRIPT_DIR/apps/desktop/src-tauri/bundle/external"

# Get the target triple (Rust convention)
if [ -z "$TARGET" ]; then
    if command -v rustc &> /dev/null; then
        TARGET=$(rustc -Vv | grep host | cut -d' ' -f2)
    else
        # Fallback for common platforms
        case "$(uname -s)" in
            Linux)
                if [ "$(uname -m)" = "aarch64" ]; then
                    TARGET="aarch64-unknown-linux-gnu"
                else
                    TARGET="x86_64-unknown-linux-gnu"
                fi
                ;;
            Darwin)
                if [ "$(uname -m)" = "arm64" ]; then
                    TARGET="aarch64-apple-darwin"
                else
                    TARGET="x86_64-apple-darwin"
                fi
                ;;
            MINGW* | MSYS*)
                TARGET="x86_64-pc-windows-msvc"
                ;;
            *)
                TARGET="x86_64-unknown-linux-gnu"
                ;;
        esac
    fi
fi

echo "Building sidecar for target: $TARGET"

# Create bundle directory if it doesn't exist
mkdir -p "$BUNDLE_DIR"

# Compile the backend to a standalone binary
echo "Compiling backend to standalone binary..."
cd "$BACKEND_DIR"
bun build --compile --outfile="$BUNDLE_DIR/bun-backend-$TARGET" src/index.ts

echo "Sidecar binary created: $BUNDLE_DIR/bun-backend-$TARGET"
chmod +x "$BUNDLE_DIR/bun-backend-$TARGET"

echo "Sidecar build complete!"
