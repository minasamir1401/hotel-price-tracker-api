import { randomUUID } from 'node:crypto';

// A room lookup already collected the nightly quotes. Hand those exact quotes
// to the next search, once, rather than scraping the same month a second time.
export function createRoomInventoryStore({ now = Date.now, ttlMs = 120000, maxEntries = 100 } = {}) {
  const entries = new Map();
  const key = params => JSON.stringify([params.hotelInput, params.checkIn, params.checkOut,
    Number(params.adults ?? 2), Number(params.rooms ?? 1), Number(params.children ?? 0), params.childAges || []]);
  return {
    put(params, data) {
      for (const [id, entry] of entries) if (entry.expires <= now()) entries.delete(id);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const id = randomUUID();
      entries.set(id, { key: key(params), data: structuredClone(data), expires: now() + ttlMs });
      return id;
    },
    take(id, params) {
      const entry = entries.get(id);
      if (!entry || entry.expires <= now()) { entries.delete(id); return null; }
      if (entry.key !== key(params)) return null;
      entries.delete(id);
      return structuredClone(entry.data);
    },
  };
}

export const roomInventoryStore = createRoomInventoryStore();
