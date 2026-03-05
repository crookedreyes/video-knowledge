export const DEFAULT_SETTINGS = {
  'llm.provider': 'lmstudio',
  'llm.baseUrl': 'http://localhost:1234/v1',
  'llm.apiKey': '',
  'llm.chatModel': 'qwen3.5',
  'llm.embeddingModel': 'qwen3-embedding',
  'llm.temperature': 0.7,
  'llm.maxTokens': 4096,
  'whisper.modelSize': 'base',
  'whisper.language': 'auto',
  'whisper.threads': 4,
  'docker.socketPath': '/var/run/docker.sock',
  'chroma.port': 8000,
  'chroma.image': 'chromadb/chroma:1.5.2',
  'backend.port': 3456,
  'paths.data': '~/.local/share/video-knowledge',
  'rag.chunkSize': 400,
  'rag.chunkOverlap': 50,
  'rag.topK': 10,
  'ui.theme': 'system',
} as const;

export type SettingsKey = keyof typeof DEFAULT_SETTINGS;
export type SettingsValue = (typeof DEFAULT_SETTINGS)[SettingsKey];
