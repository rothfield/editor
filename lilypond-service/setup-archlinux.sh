#!/bin/bash

# LilyPond Service - Arch Linux Setup Script
# Installs Docker and Docker Compose on Arch Linux
# Usage: ./setup-archlinux.sh

set -e

echo "=========================================="
echo "LilyPond Service - Arch Linux Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Arch Linux
if ! grep -q "Arch Linux" /etc/os-release 2>/dev/null; then
    echo -e "${YELLOW}Warning: This script is designed for Arch Linux${NC}"
    echo "Your system may not be Arch Linux."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check for sudo
if ! command -v sudo &> /dev/null; then
    echo -e "${RED}Error: sudo is required${NC}"
    exit 1
fi

echo -e "${GREEN}Step 1: Update package manager${NC}"
sudo pacman -Syu --noconfirm

echo ""
echo -e "${GREEN}Step 2: Install Docker${NC}"
if command -v docker &> /dev/null; then
    echo "  ✓ Docker already installed"
    docker --version
else
    sudo pacman -S --noconfirm docker
    echo "  ✓ Docker installed"
fi

echo ""
echo -e "${GREEN}Step 3: Install Docker Compose${NC}"
if command -v docker-compose &> /dev/null; then
    echo "  ✓ Docker Compose already installed"
    docker-compose --version
else
    sudo pacman -S --noconfirm docker-compose
    echo "  ✓ Docker Compose installed"
fi

echo ""
echo -e "${GREEN}Step 4: Start Docker daemon${NC}"
sudo systemctl start docker
sudo systemctl enable docker
echo "  ✓ Docker daemon started and enabled"

echo ""
echo -e "${GREEN}Step 5: Verify installations${NC}"
echo ""
echo "Docker version:"
docker --version
echo ""
echo "Docker Compose version:"
docker-compose --version
echo ""
echo "Docker test:"
docker run --rm hello-world > /dev/null && echo "  ✓ Docker test passed" || echo "  ✗ Docker test failed"

echo ""
echo -e "${GREEN}Step 6: Optional - Add user to docker group${NC}"
read -p "Add $USER to docker group? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo usermod -aG docker $USER
    echo -e "${YELLOW}Note: You may need to log out and back in for changes to take effect${NC}"
    echo "     Or run: newgrp docker"
    echo "  ✓ User added to docker group"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Start LilyPond service:"
echo "     cd lilypond-service && docker-compose up -d"
echo ""
echo "  2. Or use Makefile:"
echo "     make lilypond-start"
echo ""
echo "  3. Check health:"
echo "     make lilypond-health"
echo ""
echo "  4. View logs:"
echo "     make lilypond-logs"
echo ""
echo "For more information, see:"
echo "  - SETUP-ARCHLINUX.md"
echo "  - README.md"
echo "  - INTEGRATION.md"
echo ""
