FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV SCREENSHOT_DIR=/app/screenshots
RUN mkdir -p $SCREENSHOT_DIR

COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright's Chromium + its OS deps in one shot
RUN npx playwright install chromium --with-deps

COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
