import { randomUUID } from 'node:crypto';

// A room lookup already collected the nightly quotes. Hand those exact quotes
// to the next search, once. Optional raw quote context lets that search retry
// only failed dates while preserving successful and verified sold-out dates.
export function createRoomInventoryStore({ now = Date.now, ttlMs = 120000, maxEntries = 100 } = {}) {
  const entries = new Map();
  const key = params => JSON.stringify([params.hotelInput, params.checkIn, params.checkOut,
    Number(params.adults ?? 2), Number(params.rooms ?? 1), Number(params.children ?? 0), params.childAges || []]);
  return {
    put(params, data, context = null) {
      for (const [id, entry] of entries) if (entry.expires <= now()) entries.delete(id);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const id = randomUUID();
      entries.set(id, { key: key(params), data: structuredClone(data), context: structuredClone(context), expires: now() + ttlMs });
      return id;
    },
    take(id, params, { withContext = false } = {}) {
      const entry = entries.get(id);
      if (!entry || entry.expires <= now()) { entries.delete(id); return null; }
      if (entry.key !== key(params)) return null;
      entries.delete(id);
      return structuredClone(withContext ? { data: entry.data, context: entry.context } : entry.data);
    },
  };
}

export const roomInventoryStore = createRoomInventoryStore();
