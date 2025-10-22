# Multi-stage build: Builder stage
FROM ubuntu:20.04 AS builder

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js and build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    lsb-release \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Runtime stage
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies for Playwright and all browsers
RUN apt-get update && apt-get install -y \
    # Core dependencies
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    \
    # Node.js
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    \
    # Chromium dependencies
    && apt-get install -y \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxt6 \
    libxss1 \
    \
    # Firefox dependencies
    && apt-get install -y \
    libdbus-glib-1-2 \
    libfontconfig1 \
    libfreetype6 \
    libpulse0 \
    \
    # WebKit/Safari dependencies (Ubuntu 20.04 compatible)
    && apt-get install -y \
    libglib2.0-0 \
    libgstreamer-gl1.0-0 \
    libgstreamer1.0-0 \
    libgstreamer-plugins-base1.0-0 \
    libharfbuzz0b \
    libicu66 \
    libjpeg-turbo8 \
    libnotify4 \
    libopenjp2-7 \
    libopusfile0 \
    libpng16-16 \
    libsecret-1-0 \
    libsodium23 \
    libtasn1-6 \
    libwayland-client0 \
    libwayland-server0 \
    libwebp6 \
    libwebpdemux2 \
    libwoff1 \
    libxkbcommon0 \
    libxml2 \
    libxslt1.1 \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-cjk \
    \
    # Additional utilities
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Install Playwright browsers (all of them)
RUN npx playwright install chromium firefox webkit

# Expose port for dev server
EXPOSE 8080

# Default command: run tests
CMD ["npm", "run", "test"]
