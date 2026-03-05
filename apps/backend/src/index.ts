import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { getDb } from './db/index.js';
import { ConfigService } from './services/config.js';
import { DockerManager } from './services/docker.js';
import { OpenAIClientManager } from './services/openai-client.js';
import { LLMService } from './services/llm.js';
import { EmbeddingService } from './services/embedding.js';
import { TranscriptionService } from './services/transcription.js';
import { VectorStoreService } from './services/vectorStore.js';
import { settingsRouter } from './routes/settings.js';
import { dockerSettingsRouter } from './routes/docker.js';
import { healthRouter } from './routes/health.js';
import { ingestRouter } from './routes/ingest.js';
import { videosRouter } from './routes/videos.js';
import { tagsRouter } from './routes/tags.js';
import { filesRouter } from './routes/files.js';
import { PipelineOrchestrator } from './services/pipeline/orchestrator.js';

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

const app = new Hono<{
  Variables: {
    db: Awaited<ReturnType<typeof getDb>>;
    configService: ConfigService;
    dockerManager: DockerManager;
    openAIClientManager: OpenAIClientManager;
    llmService: LLMService;
    embeddingService: EmbeddingService;
    transcriptionService: TranscriptionService;
    vectorStoreService: VectorStoreService;
    pipeline: PipelineOrchestrator;
  };
}>();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3456', 'tauri://localhost'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(logger());

app.onError((err, c) => {
  pinoLogger.error({ error: err, context: c.req.path }, 'Request error');
  let status = 500;
  if (err.message.includes('not found')) status = 404;
  else if (err.message.includes('validation')) status = 400;
  return c.json({ success: false, error: { message: err.message || 'Internal server error', status: 'error', timestamp: new Date().toISOString() } }, status);
});

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.notFound((c) => c.json({ success: false, error: { message: 'Route not found', status: 'not_found', timestamp: new Date().toISOString() } }, 404));

const db = await getDb();
pinoLogger.info('Database initialized successfully');

const configService = new ConfigService(db);
await configService.initialize();
pinoLogger.info('Config service initialized successfully');

const dockerManager = new DockerManager({
  socketPath: configService.get<string>('docker.socketPath'),
  port: configService.get<number>('chroma.port'),
  image: configService.get<string>('chroma.image'),
  dataPath: configService.get<string>('paths.data'),
});

dockerManager.ensureRunning().then(() => {
  pinoLogger.info('ChromaDB container is running');
}).catch((err: Error) => {
  pinoLogger.error(err, 'ChromaDB container failed to start');
});

const openAIClientManager = new OpenAIClientManager(configService);
const llmService = new LLMService(openAIClientManager, configService);
const embeddingService = new EmbeddingService(openAIClientManager, configService);
pinoLogger.info('LLM services initialized successfully');

const transcriptionService = new TranscriptionService(db);
pinoLogger.info('Transcription service initialized successfully');

const vectorStoreService = new VectorStoreService(embeddingService, configService);
pinoLogger.info('VectorStore service initialized successfully');

const pipeline = new PipelineOrchestrator(db, configService);
pinoLogger.info('Pipeline orchestrator initialized');

app.use(async (c, next) => {
  c.set('db', db);
  c.set('configService', configService);
  c.set('dockerManager', dockerManager);
  c.set('openAIClientManager', openAIClientManager);
  c.set('llmService', llmService);
  c.set('embeddingService', embeddingService);
  c.set('transcriptionService', transcriptionService);
  c.set('vectorStoreService', vectorStoreService);
  c.set('pipeline', pipeline);
  await next();
});

app.route('/api/settings', settingsRouter);
app.route('/api/settings/docker', dockerSettingsRouter);
app.route('/api/health', healthRouter);

app.route('/api/ingest', ingestRouter);
app.route('/api/videos', videosRouter);
app.route('/api/tags', tagsRouter);
app.route('/api/files', filesRouter);

app.get('/api/health/docker', async (c) => {
  const status = await dockerManager.getStatus();
  return c.json(status);
});

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || 'localhost';
pinoLogger.info(`Starting server on ${HOST}:${PORT}`);

Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: app.fetch,
});
