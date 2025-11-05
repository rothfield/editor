FROM debian:stable-slim

# Install system dependencies with security best practices
# - lilypond: music notation compiler
# - fontconfig: font configuration and caching
# - fonts-dejavu-core: reliable font availability
# - nodejs/npm: runtime
# - tini: process reaper (handles zombies, proper signal forwarding)
RUN apt-get update && apt-get install -y --no-install-recommends \
    lilypond \
    fontconfig \
    fonts-dejavu-core \
    nodejs \
    npm \
    tini \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Verify lilypond installation
RUN lilypond --version

# Configure fontconfig for read-only root filesystem
# Pre-generate font cache as root before switching to non-root user
RUN fc-cache -f -v 2>&1 | tail -5 || true

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev \
    && npm cache clean --force

# Copy application code
COPY server.js ./

# Create non-root user for execution (UID 10001, GID 10001)
# This prevents container escape exploits that rely on root privileges
RUN groupadd --gid 10001 --system runner && \
    useradd --no-create-home --uid 10001 --gid 10001 --system runner

# Pre-create fontconfig cache directories and set permissions for non-root user
RUN mkdir -p /tmp/.fontconfig && \
    chmod 1777 /tmp/.fontconfig && \
    mkdir -p /root/.cache/fontconfig && \
    chmod -R 1777 /root/.cache

# Switch to non-root user
USER runner

# Health check (increased timeout to account for font loading)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8787/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use tini as entrypoint for proper process management
# - Reaps zombie processes
# - Forwards signals correctly
# - Prevents PID 1 issues
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

# Metadata
LABEL description="Secure LilyPond rendering service"
LABEL version="1.0.0"
