FROM mcr.microsoft.com/playwright:v1.64.0-noble

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV ALMOSAFER_HTTP_TRANSPORT=browser
ENV ALMOSAFER_BROWSER_FALLBACK=1
ENV ALMOSAFER_BROWSER_HEADLESS=0
ENV ALMOSAFER_PYTHON=/opt/almosafer-http/bin/python

COPY http-requirements.txt /tmp/http-requirements.txt
RUN set -eu; \
  for sources in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do \
    if [ -f "$sources" ]; then \
      sed -i -E 's#https?://azure\.archive\.ubuntu\.com/ubuntu#https://archive.ubuntu.com/ubuntu#g; s#http://(archive|security)\.ubuntu\.com/ubuntu#https://\1.ubuntu.com/ubuntu#g' "$sources"; \
    fi; \
  done; \
  for attempt in 1 2 3; do \
    rm -rf /var/lib/apt/lists/*; \
    if apt-get -o Acquire::Retries=3 -o Acquire::http::No-Cache=true -o Acquire::https::No-Cache=true -o APT::Update::Error-Mode=any update \
      && apt-get -o Acquire::Retries=3 install -y --no-install-recommends python3-venv xvfb xauth tini; then \
      break; \
    fi; \
    if [ "$attempt" -eq 3 ]; then echo "APT failed after 3 attempts; see the download error above." >&2; exit 100; fi; \
    sleep "$((attempt * 5))"; \
  done; \
  python3 -m venv /opt/almosafer-http \
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

# xvfb-run must not be PID 1: Xvfb's readiness signal would leave it waiting.
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1280x800x24", "node", "server.js"]

