# LilyPond Service - Arch Linux Setup Guide

This guide helps you install Docker and Docker Compose on Arch Linux to run the LilyPond rendering service.

## Prerequisites

- Arch Linux installed
- `sudo` access
- Internet connection

## Installation Steps

### 1. Install Docker

```bash
# Update package manager
sudo pacman -Syu

# Install Docker
sudo pacman -S docker

# Start Docker daemon
sudo systemctl start docker

# Enable Docker to start on boot
sudo systemctl enable docker

# Verify installation
docker --version
```

### 2. Install Docker Compose

#### Option A: Using pacman (Recommended)

```bash
# Install Docker Compose from official Arch repositories
sudo pacman -S docker-compose

# Verify installation
docker-compose --version
```

#### Option B: Using pip (Alternative)

```bash
# Install Docker Compose via pip
sudo pacman -S python-pip
sudo pip install docker-compose

# Verify installation
docker-compose --version
```

#### Option C: Using AUR (Latest version)

```bash
# Install yay or paru AUR helper (if not already installed)
sudo pacman -S --needed base-devel git
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si

# Install Docker Compose from AUR
yay -S docker-compose-bin

# Verify installation
docker-compose --version
```

### 3. Add User to Docker Group (Optional)

To run Docker without `sudo`:

```bash
# Add your user to the docker group
sudo usermod -aG docker $USER

# Verify it works (may need to log out and back in)
docker ps
```

⚠️ **Warning**: Adding a user to the docker group grants privileges equivalent to the root user. Use with caution.

### 4. Verify Setup

```bash
# Check Docker
docker --version

# Check Docker Compose
docker-compose --version

# Run test container
docker run hello-world
```

## Quick Start with LilyPond Service

Once Docker and Docker Compose are installed:

```bash
# Navigate to the service directory
cd lilypond-service

# Start the service
docker-compose up -d

# Check health
curl http://localhost:8787/health

# View logs
docker-compose logs -f lilypond

# Stop the service
docker-compose down
```

## Using Makefile (Recommended)

If you have the Makefile set up, you can use:

```bash
# Start LilyPond service
make lilypond-start

# Check health
make lilypond-health

# Test rendering
make lilypond-test

# View logs
make lilypond-logs

# Stop service
make lilypond-stop
```

## Troubleshooting

### Docker daemon not running
```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Permission denied error
```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Apply group membership (without logging out)
newgrp docker
```

### Docker Compose not found
```bash
# Reinstall Docker Compose
sudo pacman -S --noconfirm docker-compose

# Or verify PATH
which docker-compose
```

### Port 8787 already in use
```bash
# Find process using port 8787
sudo lsof -i :8787

# Change port in docker-compose.yaml
# Change: ports: ["8787:8787"]
# To: ports: ["8888:8787"]
```

### Out of disk space
```bash
# Clean up Docker resources
docker system prune -a

# Or selective cleanup
docker container prune  # Remove stopped containers
docker image prune      # Remove dangling images
docker volume prune     # Remove unused volumes
```

## System Requirements

- **Disk Space**: ~2 GB (for LilyPond installation + caching)
- **RAM**: 512 MB minimum (1 GB recommended)
- **CPU**: Any modern processor

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Arch Linux Wiki - Docker](https://wiki.archlinux.org/title/Docker)
- [LilyPond Service Documentation](./README.md)

## Uninstallation

If you need to uninstall Docker:

```bash
# Stop Docker daemon
sudo systemctl stop docker

# Uninstall Docker
sudo pacman -R docker

# Remove Docker data (optional)
sudo rm -rf /var/lib/docker

# Remove user from docker group (optional)
sudo deluser $USER docker
```

## Next Steps

Once Docker Compose is installed:

1. Start the LilyPond service: `make lilypond-start`
2. Check it's running: `make lilypond-health`
3. Test rendering: `make lilypond-test`
4. Integrate with your web app (see [INTEGRATION.md](./INTEGRATION.md))
