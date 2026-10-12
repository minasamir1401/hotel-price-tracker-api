// ScrapingAnt multi-key management with round-robin rotation, health tracking, and strict redaction.

export function parseKeys(raw = '') {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\s,;]+/)
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

export function maskKey(key = '') {
  if (!key || typeof key !== 'string') return '';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-3)}`;
}

export function createKeyPool({ env = process.env, keys = null, now = Date.now } = {}) {
  const configuredKeys = keys ?? parseKeys(env.SCRAPINGANT_API_KEYS || env.SCRAPINGANT_API_KEY || '');
  let keyList = [...configuredKeys];
  let cursor = 0;
  const cooldowns = new Map();

  function getKeys() {
    return keyList;
  }

  function setKeys(newKeys) {
    keyList = Array.isArray(newKeys) ? [...newKeys] : parseKeys(newKeys);
    cursor = 0;
    cooldowns.clear();
  }

  function markKeyExhausted(key, durationMs = 60000) {
    if (!key) return;
    cooldowns.set(key, now() + durationMs);
  }

  function isHealthy(key) {
    const until = cooldowns.get(key);
    return !until || until <= now();
  }

  function getNextKey() {
    if (keyList.length === 0) {
      throw new Error('لم يتم ضبط مفاتيح SCRAPINGANT_API_KEYS في ملف .env');
    }

    if (keyList.length === 1) {
      return keyList[0];
    }

    const total = keyList.length;
    let chosenKey = null;

    for (let offset = 0; offset < total; offset++) {
      const idx = (cursor + offset) % total;
      const candidate = keyList[idx];
      if (isHealthy(candidate)) {
        chosenKey = candidate;
        cursor = (idx + 1) % total;
        break;
      }
    }

    if (!chosenKey) {
      let earliestTime = Infinity;
      let earliestIdx = cursor;
      for (let i = 0; i < total; i++) {
        const candidate = keyList[i];
        const expiry = cooldowns.get(candidate) || 0;
        if (expiry < earliestTime) {
          earliestTime = expiry;
          earliestIdx = i;
        }
      }
      chosenKey = keyList[earliestIdx];
      cursor = (earliestIdx + 1) % total;
    }

    return chosenKey;
  }

  function redact(input) {
    if (input == null) return input;
    const isString = typeof input === 'string';
    let text = isString ? input : (input.message || String(input));
    for (const key of keyList) {
      if (key && key.length >= 8) {
        text = text.replaceAll(key, '[SCRAPINGANT_KEY_REDACTED]');
      }
    }
    return isString ? text : (input instanceof Error ? (input.message = text, input) : text);
  }

  function diagnostics() {
    return {
      totalKeys: keyList.length,
      keys: keyList.map(k => ({
        mask: maskKey(k),
        healthy: isHealthy(k),
        cooldownRemainingMs: Math.max(0, (cooldowns.get(k) || 0) - now()),
      })),
    };
  }

  return {
    getNextKey,
    markKeyExhausted,
    isHealthy,
    redact,
    maskKey,
    diagnostics,
    getKeys,
    setKeys,
  };
}

export const defaultKeyPool = createKeyPool();
