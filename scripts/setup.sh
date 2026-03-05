#!/bin/bash

# setup.sh - First-run setup for development environment
# This script checks for required tools and downloads necessary binaries:
# - Docker (for ChromaDB container)
# - Bun (for backend runtime and build)
# - Rust (for Tauri desktop framework)
# - yt-dlp (for video downloading functionality)
# - whisper.cpp (for speech-to-text)
#
# Usage: ./scripts/setup.sh
# The script will report what's missing and provide guidance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track installation status
MISSING_TOOLS=()
INSTALLED_TOOLS=()

# Helper function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Helper function to download a file with fallbacks
download_file() {
    local url="$1"
    local output="$2"

    if command_exists curl; then
        curl -L --progress-bar -o "$output" "$url"
    elif command_exists wget; then
        wget -q --show-progress -O "$output" "$url"
    else
        echo -e "${RED}Error: Neither curl nor wget is available${NC}"
        return 1
    fi
}

# Detect platform
detect_platform() {
    local os arch
    os=$(uname -s)
    arch=$(uname -m)

    case "$os" in
        Linux)
            case "$arch" in
                x86_64)
                    echo "linux-x86_64"
                    ;;
                aarch64|arm64)
                    echo "linux-aarch64"
                    ;;
                *)
                    echo "linux-unknown"
                    ;;
            esac
            ;;
        Darwin)
            case "$arch" in
                x86_64)
                    echo "macos-x86_64"
                    ;;
                arm64|aarch64)
                    echo "macos-arm64"
                    ;;
                *)
                    echo "macos-unknown"
                    ;;
            esac
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

echo -e "${BLUE}Checking development environment prerequisites...${NC}\n"

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites:${NC}"

# 1. Check Docker
if command_exists docker; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
    echo -e "${GREEN}✓ Docker${NC} (version $DOCKER_VERSION)"
    INSTALLED_TOOLS+=("Docker")
else
    echo -e "${RED}✗ Docker${NC} - Required for ChromaDB container"
    MISSING_TOOLS+=("Docker")
fi

# 2. Check Bun
if command_exists bun; then
    BUN_VERSION=$(bun --version)
    echo -e "${GREEN}✓ Bun${NC} (version $BUN_VERSION)"
    INSTALLED_TOOLS+=("Bun")
else
    echo -e "${RED}✗ Bun${NC} - Required for backend runtime and compilation"
    MISSING_TOOLS+=("Bun")
fi

# 3. Check Rust
if command_exists rustc; then
    RUST_VERSION=$(rustc --version | awk '{print $2}')
    echo -e "${GREEN}✓ Rust${NC} (version $RUST_VERSION)"
    INSTALLED_TOOLS+=("Rust")
else
    echo -e "${RED}✗ Rust${NC} - Required for Tauri desktop framework"
    MISSING_TOOLS+=("Rust")
fi

# 4. Check cargo
if command_exists cargo; then
    CARGO_VERSION=$(cargo --version | awk '{print $2}')
    echo -e "${GREEN}✓ Cargo${NC} (version $CARGO_VERSION)"
    INSTALLED_TOOLS+=("Cargo")
else
    echo -e "${RED}✗ Cargo${NC} - Required for Rust package management"
    MISSING_TOOLS+=("Cargo")
fi

echo ""

# Download external binaries if needed
echo -e "${YELLOW}Checking external binaries:${NC}"

# Create tools directory
mkdir -p tools

PLATFORM=$(detect_platform)

# 5. Check/Download yt-dlp
YT_DLP_PATH="tools/yt-dlp"
if [[ -x "$YT_DLP_PATH" ]]; then
    YT_DLP_VERSION=$("$YT_DLP_PATH" --version | head -1)
    echo -e "${GREEN}✓ yt-dlp${NC} ($YT_DLP_VERSION)"
else
    echo -e "${YELLOW}⚠ yt-dlp${NC} - Downloading..."
    case "$PLATFORM" in
        linux-x86_64)
            download_file "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" "$YT_DLP_PATH" && \
            chmod +x "$YT_DLP_PATH" && \
            echo -e "${GREEN}✓ yt-dlp${NC} downloaded" || \
            echo -e "${RED}✗ Failed to download yt-dlp${NC}"
            ;;
        linux-aarch64)
            download_file "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64" "$YT_DLP_PATH" && \
            chmod +x "$YT_DLP_PATH" && \
            echo -e "${GREEN}✓ yt-dlp${NC} downloaded" || \
            echo -e "${RED}✗ Failed to download yt-dlp${NC}"
            ;;
        macos-x86_64|macos-arm64)
            download_file "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" "$YT_DLP_PATH" && \
            chmod +x "$YT_DLP_PATH" && \
            echo -e "${GREEN}✓ yt-dlp${NC} downloaded" || \
            echo -e "${RED}✗ Failed to download yt-dlp${NC}"
            ;;
        *)
            echo -e "${YELLOW}⚠ Unsupported platform for yt-dlp auto-download${NC}"
            ;;
    esac
fi

# 6. Check/Download whisper.cpp
WHISPER_PATH="tools/whisper.cpp"
if [[ -f "$WHISPER_PATH/main" ]]; then
    echo -e "${GREEN}✓ whisper.cpp${NC} (available)"
else
    echo -e "${YELLOW}⚠ whisper.cpp${NC} - Instructions for setup:"
    echo -e "  ${BLUE}1. Clone: git clone https://github.com/ggerganov/whisper.cpp tools/whisper.cpp${NC}"
    echo -e "  ${BLUE}2. Build: cd tools/whisper.cpp && make${NC}"
    echo -e "  ${BLUE}3. Download model: ./main -m base${NC}"
fi

echo ""

# Create data directories
echo -e "${YELLOW}Setting up data directories:${NC}"

DATA_DIRS=(
    "data/videos"
    "data/transcripts"
    "data/processing"
    "data/chroma"
)

for dir in "${DATA_DIRS[@]}"; do
    if mkdir -p "$dir" 2>/dev/null; then
        echo -e "${GREEN}✓ $dir${NC}"
    else
        echo -e "${RED}✗ Failed to create $dir${NC}"
    fi
done

echo ""

# Summary
echo -e "${BLUE}=== Setup Summary ===${NC}"
echo -e "${GREEN}Installed: ${#INSTALLED_TOOLS[@]} tools${NC}"
for tool in "${INSTALLED_TOOLS[@]}"; do
    echo -e "  ${GREEN}✓${NC} $tool"
done

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
    echo -e "\n${RED}Missing: ${#MISSING_TOOLS[@]} tools${NC}"
    for tool in "${MISSING_TOOLS[@]}"; do
        echo -e "  ${RED}✗${NC} $tool"
    done
    echo -e "\n${YELLOW}Please install missing tools before running development environment${NC}"
else
    echo -e "\n${GREEN}All prerequisites are installed!${NC}"
    echo -e "${YELLOW}You can now run: ./scripts/dev.sh${NC}"
fi

echo ""
