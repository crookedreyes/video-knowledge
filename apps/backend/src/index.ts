import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { getDb } from './db/index.js';
import { ConfigService } from './services/config.js';
import { IngestionPipeline } from './services/pipeline.js';
import {
  StubDownloadService,
  StubTranscriptionService,
  StubVectorStoreService,
  StubSummarizationService,
  StubTaggerService,
} from './services/stubs.js';
import { settingsRouter } from './routes/settings.js';
import { videosRouter } from './routes/videos.js';

// Simple logger
const pinoLogger = {
  info: (msg: string | object, data?: string | object) => {
    const output = typeof msg === 'string' ? `[INFO] ${msg}` : `[INFO] ${JSON.stringify(msg)}`;
    console.log(output, data ? JSON.stringify(data) : '');
  },
  error: (error: any, msg: string) => {
    console.error(`[ERROR] ${msg}`, error?.message || error);
  },
  child: () => pinoLogger,
};

// Create Hono app
const app = new Hono<{
  Variables: {
    db: Awaited<ReturnType<typeof getDb>>;
    configService: ConfigService;
    pipeline: IngestionPipeline;
  };
}>();

// CORS middleware - allow requests from Tauri webview
app.use(
  cors({
    origin: [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3456', // Backend
      'tauri://localhost', // Tauri webview
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Request logging middleware
app.use(logger());

// Global error handler middleware
app.onError((err, c) => {
  pinoLogger.error(
    { error: err, context: c.req.path },
    'Request error'
  );

  const errorResponse = {
    success: false,
    error: {
      message: err.message || 'Internal server error',
      status: 'error',
      timestamp: new Date().toISOString(),
    },
  };

  // Determine status code
  let status = 500;
  if (err.message.includes('not found')) {
    status = 404;
  } else if (err.message.includes('validation')) {
    status = 400;
  }

  return c.json(errorResponse, status);
});

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        message: 'Route not found',
        status: 'not_found',
        timestamp: new Date().toISOString(),
      },
    },
    404
  );
});

// Initialize database
const db = await getDb();
pinoLogger.info('Database initialized successfully');

// Initialize config service
const configService = new ConfigService(db);
await configService.initialize();
pinoLogger.info('Config service initialized successfully');

// Initialize pipeline with stub services (replaced when blocker tickets land)
const pipeline = new IngestionPipeline(db, {
  download: new StubDownloadService(),
  transcription: new StubTranscriptionService(),
  vectorStore: new StubVectorStoreService(),
  summarization: new StubSummarizationService(),
  tagger: new StubTaggerService(),
});

// Log pipeline events
pipeline.on('progress', (event) => {
  pinoLogger.info(`[pipeline] ${event.videoId} → step ${event.stepIndex + 1}/${event.totalSteps}: ${event.step}`);
});
pipeline.on('complete', (event: { videoId: string }) => {
  pinoLogger.info(`[pipeline] ${event.videoId} → complete (ready)`);
});
pipeline.on('error', (event: { videoId: string; step: string; error: Error }) => {
  pinoLogger.error(event.error, `[pipeline] ${event.videoId} failed at step: ${event.step}`);
});

pinoLogger.info('IngestionPipeline initialized successfully');

// Attach shared context to all requests
app.use(async (c, next) => {
  c.set('db', db);
  c.set('configService', configService);
  c.set('pipeline', pipeline);
  await next();
});

// Routes
app.route('/api/settings', settingsRouter);
app.route('/api/videos', videosRouter);

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || 'localhost';

pinoLogger.info(`Starting server on ${HOST}:${PORT}`);

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
};
