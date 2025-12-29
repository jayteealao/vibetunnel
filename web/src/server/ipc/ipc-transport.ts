import type { Server, Socket } from 'node:net';

/**
 * Cross-platform IPC transport abstraction.
 * Supports Unix domain sockets (macOS/Linux) and Named Pipes (Windows).
 */
export interface IPCTransport {
  /**
   * Start the IPC server
   */
  start(): Promise<void>;

  /**
   * Stop the IPC server and cleanup resources
   */
  stop(): void;

  /**
   * Get the connection path/address
   */
  getPath(): string;

  /**
   * Check if a client is connected
   */
  isConnected(): boolean;

  /**
   * Send data to the connected client
   * @param data Buffer to send
   * @returns true if write was immediate, false if buffered
   */
  write(data: Buffer, callback?: (error?: Error) => void): boolean;

  /**
   * Set the connection handler
   */
  onConnection(handler: (socket: Socket) => void): void;

  /**
   * Set the error handler
   */
  onError(handler: (error: Error) => void): void;

  /**
   * Get the underlying server instance
   */
  getServer(): Server | null;

  /**
   * Get the connected client socket
   */
  getSocket(): Socket | null;
}

/**
 * Configuration for IPC transport
 */
export interface IPCTransportConfig {
  /**
   * Name for the IPC endpoint (used for both Unix socket filename and Windows pipe name)
   */
  name: string;

  /**
   * Base directory for Unix sockets (ignored on Windows)
   */
  socketDir?: string;

  /**
   * File permissions for Unix socket (e.g., 0o600)
   */
  permissions?: number;
}
