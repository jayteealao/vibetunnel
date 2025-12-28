import * as net from 'node:net';
import { createLogger } from '../utils/logger.js';
import type { IPCTransport, IPCTransportConfig } from './ipc-transport.js';

const logger = createLogger('ipc-pipe');

/**
 * Windows Named Pipe implementation of IPC transport.
 * Uses Windows named pipes (\\.\pipe\name) for local communication.
 */
export class NamedPipeTransport implements IPCTransport {
  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private readonly pipePath: string;
  private connectionHandler?: (socket: net.Socket) => void;
  private errorHandler?: (error: Error) => void;

  constructor(config: IPCTransportConfig) {
    // Windows named pipes use the format: \\.\pipe\<name>
    // Node.js on Windows accepts this format for net.Server.listen()
    this.pipePath = `\\\\.\\pipe\\${config.name}`;

    logger.log(`Named pipe transport initialized: ${this.pipePath}`);
  }

  async start(): Promise<void> {
    logger.log('🚀 Starting named pipe transport');
    logger.log(`📂 Pipe path: ${this.pipePath}`);

    // Create named pipe server
    this.server = net.createServer((socket) => {
      this.handleConnection(socket);
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.server?.listen(this.pipePath, () => {
        logger.log(`✅ Named pipe listening at ${this.pipePath}`);
        resolve();
      });

      this.server?.on('error', (error) => {
        logger.error('Named pipe server error:', error);
        if (this.errorHandler) {
          this.errorHandler(error);
        }
        reject(error);
      });
    });
  }

  stop(): void {
    logger.log('🛑 Stopping named pipe transport');

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Named pipes are automatically cleaned up by the OS when the server closes
    logger.log('✅ Named pipe server stopped');
  }

  getPath(): string {
    return this.pipePath;
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  write(data: Buffer, callback?: (error?: Error) => void): boolean {
    if (!this.socket || this.socket.destroyed) {
      const error = new Error('Pipe not connected');
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
    logger.log('🔌 New connection to named pipe');

    // Close existing connection if any
    if (this.socket) {
      logger.log('⚠️ Closing existing connection');
      this.socket.destroy();
    }

    this.socket = socket;

    // Configure socket for optimal performance
    socket.setNoDelay(true);

    // Increase buffer size for large messages
    const bufferSize = 1024 * 1024; // 1MB
    try {
      const socketWithState = socket as net.Socket & {
        _readableState?: { highWaterMark: number };
      };
      if (socketWithState._readableState) {
        socketWithState._readableState.highWaterMark = bufferSize;
        logger.log(`Set pipe receive buffer to ${bufferSize} bytes`);
      }
    } catch (error) {
      logger.warn('Failed to set pipe buffer size:', error);
    }

    // Handle socket events
    socket.on('error', (error) => {
      logger.error('❌ Pipe error:', error);
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });

    socket.on('close', (hadError) => {
      logger.log(`🔌 Pipe connection closed (hadError: ${hadError})`);
      if (socket === this.socket) {
        this.socket = null;
      }
    });

    socket.on('end', () => {
      logger.log('📴 Pipe received FIN packet');
    });

    socket.on('drain', () => {
      logger.log('Pipe drained - ready for more data');
    });

    // Notify connection handler
    if (this.connectionHandler) {
      this.connectionHandler(socket);
    }
  }
}
