FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app/scraper

# Install dependencies first (cached until package.json changes)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . ./
COPY .env ./

RUN git config --global user.email "opencode@healer.bot" && \
    git config --global user.name "OpenCode Healer"

RUN mkdir -p /app/seed && cp -r src/eventFiles /app/seed/eventFiles

RUN mkdir -p /app/seed-scrappers && cp -r src/scrappers/* /app/seed-scrappers/

RUN curl -sSfL https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux-arm64.tar.gz \
    | tar xz -C /usr/local/bin opencode

RUN apt-get update && apt-get install -y xvfb ripgrep && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.config/ripgrep && echo '--max-columns=10000' > /root/.config/ripgrep/config

ENV PROJECT=newcastle

COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
