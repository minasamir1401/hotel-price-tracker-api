import { randomUUID } from 'node:crypto';

// Discovery quotes are handed to the next search once. Price-search snapshots
// can also be read without consumption for a bounded manual retry. Raw quote
// context preserves successful dates and the exact reasons other dates failed.
export function createRoomInventoryStore({ now = Date.now, ttlMs = 120000, maxEntries = 100 } = {}) {
  const entries = new Map();
  const key = params => JSON.stringify([params.hotelInput, params.checkIn, params.checkOut,
    Number(params.adults ?? 2), Number(params.rooms ?? 1), Number(params.children ?? 0), params.childAges || []]);
  return {
    put(params, data, context = null, { ttlMs: entryTtlMs = ttlMs } = {}) {
      for (const [id, entry] of entries) if (entry.expires <= now()) entries.delete(id);
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      const id = randomUUID();
      entries.set(id, { key: key(params), data: structuredClone(data), context: structuredClone(context), expires: now() + entryTtlMs });
      return id;
    },
    take(id, params, { withContext = false, consume = true } = {}) {
      const entry = entries.get(id);
      if (!entry || entry.expires <= now()) { entries.delete(id); return null; }
      if (entry.key !== key(params)) return null;
      if (consume) entries.delete(id);
      return structuredClone(withContext ? { data: entry.data, context: entry.context } : entry.data);
    },
  };
}

export const roomInventoryStore = createRoomInventoryStore();
