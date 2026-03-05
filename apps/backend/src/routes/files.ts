import { Hono } from 'hono';
import { join } from 'path';
import { homedir } from 'os';
import { stat } from 'fs/promises';

const filesRouter = new Hono();

const MEDIA_DIR = join(homedir(), '.local', 'share', 'video-knowledge', 'media');

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function sanitizeFilename(filename: string): string | null {
  // Prevent path traversal
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '');
  if (sanitized !== filename || sanitized.includes('..')) {
    return null;
  }
  return sanitized;
}

/**
 * Serve a file with optional HTTP range request support for video seeking.
 */
async function serveFile(filePath: string, request: Request): Promise<Response> {
  let fileInfo;
  try {
    fileInfo = await stat(filePath);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!fileInfo.isFile()) {
    return new Response(JSON.stringify({ success: false, error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fileSize = fileInfo.size;
  const mimeType = getMimeType(filePath);
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new Response('Invalid range', { status: 416 });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;
    const file = Bun.file(filePath);
    const slice = file.slice(start, end + 1);

    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mimeType,
      },
    });
  }

  // Full file response
  const file = Bun.file(filePath);
  return new Response(file, {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileSize),
      'Content-Type': mimeType,
    },
  });
}

// GET /api/files/videos/:filename — serve video files with range support
filesRouter.get('/videos/:filename', async (c) => {
  const filename = sanitizeFilename(c.req.param('filename'));
  if (!filename) {
    return c.json({ success: false, error: 'Invalid filename' }, 400);
  }

  // Videos are stored as {youtubeId}/{youtubeId}.mp4
  // The filename is expected to be like "youtubeId.mp4"
  const youtubeId = filename.substring(0, filename.lastIndexOf('.'));
  const filePath = join(MEDIA_DIR, youtubeId, filename);

  return serveFile(filePath, c.req.raw);
});

// GET /api/files/thumbnails/:filename — serve thumbnail images
filesRouter.get('/thumbnails/:filename', async (c) => {
  const filename = sanitizeFilename(c.req.param('filename'));
  if (!filename) {
    return c.json({ success: false, error: 'Invalid filename' }, 400);
  }

  // Thumbnails are stored as {youtubeId}/{filename}
  const youtubeId = filename.substring(0, filename.lastIndexOf('.'));
  const filePath = join(MEDIA_DIR, youtubeId, filename);

  return serveFile(filePath, c.req.raw);
});

export { filesRouter };
