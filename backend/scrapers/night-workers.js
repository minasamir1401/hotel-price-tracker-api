// Start the next night as soon as a worker is free. A slow supplier response
// must not hold up every other worker at the end of a fixed batch.
export async function forEachNight(items, concurrency, visit, shouldStop = () => false) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const index = next++;
      await visit(items[index], index);
    }
  }));
}

export const fatalInventoryError = error => error && (error.stage === 'browser-connect' ||
  (['session-bootstrap', 'packages', 'poll'].includes(error.stage) &&
    (['challenge', 'access-denied'].includes(error.responseKind) || [401, 403].includes(error.upstreamStatus))));
