import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
process.on('uncaughtException', err => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', reason => {
  console.error('[UNHANDLED REJECTION]', reason);
});
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const playwrightVersion = createRequire(import.meta.url)('playwright/package.json').version;

// Automatically load local env configuration if present
for (const envPath of [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '../outputs/booking-app-probe/server.env'),
  path.resolve(process.cwd(), 'outputs/booking-app-probe/server.env'),
]) {
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(envPath); } catch {}
  }
}

import express from 'express';
import cors from 'cors';
import { executeHotelComparison } from './scrapers/index.js';
import { fetchDailyPricesAlmatar, fetchOneNight } from './daily-prices-almatar.js';
import { createAlmatarResolver } from './scrapers/almatar.js';
import { resolveAlmosaferDetails, almosaferClient } from './scrapers/almosafer.js';
import { almosaferFetch } from './scrapers/almosafer-http.js';
import { almosaferConnection } from './scrapers/almosafer-connection.js';
import { bookingConfigured } from './scrapers/booking-client.js';
import { requestOtp, verifyOtp, clearBookingSession, getBookingSessionData, isBookingSessionActive } from './scrapers/booking-session-store.js';
import { bookingClient, resolveBookingDetails } from './scrapers/booking.js';
import { nusukClient, resolveNusukDetails } from './scrapers/nusuk.js';
import { sourceSnapshot } from './scrapers/source-status.js';
import { createHotelRoomsService, detectHotelSource } from './hotel-rooms-service.js';
import {createSearchJobs} from './search-jobs.js';
const resolveAlmatar = createAlmatarResolver();
const enigmaClient = almosaferClient;
const app = express();
const searchJobs=createSearchJobs({execute:async params => params.kind === 'hotel-rooms'
  ? hotelRooms(params)
  : params.kind === 'daily-prices'
  ? { success: true, ...await fetchDailyPricesAlmatar(params) }
  : executeHotelComparison(params)});
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
  const sourceDetails = Object.fromEntries(['almosafer', 'almatar', 'booking', 'nusuk'].map(source => [source, sourceSnapshot(source, source !== 'booking' || bookingConfigured())]));
  const connection = almosaferConnection();
  sourceDetails.almosafer.transport = connection.transport;
  sourceDetails.almosafer.browserFallback = connection.browserFallback;
  sourceDetails.almosafer.remoteBrowserConfigured = Boolean(connection.browserEndpoint);
  sourceDetails.almosafer.sessionHandoff = almosaferFetch.diagnostics();
  sourceDetails.almosafer.proxyConfigured = Boolean(connection.proxyUrl);
  sourceDetails.almosafer.browserPackageVersion = playwrightVersion;
  sourceDetails.almosafer.headless = connection.headless;
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
    if (!effectiveHotel.startsWith('http://') && !effectiveHotel.startsWith('https://') && /^(?:www\.)?booking\.com/i.test(effectiveHotel)) {
      effectiveHotel = 'https://' + effectiveHotel;
    }
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

    const isStream = req.body.background !== true && Boolean(req.headers.accept?.includes('text/event-stream'));
    let pingTimer = null;
    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      pingTimer = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 2500);

      res.once('close', () => {
        if (pingTimer) clearInterval(pingTimer);
      });
    }

    const executionParams = {
      requestId: req.body.requestId,
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
    };
    if(req.body.background===true) {
      const job=searchJobs.start(executionParams);
      return res.status(202).json({success:true,jobId:job.id,status:job.status});
    }
    const comparisonResult = await executeHotelComparison(executionParams);

    if (isStream) {
      if (pingTimer) clearInterval(pingTimer);
      res.write(`data: ${JSON.stringify({ type: 'done', result: comparisonResult })}\n\n`);
      return res.end();
    }

    res.json(comparisonResult);
  } catch (error) {
    console.error('Error during hotel search execution:', error);
    if (req.body.background !== true && Boolean(req.headers?.accept?.includes('text/event-stream'))) {
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
app.get('/api/search-jobs/:id',(req,res)=>{
  const job=searchJobs.get(req.params.id);
  if(!job)return res.status(404).json({success:false,message:'المهمة غير موجودة أو انتهت صلاحيتها؛ ابدأ استعلامًا جديدًا'});
  res.set('Cache-Control','no-store').json(job);
});

app.post('/api/daily-prices', async (req, res) => {
  req.setTimeout(600000);
  res.setTimeout(600000);

  const isStream = req.body.background !== true && Boolean(req.headers.accept?.includes('text/event-stream'));
  let pingTimer = null;

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

    const dailyParams = {
      requestId: req.body.requestId,
      kind: 'daily-prices', sources: ['almatar'], hotelInput, checkIn, checkOut,
      adults: Number(adults), rooms: Number(rooms),
      childAges: Array.isArray(childAges) ? childAges : [],
      roomKeywords: Array.isArray(roomKeywords) ? roomKeywords : (roomKeywords ? [roomKeywords] : []),
      concurrency: Math.min(6, Math.max(1, Number(concurrency) || 4)),
      roomName, bedCount: Number(bedCount), bedType,
      includeUnknownBeds: Boolean(req.body.includeUnknownBeds), mealPlan,
    };
    if (req.body.background === true) {
      const job = searchJobs.start(dailyParams);
      return res.status(202).set('Cache-Control', 'no-store').json({ success: true, jobId: job.id, status: job.status });
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      pingTimer = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
      }, 2500);

      res.once('close', () => {
        if (pingTimer) clearInterval(pingTimer);
      });
    }

    console.log(`[SCRAPE START] Hotel: ${hotelInput}, Room: ${roomName || 'All'}, Dates: ${checkIn} -> ${checkOut}, Stream: ${isStream}`);

    const data = await fetchDailyPricesAlmatar({
      ...dailyParams,
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
    if (pingTimer) clearInterval(pingTimer);
    console.error('Error in /api/daily-prices:', error);
    if (isStream) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message, code: error.code, diagnosticId: error.diagnosticId })}\n\n`);
      return res.end();
    }
    res.status(error.status || 500).json({ success: false, message: error.message, code: error.code, diagnosticId: error.diagnosticId });
  }
});

const hotelRooms = createHotelRoomsService({ resolveAlmosafer: resolveAlmosaferDetails, enigmaClient, resolveAlmatar, fetchOneNight, resolveBooking: resolveBookingDetails, bookingClient, resolveNusuk: resolveNusukDetails, nusukClient });
app.get('/api/hotel-rooms-list', (req, res) => res.status(405).set('Allow', 'POST').json({ success: false, message: 'هذا المسار يستقبل POST من زر تحديث الغرف داخل الموقع' }));
app.post('/api/hotel-rooms-list', async (req, res) => {
  try {
    if (req.body.background === true) {
      const checkIn = req.body.checkIn || new Date(Date.now() + 86400000).toISOString().slice(0,10);
      const start = Date.parse(`${checkIn}T12:00:00Z`);
      if (!Number.isFinite(start)) throw Object.assign(new Error('تاريخ الوصول غير صالح'),{status:400});
      const checkOut = new Date(start + 86400000).toISOString().slice(0,10);
      const source = req.body.source || detectHotelSource(req.body.hotelInput);
      const job = searchJobs.start({ kind: 'hotel-rooms', sources: [source], source,
        requestId: req.body.requestId,
        hotelInput: String(req.body.hotelInput || '').trim(), checkIn, checkOut,
        adults: Number(req.body.adults ?? 2), rooms: Number(req.body.rooms ?? 1),
        children: Number(req.body.children ?? (req.body.childAges || []).length),
        childAges: req.body.childAges || [], refresh: Boolean(req.body.refresh),
      });
      return res.status(202).set('Cache-Control','no-store').json({ success: true, jobId: job.id, status: job.status });
    }
    res.json(await hotelRooms(req.body));
  }
  catch (error) {
    console.warn('[HOTEL ROOMS FAILURE]', error.message, error.diagnosticId);
    res.status(error.status || 502).json({ success: false, message: error.message, source: error.source || detectHotelSource(req.body.hotelInput), upstreamStatus: error.upstreamStatus, stage: error.stage, upstreamHost: error.upstreamHost, code: error.code, diagnosticId: error.diagnosticId });
  }
});

// Booking account passwordless OTP session management
app.post('/api/booking-request-otp', (req, res) => {
  const { email } = req.body || {};
  const result = requestOtp(email);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/booking-verify-otp', (req, res) => {
  const { email, code } = req.body || {};
  const result = verifyOtp(email, code);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

app.post('/api/booking-disconnect', (req, res) => {
  clearBookingSession();
  console.log('[BOOKING SESSION] Session cleared');
  res.json({ success: true, message: 'تم إلغاء ربط الحساب بنجاح' });
});

app.get('/api/booking-session', (req, res) => {
  const data = getBookingSessionData();
  res.json({
    connected: isBookingSessionActive(),
    email: data?.email || null,
    geniusLevel: data?.geniusLevel || null,
    verifiedAt: data?.verifiedAt || null,
  });
});

app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'خطأ في الخادم' });
  }
});

export const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
server.timeout = 600000;
server.keepAliveTimeout = 610000;
server.headersTimeout = 620000;
server.requestTimeout = 600000;

const shutdown = (signal) => {
  console.log(`[SHUTDOWN] Received ${signal}, closing server...`);
  almosaferFetch.close();
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

