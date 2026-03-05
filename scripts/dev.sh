#!/bin/bash

# dev.sh - Start development environment
# This script starts all required services for development:
# - ChromaDB Docker container
# - Bun backend (hot-reload mode)
# - Tauri dev (Vite + window)
#
# Usage: ./scripts/dev.sh
# Stop with Ctrl+C (all processes will be terminated cleanly)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Trap Ctrl+C to clean up all background processes
cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"

    # Kill all background processes
    if [[ -n $BACKEND_PID ]]; then
        kill $BACKEND_PID 2>/dev/null || true
        wait $BACKEND_PID 2>/dev/null || true
        echo -e "${BLUE}Backend process stopped${NC}"
    fi

    if [[ -n $TAURI_PID ]]; then
        kill $TAURI_PID 2>/dev/null || true
        wait $TAURI_PID 2>/dev/null || true
        echo -e "${BLUE}Tauri dev stopped${NC}"
    fi

    # Stop Docker container if we started it
    if [[ $STARTED_CHROMADB == "true" ]]; then
        docker stop vide-know-chroma 2>/dev/null || true
        echo -e "${BLUE}ChromaDB container stopped${NC}"
    fi

    echo -e "${GREEN}All services stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if we're in the right directory
if [[ ! -f "apps/desktop/package.json" ]]; then
    echo -e "${RED}Error: Must run from project root (containing apps/desktop)${NC}"
    exit 1
fi

echo -e "${BLUE}Starting development environment...${NC}\n"

# Start ChromaDB Docker container
echo -e "${YELLOW}1. Starting ChromaDB Docker container...${NC}"
if ! docker ps --filter "name=vide-know-chroma" --format "{{.Names}}" | grep -q vide-know-chroma; then
    if docker run -d \
        --name vide-know-chroma \
        -p 8000:8000 \
        -e ANONYMIZED_TELEMETRY=false \
        chromadb/chroma:latest >/dev/null 2>&1; then
        echo -e "${GREEN}✓ ChromaDB started${NC}"
        STARTED_CHROMADB="true"
        sleep 2 # Give ChromaDB time to start
    else
        echo -e "${RED}✗ Failed to start ChromaDB${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ ChromaDB already running${NC}"
fi

# Start Bun backend
echo -e "${YELLOW}2. Starting Bun backend...${NC}"
# Note: Adjust backend path if located elsewhere
if [[ -d "backend" ]]; then
    BACKEND_DIR="backend"
elif [[ -d "apps/desktop/backend" ]]; then
    BACKEND_DIR="apps/desktop/backend"
else
    echo -e "${YELLOW}⚠ Backend directory not found (backend/ or apps/desktop/backend/)${NC}"
    echo -e "${YELLOW}  Backend startup skipped - ensure it's available at expected location${NC}"
    BACKEND_DIR=""
fi

if [[ -n "$BACKEND_DIR" ]]; then
    (cd "$BACKEND_DIR" && bun run dev) &
    BACKEND_PID=$!
    echo -e "${GREEN}✓ Backend started (PID: $BACKEND_PID)${NC}"
    sleep 2 # Give backend time to start
else
    echo -e "${YELLOW}⚠ Skipping backend start${NC}"
fi

# Start Tauri dev
echo -e "${YELLOW}3. Starting Tauri development mode...${NC}"
cd "apps/desktop"
bunx tauri dev &
TAURI_PID=$!
echo -e "${GREEN}✓ Tauri dev started (PID: $TAURI_PID)${NC}"

echo -e "\n${GREEN}Development environment is running${NC}"
echo -e "${BLUE}Services running:${NC}"
echo "  - ChromaDB: http://localhost:8000"
if [[ -n "$BACKEND_DIR" ]]; then
    echo "  - Backend: http://localhost:3456"
fi
echo "  - Frontend: http://localhost:5173"
echo -e "\n${YELLOW}Press Ctrl+C to stop all services${NC}\n"

# Wait for background processes
wait
