import type { IPCTransport, IPCTransportConfig } from './ipc-transport.js';
import { NamedPipeTransport } from './named-pipe-transport.js';
import { UnixSocketTransport } from './unix-socket-transport.js';

/**
 * Factory for creating platform-appropriate IPC transports.
 * - Windows: Named Pipes (\\.\pipe\name)
 * - macOS/Linux: Unix Domain Sockets
 */
export class IPCFactory {
  /**
   * Create an IPC transport for the current platform
   */
  static createTransport(config: IPCTransportConfig): IPCTransport {
    if (process.platform === 'win32') {
      return new NamedPipeTransport(config);
    }
    return new UnixSocketTransport(config);
  }

  /**
   * Get the platform name for logging
   */
  static getPlatformName(): string {
    switch (process.platform) {
      case 'win32':
        return 'Windows (Named Pipes)';
      case 'darwin':
        return 'macOS (Unix Sockets)';
      case 'linux':
        return 'Linux (Unix Sockets)';
      default:
        return `${process.platform} (Unix Sockets)`;
    }
  }
}
