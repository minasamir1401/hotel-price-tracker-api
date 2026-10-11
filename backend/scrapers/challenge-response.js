export function challengeEvidence(headers, body = '') {
  return headers?.get?.('cf-mitigated') === 'challenge' ||
    /challenge-platform|cf-chl-|verify (?:you are human|you are a human)|captcha/i.test(body);
}

export async function isChallengeResponse(response) {
  if (challengeEvidence(response.headers)) return true;
  const html = /text\/html/i.test(response.headers?.get?.('content-type') || '');
  if (!html && ![403, 429, 503].includes(response.status)) return false;
  if (typeof response.clone !== 'function') return false;
  // Inspect a bounded prefix without consuming the response used by the caller.
  const reader = response.clone().body?.getReader();
  if (!reader) return false;
  let size = 0, body = '';
  const decoder = new TextDecoder();
  try {
    while (size < 16384) {
      const { value, done } = await reader.read();
      if (done) break;
      const part = value.subarray(0, 16384 - size);
      size += part.length;
      body += decoder.decode(part, { stream: true });
    }
    body += decoder.decode();
    // Normal source pages can include Cloudflare JavaScript detection or a
    // CAPTCHA widget. Those scripts alone are not an interstitial challenge.
    if (response.ok) return /<title[^>]*>\s*(?:just a moment|attention required)|cf-chl-(?:widget|opt)|verify (?:you are human|you are a human)/i.test(body);
    return challengeEvidence(response.headers, body);
  } finally { reader.cancel().catch(() => {}); }
}
