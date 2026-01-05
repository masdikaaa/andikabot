############################
#       1) BUILD STAGE
############################
FROM node:25-bookworm AS builder

WORKDIR /app

# Install dependencies untuk build (lengkap)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl nmap \
    python3 make g++ \
    libc6-dev \
    libvips-dev \
    libfftw3-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libwebp-dev \
    libgif-dev \
    librsvg2-dev \
    ffmpeg \
    fontconfig \
    tzdata && \
    rm -rf /var/lib/apt/lists/*

# Set timezone
ENV TZ=Asia/Jakarta

# Copy package.json
COPY package*.json ./

# Install dependencies produksi
RUN npm install --omit=dev --legacy-peer-deps

# Copy seluruh project
COPY . .

# Pastikan folder penting
RUN mkdir -p /app/session /app/temp /app/data

# Clean cache
RUN npm cache clean --force



############################
#       2) RUNTIME STAGE
############################
FROM node:25-bookworm-slim AS runtime

WORKDIR /app

# Install libs runtime saja (lebih kecil)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libvips42 \
    libcairo2 \
    libpango-1.0-0 \
    librsvg2-2 \
    libjpeg62-turbo \
    libwebp7 \
    libgif7 \
    nmap \
    curl \
    tzdata \
    fontconfig \
    fonts-dejavu \
    fonts-liberation \
    fonts-freefont-ttf \
    tini && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Refresh font cache
RUN fc-cache -f -v || true

ENV TZ=Asia/Jakarta

# Copy hasil build dari builder stage
COPY --from=builder /app /app

# Env performa & stabilitas
ENV NODE_ENV=production \
    NODE_OPTIONS="--heapsnapshot-near-heap-limit=1" \
    ANDIKA_DEBUG=0 \
    ANDIKA_USE_PRESENCE=1 \
    ANDIKA_MAX_INFLIGHT=24 \
    ANDIKA_CHAT_QMAX=20 \
    ANDIKA_BUCKET_CAP=6 \
    ANDIKA_BUCKET_REFILL=3 \
    ANDIKA_CHAT_COOLDOWN_MS=1200 \
    ANDIKA_USER_COOLDOWN_MS=2500

# Healthcheck (opsional)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Gunakan tini supaya SIGTERM/SIGINT clean
ENTRYPOINT ["tini","--"]

CMD ["node", "index.js"]
