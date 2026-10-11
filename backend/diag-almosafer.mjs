/**
 * Final diagnostic: tests full hotel session bootstrap via configured transport.
 * Run: node diag-almosafer.mjs
 */
import { almosaferConnection } from './scrapers/almosafer-connection.js';

const TEST_HOTEL_URL = 'https://www.almosafer.com/ar/hotel/details/atg/hotel-1287944';
const TIMEOUT = 25000;

async function run() {
  const conn = almosaferConnection();
  console.log('\n=== Almosafer Connection Diagnostic ===');
  console.log('Transport     :', conn.transport);
  console.log('Proxy         :', conn.proxyUrl ? '*** configured ***' : 'none (direct IP)');
  console.log('Browser FB    :', conn.browserFallback);
  console.log('Headless      :', conn.headless);
  console.log('Test URL      :', TEST_HOTEL_URL);
  console.log('');

  // Test 1: raw native fetch
  console.log('[1] Native fetch test...');
  try {
    const res = await fetch(TEST_HOTEL_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 'Accept': 'text/html,*/*;q=0.9', 'Accept-Language': 'ar-SA,ar;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT),
      redirect: 'follow',
    });
    const text = await res.text();
    const hasNext = text.includes('__NEXT_DATA__');
    const isBlocked = /sorry[,\s]+you have been blocked/i.test(text);
    console.log('   Status:', res.status, '| __NEXT_DATA__:', hasNext, '| Blocked:', isBlocked);
    if (res.status === 200 && hasNext && !isBlocked) console.log('   RESULT: OK');
    else if (isBlocked || res.status === 403) console.log('   RESULT: BLOCKED by Cloudflare WAF');
    else console.log('   RESULT: Unexpected response');
  } catch (e) { console.log('   Error:', e.message); }

  // Test 2: session bootstrap (extracts APIToken)
  console.log('\n[2] Session bootstrap test (APIToken extraction)...');
  try {
    const { createAlmosaferSessionProvider } = await import('./scrapers/almosafer-session.js');
    const session = createAlmosaferSessionProvider();
    const token = await session({ hotelId: '1287944', checkIn: '2026-10-20', checkOut: '2026-10-21', roomsInfo: [{ adultsCount: 2, kidsAges: [] }] }, Date.now() + TIMEOUT);
    console.log('   Token:', typeof token === 'string' ? `${token.slice(0, 30)}... (${token.length} chars)` : String(token));
    console.log('   RESULT: Session bootstrap OK');
  } catch (e) {
    console.log('   Error:', e.message);
    console.log('   RESULT: Session bootstrap FAILED');
  }

  console.log('\nDone.');
}

run().catch(e => { console.error(e); process.exit(1); });
