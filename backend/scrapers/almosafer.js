import { createEnigmaClient } from './enigma.js';
import { createLiveScraper } from './almosafer-live.js';
import { createAlmosaferSessionProvider, webUserAgent } from './almosafer-session.js';
import { upstreamHttpError } from './upstream-error.js';
const autocompleteSession = createAlmosaferSessionProvider();

export async function resolveAlmosaferDetails(hotelInput, { checkIn, checkOut, rooms = 1, adults = 2 } = {}) {
  let decodedInput = hotelInput || '';
  try { decodedInput = decodeURIComponent(hotelInput); } catch { decodedInput = hotelInput || ''; }

  const inputLower = decodedInput.toLowerCase();
  if (/^https?:/i.test(hotelInput || '')) {
    const host = new URL(hotelInput).hostname;
    if (host !== 'almosafer.com' && !host.endsWith('.almosafer.com')) throw new Error('يرجى استخدام رابط المسافر لتحديد الفندق لهذا المصدر');
  }

  if (hotelInput && hotelInput.startsWith('http') && hotelInput.includes('almosafer.com')) {
    let extractedId = null;
    let extractedSlug = null;
    let extractedName = null;

    // Pattern: /atg/<slug-id>
    const atgMatch = decodedInput.match(/\/(?:atg\/|hotel\/details\/atg\/|hotels?\/details\/atg\/)([^?#/]+)/);
    if (atgMatch?.[1]) {
      extractedSlug = atgMatch[1];
      extractedId = extractedSlug.match(/-(\d+)$/)?.[1] || null;
      const cleanName = extractedSlug.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
      extractedName = cleanName || null;
    }

    // Pattern: /hotels/<slug-id>
    if (!extractedId) {
      const hotelsMatch = decodedInput.match(/\/hotels\/([^?#/]+)/);
      if (hotelsMatch?.[1]) {
        extractedSlug = hotelsMatch[1];
        extractedId = extractedSlug.match(/-(\d+)$/)?.[1] || null;
        const cleanName = extractedSlug.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
        extractedName = extractedName || cleanName || null;
      }
    }

    // Fallback: query params
    if (!extractedId) {
      try {
        const u = new URL(hotelInput);
        const qId = u.searchParams.get('hotelId') || u.searchParams.get('id');
        if (qId) extractedId = qId;
      } catch { /* ignore */ }
    }

    if (!extractedName) extractedName = 'فندق';

    return {
      hotelName: extractedName,
      hotelId: extractedId,
      baseSlug: extractedSlug ? `hotel/details/atg/${extractedSlug}` : 'hotels-home',
      customUrl: hotelInput,
    };
  }

  // If numeric ID directly
  const idMatch = inputLower.match(/\b(\d{5,8})\b/);
  if (idMatch && !decodedInput.includes('almatar.com')) {
    return {
      hotelName: hotelInput,
      hotelId: idMatch[1],
      baseSlug: `hotel/details/atg/${hotelInput}`,
    };
  }

  // Dynamic search via Almosafer Autocomplete API (Zero Hardcoding)
  try {
    const query = inputLower.replace(/https?:\/\/[^\s]+/g, '').trim() || hotelInput;
    if (query && !/unknown\s*hotel/i.test(query)) {
      const apiToken = process.env.ALMOSAFER_API_TOKEN?.trim() || await autocompleteSession({ checkIn, checkOut, roomsInfo: Array.from({ length: rooms }, () => ({ adultsCount: adults, kidsAges: [] })) }, Date.now() + 20000);
      const headers = {
        'User-Agent': webUserAgent,
        'Accept': 'application/json',
        'token': apiToken,
        'x-api-key': 'apikey-hotel',
        'x-app-name': 'ct-web-hotels-app',
        'x-bt': 'next',
        'x-currency': 'SAR',
        'x-locale': 'ar',
        ...(autocompleteSession.cookieHeader ? { Cookie: autocompleteSession.cookieHeader } : {}),
      };
      const res = await fetch(`https://www.almosafer.com/api/enigma/autocomplete?query=${encodeURIComponent(query)}`, {
        headers,
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw await upstreamHttpError(res, { stage: 'autocomplete', url: 'https://www.almosafer.com/api/enigma/autocomplete' });
      if (res.ok) {
        const data = await res.json();
        const firstHotel = data?.hotels?.[0];
        if (firstHotel && firstHotel.hotelId) {
          return {
            hotelName: firstHotel.name,
            hotelId: String(firstHotel.hotelId),
            baseSlug: `hotel/details/atg/${firstHotel.name.replace(/\s+/g, '-')}-${firstHotel.hotelId}`,
          };
        }
      }
    }
  } catch (error) { throw error; }

  return {
    hotelName: hotelInput || 'فندق مخصص',
    hotelId: null,
    baseSlug: `hotels-home?q=${encodeURIComponent(hotelInput || '')}`,
  };
}

export const almosaferClient = createEnigmaClient();
export const scrapeAlmosafer = createLiveScraper(
  resolveAlmosaferDetails,
  almosaferClient
);
