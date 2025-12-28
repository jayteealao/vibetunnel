import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { createLogger } from '../utils/logger.js';
import type { IPCTransport, IPCTransportConfig } from './ipc-transport.js';

const logger = createLogger('ipc-unix');

/**
 * Unix domain socket implementation of IPC transport.
 * Used on macOS and Linux for high-performance local communication.
 */
export class UnixSocketTransport implements IPCTransport {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private readonly socketPath: string;
  private readonly permissions: number;
  private connectionHandler?: (socket: net.Socket) => void;
  private errorHandler?: (error: Error) => void;

  constructor(config: IPCTransportConfig) {
    // Determine socket directory
    const home = process.env.HOME || '/tmp';
    const baseDir = config.socketDir || path.join(home, '.vibetunnel');

    // Ensure directory exists
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (_e) {
      // Ignore if already exists
    }

    this.socketPath = path.join(baseDir, `${config.name}.sock`);
    this.permissions = config.permissions || 0o600;

    logger.log(`Unix socket transport initialized: ${this.socketPath}`);
  }

  async start(): Promise<void> {
    logger.log('🚀 Starting Unix socket transport');
    logger.log(`📂 Socket path: ${this.socketPath}`);

    // Clean up any existing socket file
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
        logger.log('🧹 Removed existing socket file');
      }
    } catch (error) {
      logger.warn('⚠️ Failed to remove existing socket:', error);
    }

    // Create Unix socket server
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.server?.listen(this.socketPath, () => {
        logger.log(`✅ Unix socket listening at ${this.socketPath}`);

        // Set restrictive permissions
        fs.chmod(this.socketPath, this.permissions, (err) => {
          if (err) {
            logger.error('Failed to set socket permissions:', err);
          } else {
            logger.log(`🔒 Socket permissions set to ${this.permissions.toString(8)}`);
          }
        });

        resolve();
      });

      this.server?.on('error', (error) => {
        logger.error('Unix socket server error:', error);
        if (this.errorHandler) {
          this.errorHandler(error);
        }
        reject(error);
      });
    });
  }

  stop(): void {
    logger.log('🛑 Stopping Unix socket transport');

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Clean up socket file
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
        logger.log('🧹 Socket file removed');
      }
    } catch (error) {
      logger.warn('Failed to remove socket file:', error);
    }
  }

  getPath(): string {
    return this.socketPath;
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  write(data: Buffer, callback?: (error?: Error) => void): boolean {
    if (!this.socket || this.socket.destroyed) {
      const error = new Error('Socket not connected');
      if (callback) {
        callback(error);
      }
      return false;
    }

    return this.socket.write(data, callback);
  }

  onConnection(handler: (socket: net.Socket) => void): void {
    this.connectionHandler = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  getServer(): net.Server | null {
    return this.server;
  }

  getSocket(): net.Socket | null {
    return this.socket;
  }

  private handleConnection(socket: net.Socket): void {
    logger.log('🔌 New connection to Unix socket');

    // Close existing connection if any
    if (this.socket) {
      logger.log('⚠️ Closing existing connection');
      this.socket.destroy();
    }

    this.socket = socket;

    // Configure socket for optimal performance
    socket.setNoDelay(true);

    // Handle socket events
    socket.on('error', (error) => {
      logger.error('❌ Socket error:', error);
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });

    socket.on('close', (hadError) => {
      logger.log(`🔌 Connection closed (hadError: ${hadError})`);
      if (socket === this.socket) {
        this.socket = null;
      }
    });

    socket.on('end', () => {
      logger.log('📴 Connection received FIN packet');
    });

    // Notify connection handler
    if (this.connectionHandler) {
      this.connectionHandler(socket);
    }
  }
}
