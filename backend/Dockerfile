FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV ALMOSAFER_HTTP_TRANSPORT=curl
ENV ALMOSAFER_PYTHON=/opt/almosafer-http/bin/python

COPY http-requirements.txt /tmp/http-requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv \
  && python3 -m venv /opt/almosafer-http \
  && /opt/almosafer-http/bin/pip install --no-cache-dir --only-binary=:all: -r /tmp/http-requirements.txt \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY . .

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]

