#!/bin/bash

# build-sidecar.sh - Build Bun backend sidecar binary
# This script compiles the Bun backend into a standalone binary using bun build --compile
# and places it in src-tauri/bin/ with the correct target-triple naming
#
# Usage: ./scripts/build-sidecar.sh [backend-dir]
# Examples:
#   ./scripts/build-sidecar.sh               # Uses default backend location
#   ./scripts/build-sidecar.sh backend       # Uses backend/ directory
#   ./scripts/build-sidecar.sh apps/desktop/backend

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect platform and architecture
detect_target_triple() {
    local os kernel arch
    os=$(uname -s)
    kernel=$(uname -r)
    arch=$(uname -m)

    case "$os" in
        Linux)
            case "$arch" in
                x86_64)
                    echo "x86_64-unknown-linux-gnu"
                    ;;
                aarch64|arm64)
                    echo "aarch64-unknown-linux-gnu"
                    ;;
                armv7l)
                    echo "armv7-unknown-linux-gnueabihf"
                    ;;
                *)
                    echo "unknown-unknown-linux-gnu"
                    ;;
            esac
            ;;
        Darwin)
            case "$arch" in
                x86_64)
                    echo "x86_64-apple-darwin"
                    ;;
                arm64|aarch64)
                    echo "aarch64-apple-darwin"
                    ;;
                *)
                    echo "unknown-apple-darwin"
                    ;;
            esac
            ;;
        MINGW*|MSYS*|CYGWIN*)
            case "$arch" in
                x86_64)
                    echo "x86_64-pc-windows-msvc"
                    ;;
                i686)
                    echo "i686-pc-windows-msvc"
                    ;;
                *)
                    echo "unknown-pc-windows-msvc"
                    ;;
            esac
            ;;
        *)
            echo "unknown-unknown-unknown"
            ;;
    esac
}

echo -e "${BLUE}Building Bun backend sidecar...${NC}\n"

# Check if we're in the right directory
if [[ ! -d "apps/desktop" ]]; then
    echo -e "${RED}Error: Must run from project root (apps/desktop directory must exist)${NC}"
    exit 1
fi

# Determine backend directory
BACKEND_DIR="${1:-.}"
if [[ "$BACKEND_DIR" == "." ]]; then
    if [[ -d "backend" ]]; then
        BACKEND_DIR="backend"
    elif [[ -d "apps/desktop/backend" ]]; then
        BACKEND_DIR="apps/desktop/backend"
    fi
fi

# Validate backend directory
if [[ ! -d "$BACKEND_DIR" ]]; then
    echo -e "${RED}Error: Backend directory not found at: $BACKEND_DIR${NC}"
    echo -e "${YELLOW}Usage: ./scripts/build-sidecar.sh [backend-dir]${NC}"
    exit 1
fi

if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
    echo -e "${RED}Error: package.json not found in $BACKEND_DIR${NC}"
    exit 1
fi

# Detect target triple
TARGET_TRIPLE=$(detect_target_triple)
echo -e "${BLUE}Detected target triple: ${GREEN}$TARGET_TRIPLE${NC}\n"

# Create output directory
OUTPUT_DIR="apps/desktop/src-tauri/bin"
mkdir -p "$OUTPUT_DIR"

# Determine output filename
BINARY_NAME="bun-backend-$TARGET_TRIPLE"
if [[ $TARGET_TRIPLE == *"windows"* ]]; then
    BINARY_NAME="$BINARY_NAME.exe"
fi

OUTPUT_PATH="$OUTPUT_DIR/$BINARY_NAME"

echo -e "${YELLOW}Building backend...${NC}"
echo -e "  Backend dir: $BACKEND_DIR"
echo -e "  Output: $OUTPUT_PATH"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: bun is not installed or not in PATH${NC}"
    exit 1
fi

# Build the backend
cd "$BACKEND_DIR"

# Compile using bun build --compile
if bun build --compile --outfile "$OUTPUT_PATH" --target "bun" ./src/index.ts 2>&1; then
    echo -e "\n${GREEN}✓ Backend compiled successfully${NC}"
else
    # If the above fails, try without --target bun (for newer Bun versions)
    echo -e "${YELLOW}Retrying build without --target flag...${NC}"
    if bun build --compile --outfile "$OUTPUT_PATH" ./src/index.ts 2>&1; then
        echo -e "\n${GREEN}✓ Backend compiled successfully${NC}"
    else
        echo -e "${RED}✗ Failed to compile backend${NC}"
        exit 1
    fi
fi

# Verify the binary was created
if [[ -f "$OUTPUT_PATH" ]]; then
    SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)
    chmod +x "$OUTPUT_PATH"
    echo -e "${GREEN}✓ Binary created and made executable${NC}"
    echo -e "  Size: $SIZE"
    echo -e "  Path: $OUTPUT_PATH"
else
    echo -e "${RED}✗ Binary not found at expected location${NC}"
    exit 1
fi

echo -e "\n${GREEN}Sidecar build complete!${NC}"
