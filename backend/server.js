import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
process.on('uncaughtException', err => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', reason => {
  console.error('[UNHANDLED REJECTION]', reason);
});
import express from 'express';
import cors from 'cors';
import { executeHotelComparison } from './scrapers/index.js';
import { fetchDailyPricesAlmatar, fetchOneNight } from './daily-prices-almatar.js';
import { createAlmatarResolver } from './scrapers/almatar.js';
import { resolveAlmosaferDetails, almosaferClient } from './scrapers/almosafer.js';
import { bookingConfigured } from './scrapers/booking-client.js';
import { bookingClient, resolveBookingDetails } from './scrapers/booking.js';
import { sourceSnapshot } from './scrapers/source-status.js';
import { createHotelRoomsService, detectHotelSource } from './hotel-rooms-service.js';
const resolveAlmatar = createAlmatarResolver();
const enigmaClient = almosaferClient;
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
  next();
});

// System health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// System status for scrapers and export engine
app.get('/api/system-status', (req, res) => {
  const now = new Date();
  const sourceDetails = Object.fromEntries(['almosafer', 'almatar', 'booking'].map(source => [source, sourceSnapshot(source, source !== 'booking' || bookingConfigured())]));
  res.json({
    ...Object.fromEntries(Object.entries(sourceDetails).map(([source, state]) => [source, state.status])),
    sourceDetails,
    backend: 'ready',
    excelExport: 'ready',
    lastSearch: now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    activeProxies: 0,
    errors: Object.entries(sourceDetails).filter(([, state]) => state.message).map(([source, state]) => `${source}: ${state.message}`),
  });
});

// Hotel price search and comparison endpoint
app.post('/api/search-hotel-prices', async (req, res) => {
  try {
    const {
      hotelInput,
      checkIn,
      checkOut,
      adults = 2,
      children = 0,
      rooms = 1,
      roomNotes = '',
      refresh = false,
      childAges = [],
      bedCount = 0,
      bedType = 'any',
      includeUnknownBeds = false,
      sources = ['almosafer', 'almatar'],
    } = req.body;

    let effectiveHotel = (hotelInput || '').trim();
    if (!effectiveHotel) {
      return res.json({
        success: true,
        data: [],
        summary: null,
      });
    }

    let effectiveCheckIn = checkIn;
    let effectiveCheckOut = checkOut;
    let effectiveAdults = Number(adults);
    let effectiveRooms = Number(rooms);
    let effectiveChildren = Number(children);
    let effectiveSources = Array.isArray(sources) && sources.length > 0 ? sources : ['almosafer', 'almatar'];
    if (req.body.sources === undefined && (/^booking:/i.test(effectiveHotel) || /^https:\/\/(?:[^/]+\.)?booking\.com\//i.test(effectiveHotel))) effectiveSources = ['booking'];
    if (req.body.sources === undefined && detectHotelSource(effectiveHotel)) effectiveSources = [detectHotelSource(effectiveHotel)];

    // If hotelInput is a URL, parse dates and platform if not already set
    if (effectiveHotel.startsWith('http')) {
      try {
        const parsedUrl = new URL(effectiveHotel);
        if (parsedUrl.hostname === 'booking.com' || parsedUrl.hostname.endsWith('.booking.com')) {
          if (req.body.rooms == null && parsedUrl.searchParams.has('no_rooms')) effectiveRooms = Number(parsedUrl.searchParams.get('no_rooms'));
          const totalAdults = parsedUrl.searchParams.get('group_adults') || parsedUrl.searchParams.get('req_adults');
          if (req.body.adults == null && totalAdults) effectiveAdults = Number(totalAdults) / effectiveRooms;
          const totalChildren = parsedUrl.searchParams.get('group_children') || parsedUrl.searchParams.get('req_children');
          if (req.body.children == null && totalChildren) effectiveChildren = Number(totalChildren) / effectiveRooms;
        }
        if (effectiveHotel.includes('almosafer.com') && (!sources || sources.length === 0)) {
          effectiveSources = ['almosafer'];
        } else if (effectiveHotel.includes('almatar.com') && (!sources || sources.length === 0)) {
          effectiveSources = ['almatar'];
        }

        const formatToIso = (dStr) => {
          if (!dStr) return null;
          if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
          const mdy=dStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if(mdy)return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
          const m = dStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
          if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          return null;
        };

        const uIn = parsedUrl.searchParams.get('checkin') || parsedUrl.searchParams.get('checkIn');
        const uOut = parsedUrl.searchParams.get('checkout') || parsedUrl.searchParams.get('checkOut');
        if (!effectiveCheckIn && uIn) {
          effectiveCheckIn = formatToIso(uIn) || effectiveCheckIn;
        }
        if (!effectiveCheckOut && uOut) {
          effectiveCheckOut = formatToIso(uOut) || effectiveCheckOut;
        }

        // Only parse adults from URL if the client did not specify it explicitly in req.body
        if (req.body.adults === undefined || req.body.adults === null) {
          const roomsParam = parsedUrl.searchParams.get('rooms');
          if (roomsParam && roomsParam.includes('_adult')) {
            const aCount = parseInt(roomsParam.split('_')[0], 10);
            if (!isNaN(aCount)) effectiveAdults = aCount;
          }
        }
      } catch (e) {}
    }

    if (!effectiveCheckIn) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      effectiveCheckIn = d.toISOString().split('T')[0];
    }
    if (!effectiveCheckOut) {
      const d = new Date(effectiveCheckIn);
      d.setDate(d.getDate() + 1);
      effectiveCheckOut = d.toISOString().split('T')[0];
    }

    const isStream = Boolean(req.headers.accept?.includes('text/event-stream'));
    let pingTimer = null;
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      pingTimer = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 10000);

      res.once('close', () => {
        if (pingTimer) clearInterval(pingTimer);
      });
    }

    const comparisonResult = await executeHotelComparison({
      hotelInput: effectiveHotel,
      checkIn: effectiveCheckIn,
      checkOut: effectiveCheckOut,
      adults: effectiveAdults,
      children: effectiveChildren,
      rooms: effectiveRooms,
      roomNotes,
      refresh,
      childAges,
      bedCount,
      bedType,
      includeUnknownBeds,
      sources: effectiveSources,
      onProgress: (p) => {
        if (isStream) {
          try {
            res.write(`data: ${JSON.stringify({ type: 'progress', ...p })}\n\n`);
          } catch {}
        }
      },
    });

    if (isStream) {
      if (pingTimer) clearInterval(pingTimer);
      res.write(`data: ${JSON.stringify({ type: 'done', result: comparisonResult })}\n\n`);
      return res.end();
    }

    res.json(comparisonResult);
  } catch (error) {
    console.error('Error during hotel search execution:', error);
    if (Boolean(req.headers?.accept?.includes('text/event-stream'))) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message, code: error.code, diagnosticId: error.diagnosticId })}\n\n`);
      return res.end();
    }
    res.status(error.status || (error.source ? 502 : 500)).json({
      success: false,
      message: error.message,
      upstreamStatus: error.upstreamStatus, code: error.code, diagnosticId: error.diagnosticId,
    });
  }
});

// Daily prices endpoint - fetches real prices per night from Almatar with streaming support
app.post('/api/daily-prices', async (req, res) => {
  req.setTimeout(600000);
  res.setTimeout(600000);

  const isStream = Boolean(req.headers.accept?.includes('text/event-stream'));

  try {
    const {
      hotelInput,
      checkIn,
      checkOut,
      adults = 2,
      childAges = [],
      roomKeywords = [],
      concurrency = 4,
      rooms = 1, roomName = '', bedCount = 0, bedType = 'any', mealPlan = '',
    } = req.body;

    if (!hotelInput || !checkIn || !checkOut) {
      if (isStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'hotelInput, checkIn, checkOut مطلوبة' })}\n\n`);
        return res.end();
      }
      return res.status(400).json({ success: false, message: 'hotelInput, checkIn, checkOut مطلوبة' });
    }

    let pingTimer = null;
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      pingTimer = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 10000);

      res.once('close', () => {
        if (pingTimer) clearInterval(pingTimer);
      });
    }

    console.log(`[SCRAPE START] Hotel: ${hotelInput}, Room: ${roomName || 'All'}, Dates: ${checkIn} -> ${checkOut}, Stream: ${isStream}`);

    const data = await fetchDailyPricesAlmatar({
      hotelInput,
      checkIn,
      checkOut,
      adults: Number(adults),
      childAges: Array.isArray(childAges) ? childAges : [],
      roomKeywords: Array.isArray(roomKeywords) ? roomKeywords : (roomKeywords ? [roomKeywords] : []),
      concurrency: Math.min(6, Math.max(1, Number(concurrency) || 4)),
      rooms: Number(rooms), roomName, bedCount: Number(bedCount), bedType,
      includeUnknownBeds: Boolean(req.body.includeUnknownBeds),
      mealPlan,
      onProgress: (p) => {
        const percent = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
        console.log(`[SCRAPE PROGRESS] ${p.completed}/${p.total} (${percent}%) - ${p.currentDay || ''}`);
        if (isStream) {
          try {
            res.write(`data: ${JSON.stringify({ type: 'progress', ...p, percent })}\n\n`);
          } catch {}
        }
      },
    });

    console.log(`[SCRAPE COMPLETE] Fetched ${data.rows?.length || 0} nights successfully`);

    if (isStream) {
      if (pingTimer) clearInterval(pingTimer);
      res.write(`data: ${JSON.stringify({ type: 'done', result: { success: true, ...data } })}\n\n`);
      return res.end();
    }

    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Error in /api/daily-prices:', error);
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message, code: error.code, diagnosticId: error.diagnosticId })}\n\n`);
      return res.end();
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

const hotelRooms = createHotelRoomsService({ resolveAlmosafer: resolveAlmosaferDetails, enigmaClient, resolveAlmatar, fetchOneNight, resolveBooking: resolveBookingDetails, bookingClient });
app.get('/api/hotel-rooms-list', (req, res) => res.status(405).set('Allow', 'POST').json({ success: false, message: 'هذا المسار يستقبل POST من زر تحديث الغرف داخل الموقع' }));
app.post('/api/hotel-rooms-list', async (req, res) => {
  try { res.json(await hotelRooms(req.body)); }
  catch (error) {
    console.warn('[HOTEL ROOMS FAILURE]', error.message);
    res.status(error.status || 502).json({ success: false, message: error.message, source: error.source || detectHotelSource(req.body.hotelInput), upstreamStatus: error.upstreamStatus, stage: error.stage, upstreamHost: error.upstreamHost, code: error.code, diagnosticId: error.diagnosticId });
  }
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'خطأ في الخادم' });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
server.timeout = 600000;
server.keepAliveTimeout = 610000;
server.headersTimeout = 620000;
server.requestTimeout = 600000;

const shutdown = (signal) => {
  console.log(`[SHUTDOWN] Received ${signal}, closing server...`);
  server.close(() => {
    console.log('[SHUTDOWN] Server closed cleanly.');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

