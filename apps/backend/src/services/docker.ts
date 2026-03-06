import Dockerode from 'dockerode';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONTAINER_NAME = 'video-knowledge-chromadb';
const MOUNT_TARGET = '/chroma/chroma';

export interface DockerStatus {
  dockerAvailable: boolean;
  containerState: string | null;
  containerRunning: boolean;
  chromaHealthy: boolean;
  error?: string;
}

export class DockerManager {
  private docker: Dockerode;
  private socketPath: string;
  private port: number;
  private image: string;
  private dataDir: string;

  constructor(opts: {
    socketPath?: string;
    port?: number;
    image?: string;
    dataPath?: string;
  } = {}) {
    this.socketPath = opts.socketPath ?? '/var/run/docker.sock';
    this.port = opts.port ?? 8000;
    this.image = opts.image ?? 'chromadb/chroma:1.5.2';
    const baseData = opts.dataPath
      ? opts.dataPath.replace(/^~/, homedir())
      : join(homedir(), '.local', 'share', 'video-knowledge');
    this.dataDir = join(baseData, 'chromadb');
    this.docker = new Dockerode({ socketPath: this.socketPath });
  }

  async isDockerAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  private async pullImage(): Promise<void> {
    console.log(`[DockerManager] Pulling image ${this.image}...`);
    await new Promise<void>((resolve, reject) => {
      this.docker.pull(this.image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        this.docker.modem.followProgress(
          stream,
          (followErr: Error | null) => {
            if (followErr) return reject(followErr);
            console.log(`[DockerManager] Image ${this.image} pulled successfully`);
            resolve();
          },
          (event: { status?: string; progress?: string }) => {
            if (event.status) {
              console.log(`[DockerManager] Pull: ${event.status}${event.progress ? ` ${event.progress}` : ''}`);
            }
          }
        );
      });
    });
  }

  private async ensureImage(): Promise<void> {
    const images = await this.docker.listImages({
      filters: JSON.stringify({ reference: [this.image] }),
    });
    if (images.length === 0) {
      await this.pullImage();
    }
  }

  private async findContainer(): Promise<Dockerode.Container | null> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ name: [CONTAINER_NAME] }),
    });
    const match = containers.find((c) =>
      c.Names.some((n) => n === `/${CONTAINER_NAME}`)
    );
    if (!match) return null;
    return this.docker.getContainer(match.Id);
  }

  private async createContainer(): Promise<Dockerode.Container> {
    console.log(`[DockerManager] Creating container ${CONTAINER_NAME}`);
    return this.docker.createContainer({
      name: CONTAINER_NAME,
      Image: this.image,
      ExposedPorts: { [`${this.port}/tcp`]: {} },
      HostConfig: {
        PortBindings: {
          [`${this.port}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: String(this.port) }],
        },
        Binds: [`${this.dataDir}:${MOUNT_TARGET}`],
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });
  }

  private async waitForReady(timeoutMs = 30_000): Promise<void> {
    const url = `http://localhost:${this.port}/api/v2/heartbeat`;
    const deadline = Date.now() + timeoutMs;
    let lastErr: unknown;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          console.log('[DockerManager] ChromaDB is ready');
          return;
        }
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    throw new Error(
      `ChromaDB did not become ready within ${timeoutMs}ms: ${lastErr}`
    );
  }

  private async isChromaHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${this.port}/api/v2/heartbeat`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private startPythonChroma(): void {
    console.log('[DockerManager] Starting ChromaDB via Python chroma package');
    const proc = spawn(
      'chroma',
      ['run', '--host', 'localhost', '--port', String(this.port), '--path', this.dataDir],
      { detached: true, stdio: 'ignore' }
    );
    proc.unref();
  }

  async ensureRunning(): Promise<void> {
    // Fast path: ChromaDB is already reachable (started externally or previously)
    if (await this.isChromaHealthy()) {
      console.log(`[DockerManager] ChromaDB already running on port ${this.port}`);
      return;
    }

    if (await this.isDockerAvailable()) {
      await this.ensureImage();

      let container = await this.findContainer();

      if (!container) {
        container = await this.createContainer();
        console.log(`[DockerManager] Container ${CONTAINER_NAME} created`);
      }

      const inspect = await container.inspect();
      if (!inspect.State.Running) {
        console.log(`[DockerManager] Starting container ${CONTAINER_NAME}`);
        await container.start();
      } else {
        console.log(`[DockerManager] Container ${CONTAINER_NAME} already running`);
      }
    } else {
      // Docker not available — fall back to native Python ChromaDB
      this.startPythonChroma();
    }

    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (!(await this.isDockerAvailable())) return;

    const container = await this.findContainer();
    if (!container) return;

    const inspect = await container.inspect();
    if (inspect.State.Running) {
      console.log(`[DockerManager] Stopping container ${CONTAINER_NAME}`);
      await container.stop();
      console.log(`[DockerManager] Container ${CONTAINER_NAME} stopped`);
    }
  }

  async getStatus(): Promise<DockerStatus> {
    const chromaHealthy = await this.isChromaHealthy();
    const dockerAvailable = await this.isDockerAvailable();

    if (!dockerAvailable) {
      return {
        dockerAvailable: false,
        containerState: null,
        containerRunning: false,
        chromaHealthy,
        error: chromaHealthy ? undefined : 'Docker daemon not available',
      };
    }

    const container = await this.findContainer();
    if (!container) {
      return {
        dockerAvailable: true,
        containerState: 'not created',
        containerRunning: false,
        chromaHealthy,
      };
    }

    const inspect = await container.inspect();
    const containerRunning = inspect.State.Running ?? false;

    return {
      dockerAvailable: true,
      containerState: inspect.State.Status ?? null,
      containerRunning,
      chromaHealthy,
    };
  }
}
