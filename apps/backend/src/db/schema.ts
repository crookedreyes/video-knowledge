import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Videos table - stores video metadata
export const videos = sqliteTable(
  'videos',
  {
    id: text('id').primaryKey(),
    youtubeId: text('youtube_id').notNull().unique(),
    url: text('url').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    channelName: text('channel_name').notNull(),
    channelId: text('channel_id').notNull(),
    duration: integer('duration').notNull(), // in seconds
    publishedAt: text('published_at'),
    thumbnailPath: text('thumbnail_path'),
    videoPath: text('video_path'),
    audioPath: text('audio_path'),
    summary: text('summary'),
    status: text('status', {
      enum: ['pending', 'downloading', 'transcribing', 'embedding', 'summarizing', 'tagging', 'ready', 'error'],
    }).default('pending').notNull(),
    errorMessage: text('error_message'),
    chromaCollectionId: text('chroma_collection_id'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  }
);

// Transcript segments - stores video transcript chunks
export const transcriptSegments = sqliteTable(
  'transcript_segments',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    startTime: real('start_time').notNull(), // in seconds
    endTime: real('end_time').notNull(),
    text: text('text').notNull(),
    language: text('language').notNull(),
    segmentIndex: integer('segment_index').notNull(),
  },
  (table) => ({
    videoIdIdx: index('transcript_segments_video_id_idx').on(table.videoId),
  })
);

// Chapters - stores video chapters/sections
export const chapters = sqliteTable(
  'chapters',
  {
    id: text('id').primaryKey(),
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startTime: real('start_time').notNull(), // in seconds
    endTime: real('end_time').notNull(),
    chapterIndex: integer('chapter_index').notNull(),
  },
  (table) => ({
    videoIdIdx: index('chapters_video_id_idx').on(table.videoId),
  })
);

// Tags - stores available tags for categorization
export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    color: text('color').default('#000000').notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  }
);

// Video tags - junction table for videos and tags (many-to-many)
export const videoTags = sqliteTable(
  'video_tags',
  {
    videoId: text('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['auto', 'manual'] }).default('manual').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.videoId, table.tagId] }),
  })
);

// Chat sessions - stores conversation sessions
export const chatSessions = sqliteTable(
  'chat_sessions',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    scope: text('scope', { enum: ['global', 'video', 'chapter'] }).default('global').notNull(),
    videoId: text('video_id').references(() => videos.id, { onDelete: 'set null' }), // nullable FK
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    videoIdIdx: index('chat_sessions_video_id_idx').on(table.videoId),
  })
);

// Chat messages - stores messages in a chat session
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    citations: text('citations'), // JSON array of citation objects
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    sessionIdIdx: index('chat_messages_session_id_idx').on(table.sessionId),
  })
);

// Settings - stores application settings as key-value pairs
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON value
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  }
);
