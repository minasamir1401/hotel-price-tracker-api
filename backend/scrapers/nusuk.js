import { createNusukClient, validateNusukOccupancy } from './nusuk-client.js';
import { createLiveScraper } from './almosafer-live.js';

export function nusukProfileKey(input) {
  const value = String(input || '').trim();
  let profile;
  if (/^nusuk:/i.test(value)) profile = value.slice(6);
  else {
    try {
      const url = new URL(value);
      if (!['almatar.com', 'www.almatar.com', 'nusuk.almatar.com', 'apiout.almatar.com'].includes(url.hostname)) throw new Error();
      profile = decodeURIComponent(url.pathname).match(/\/hotels\/rooms\/([^/]+)\/?$/)?.[1];
    } catch { /* validated below */ }
  }
  if (!profile || !/^[^\s/?#]+-[1-9]\d*$/.test(profile)) throw Object.assign(new Error('نسك: الصق رابط صفحة غرف الفندق من المطار لتحديد الفندق، أو nusuk: ثم مفتاح صفحة الفندق الكامل'), { status: 400 });
  return profile;
}
export const nusukClient = createNusukClient();
export function createNusukResolver(client = nusukClient) {
  return async (input, params = {}) => {
    validateNusukOccupancy(Array.from({ length: Number(params.rooms ?? 1) }, () => ({ adultsCount: Number(params.adults ?? 2), kidsAges: params.childAges || [] })));
    return client.hotel(nusukProfileKey(input));
  };
}
export const resolveNusukDetails = createNusukResolver();
export const scrapeNusuk = createLiveScraper(resolveNusukDetails, nusukClient.rooms, {
  source: 'Nusuk', sourceArabic: 'نسك', allowSameNameFallback: false,
  bookingURL: () => 'https://services.nusuk.sa/app/',
});
