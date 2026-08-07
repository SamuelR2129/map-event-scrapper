FROM node:26-slim

WORKDIR /app/scraper

RUN apt-get update && apt-get install -y curl xvfb ripgrep git && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

RUN npx playwright install --with-deps chromium

# Needed to fix some critical and high vulnerabilites in node 26 image
RUN npm install -g npm@12.0.1

# Copy source code
COPY . ./

RUN mkdir -p /app/seed && cp -r src/eventFiles /app/seed/eventFiles

RUN mkdir -p /app/seed-scrappers && cp -r src/scrappers/* /app/seed-scrappers/

RUN curl -sSfL https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux-arm64.tar.gz \
    | tar xz -C /usr/local/bin opencode

# Run as a non-root user with a home directory for node/opencode/git state
RUN id -u node >/dev/null 2>&1 || useradd -rm -s /bin/bash node
RUN mkdir -p /home/node/.config/ripgrep && \
    echo '--max-columns=10000' > /home/node/.config/ripgrep/config
ENV HOME=/home/node

RUN chown -R node:node /app /opt/ms-playwright /home/node

ENV PROJECT=newcastle

COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh

USER node

ENTRYPOINT ["/entrypoint.sh"]