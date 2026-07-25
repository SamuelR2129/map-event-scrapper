FROM node:26-slim

WORKDIR /app/scraper

RUN apt-get update && apt-get install -y curl xvfb ripgrep git && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

RUN npx playwright install --with-deps chromium

# Needed to fix some critical and high vulnerabilites in node 26 image
RUN npm install -g npm@12.0.1

# Copy source code
COPY . ./
COPY .env ./

RUN git config --global user.email "opencode@healer.bot" && \
    git config --global user.name "OpenCode Healer"

RUN mkdir -p /app/seed && cp -r src/eventFiles /app/seed/eventFiles

RUN mkdir -p /app/seed-scrappers && cp -r src/scrappers/* /app/seed-scrappers/

RUN curl -sSfL https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux-arm64.tar.gz \
    | tar xz -C /usr/local/bin opencode

RUN mkdir -p /root/.config/ripgrep && echo '--max-columns=10000' > /root/.config/ripgrep/config

ENV PROJECT=newcastle

COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
