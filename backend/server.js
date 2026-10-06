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
import { resolveAlmosaferDetails } from './scrapers/almosafer.js';
import { createEnigmaClient } from './scrapers/enigma.js';
const resolveAlmatar = createAlmatarResolver();
const enigmaClient = createEnigmaClient({ token: process.env.ALMOSAFER_API_TOKEN || 'skdjfh73273$7268u2j89s' });
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
  res.json({
    almosafer: 'ready',
    almatar: 'ready',
    excelExport: 'ready',
    lastSearch: now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
    activeProxies: 0,
    errors: [],
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
    let effectiveAdults = Number(adults) || 2;
    let effectiveRooms = Number(rooms) || 1;
    let effectiveSources = Array.isArray(sources) && sources.length > 0 ? sources : ['almosafer', 'almatar'];

    // If hotelInput is a URL, parse dates and platform if not already set
    if (effectiveHotel.startsWith('http')) {
      try {
        const parsedUrl = new URL(effectiveHotel);
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

    const comparisonResult = await executeHotelComparison({
      hotelInput: effectiveHotel,
      checkIn: effectiveCheckIn,
      checkOut: effectiveCheckOut,
      adults: effectiveAdults,
      children,
      rooms: effectiveRooms,
      roomNotes,
      refresh,
      childAges,
      bedCount,
      bedType,
      includeUnknownBeds,
      sources: effectiveSources,
    });

    res.json(comparisonResult);
  } catch (error) {
    console.error('Error during hotel search execution:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في الخادم أثناء معالجة استعلام الأسعار',
      error: error.message,
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

      req.on('close', () => {
        if (pingTimer) clearInterval(pingTimer);
      });
    }

    console.log(`[SCRAPE START] Hotel: ${hotelInput}, Room: ${roomName || 'All'}, Dates: ${checkIn} -> ${checkOut}, Stream: ${isStream}`);

    const data = await fetchDailyPricesAlmatar({
      hotelInput,
      checkIn,
      checkOut,
      adults: Number(adults) || 2,
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
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      return res.end();
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

const hotelRoomsCache = new Map();

// Endpoint to fetch available rooms for a specific date (used for the dropdown)
app.post('/api/hotel-rooms-list', async (req, res) => {
  try {
    const { hotelInput, checkIn, adults = 2, childAges = [] } = req.body;

    if (!hotelInput) {
      return res.status(400).json({ success: false, message: 'hotelInput مطلوب' });
    }

    const isAlmosafer = hotelInput.includes('almosafer.com') || (!hotelInput.includes('almatar.com') && /atg\//i.test(hotelInput));
    if (isAlmosafer) {
      const resolved = await resolveAlmosaferDetails(hotelInput);
      const hotelId = resolved.hotelId;
      if (!hotelId) throw new Error('رابط المسافر لا يحتوي معرّف الفندق');

      const today = new Date().toISOString().slice(0, 10);
      const effectiveIn = (checkIn && checkIn >= today) ? checkIn : today;

      const cacheKey = `almosafer_${hotelId}_${adults}_${(childAges || []).join('-')}_${effectiveIn}`;
      const cached = hotelRoomsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 300000 && !req.body.refresh) {
        return res.json({
          success: true,
          rooms: cached.rooms,
          hotelName: resolved.hotelName,
          hotelNameEn: resolved.hotelNameEn || resolved.hotelName,
          hotelId,
          source: 'almosafer',
        });
      }

      let resPackages = {};
      let attempts = 0;
      let currentDate = effectiveIn;
      let connectionError = null;

      while (attempts < 4) {
        const nextDate = new Date(Date.parse(`${currentDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
        try {
          const res = await enigmaClient({
            hotelId: String(hotelId),
            checkIn: currentDate,
            checkOut: nextDate,
            roomsInfo: [{ adultsCount: Number(adults) || 2, kidsAges: Array.isArray(childAges) ? childAges : [] }],
            currency: 'SAR',
          });
          if (res && Object.keys(res).length > 0) {
            resPackages = res;
            break;
          }
        } catch (err) {
          console.warn(`[ALMOSAFER ROOMS] Attempt failed for ${currentDate}:`, err.message);
          if (/جلسة|403|401|انتهت مهلة|fetch failed|econnrefused/i.test(err.message)) {
            connectionError = err.message;
            break;
          }
        }
        currentDate = new Date(Date.parse(`${currentDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
        attempts++;
      }

      if (connectionError && Object.keys(resPackages).length === 0) {
        return res.status(502).json({
          success: false,
          message: `تعذر الاتصال بالمسافر: ${connectionError}`,
          hotelName: resolved.hotelName,
          hotelId,
          source: 'almosafer',
        });
      }

      const roomNames = [...new Set(
        Object.values(resPackages)
          .map(r => r.name || r.category)
          .filter(Boolean)
      )];

      if (roomNames.length > 0) {
        hotelRoomsCache.set(cacheKey, { rooms: roomNames, timestamp: Date.now() });
      }

      return res.json({
        success: true,
        rooms: roomNames,
        hotelName: resolved.hotelName,
        hotelNameEn: resolved.hotelNameEn || resolved.hotelName,
        hotelId,
        source: 'almosafer',
      });
    }

    const resolved = await resolveAlmatar(hotelInput);
    const profile = resolved.hotelProfileKey;
    const hotelId = resolved.hotelId;
    if (!profile || !hotelId) throw new Error('رابط المطار لا يحتوي معرّف الفندق');

    const effectiveIn = checkIn || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const nextD = new Date(Date.parse(`${effectiveIn}T12:00:00Z`) + 86400000);
    const effectiveOut = nextD.toISOString().slice(0, 10);

    const cacheKey = `${hotelId}_${adults}_${(childAges || []).join('-')}_${effectiveIn}`;
    const cached = hotelRoomsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000 && !req.body.refresh) {
      return res.json({
        success: true,
        rooms: cached.rooms,
        hotelName: resolved.hotelName,
        hotelNameEn: resolved.hotelNameEn || resolved.hotelName,
        hotelId,
      });
    }

    const countryCode = resolved.countryCode || (/mecca|makkah|jeddah|riyadh|medina/i.test(hotelInput) ? 'SA' : '');

    const data = await fetchOneNight({
      hotelId,
      hotelProfileKey: profile,
      countryCode,
      checkIn: effectiveIn,
      checkOut: effectiveOut,
      adults: Number(adults) || 2,
      childAges: Array.isArray(childAges) ? childAges : [],
      fastRoomsOnly: true,
    });

    if (!data.available) {
      return res.json({
        success: true,
        rooms: [],
        hotelName: resolved.hotelName,
        hotelNameEn: resolved.hotelNameEn || resolved.hotelName,
        hotelId,
      });
    }

    // Extract unique room names
    const roomNames = [...new Set((data.rooms || []).map(r => r.roomName).filter(Boolean))];
    if (roomNames.length > 0) {
      hotelRoomsCache.set(cacheKey, { rooms: roomNames, timestamp: Date.now() });
    }
    res.json({
      success: true,
      rooms: roomNames,
      hotelName: resolved.hotelName,
      hotelNameEn: resolved.hotelNameEn || resolved.hotelName,
      hotelId,
    });
  } catch (error) {
    console.error('Error in /api/hotel-rooms-list:', error);
    res.status(500).json({ success: false, message: error.message });
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

