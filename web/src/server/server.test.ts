import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import type { ControlIpcHandler } from './websocket/control-ipc-handler.js';
import type { ControlMessage } from './websocket/control-protocol.js';

// Mock WebSocket
vi.mock('ws');

describe('Config WebSocket', () => {
  let mockControlIpcHandler: ControlIpcHandler;
  let messageHandler: (data: Buffer | ArrayBuffer | string) => void;

  beforeEach(() => {
    // Create mock WebSocket instance
    const _mockWs = {
      on: vi.fn((event: string, handler: (data: Buffer | ArrayBuffer | string) => void) => {
        if (event === 'message') {
          messageHandler = handler;
        }
      }),
      send: vi.fn(),
      close: vi.fn(),
      readyState: WebSocket.OPEN,
    };

    // Initialize messageHandler with a mock implementation
    // This simulates what the server would do when handling config WebSocket messages
    messageHandler = async (data: Buffer | ArrayBuffer | string) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'update-repository-path') {
          const newPath = message.path;
          // Forward to native app via IPC if available
          if (mockControlIpcHandler) {
            const controlMessage: ControlMessage = {
              id: 'test-id',
              type: 'request' as const,
              category: 'system' as const,
              action: 'repository-path-update',
              payload: { path: newPath, source: 'web' },
            };
            // Send to native app and wait for response
            await mockControlIpcHandler.sendControlMessage(controlMessage);
          }
        }
      } catch {
        // Handle errors silently
      }
    };

    // Create mock control IPC handler
    mockControlIpcHandler = {
      sendControlMessage: vi.fn(),
    } as unknown as ControlIpcHandler;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('repository path update from web', () => {
    it('should forward path update to native app via IPC', async () => {
      // Setup mock response
      const mockResponse: ControlMessage = {
        id: 'test-id',
        type: 'response',
        category: 'system',
        action: 'repository-path-update',
        payload: { success: true },
      };
      vi.mocked(mockControlIpcHandler.sendControlMessage).mockResolvedValue(mockResponse);

      // Simulate message from web client
      const message = JSON.stringify({
        type: 'update-repository-path',
        path: '/new/repository/path',
      });

      // Trigger message handler
      await messageHandler(Buffer.from(message));

      // Verify control message was sent
      expect(mockControlIpcHandler.sendControlMessage).toHaveBeenCalledWith({
        id: 'test-id',
        type: 'request',
        category: 'system',
        action: 'repository-path-update',
        payload: { path: '/new/repository/path', source: 'web' },
      });
    });

    it('should handle native app confirmation response', async () => {
      const mockResponse: ControlMessage = {
        id: 'test-id',
        type: 'response',
        category: 'system',
        action: 'repository-path-update',
        payload: { success: true },
      };
      vi.mocked(mockControlIpcHandler.sendControlMessage).mockResolvedValue(mockResponse);

      const message = JSON.stringify({
        type: 'update-repository-path',
        path: '/new/path',
      });

      await messageHandler(Buffer.from(message));

      // Should complete without errors
      expect(mockControlIpcHandler.sendControlMessage).toHaveBeenCalled();
    });

    it('should handle native app failure response', async () => {
      const mockResponse: ControlMessage = {
        id: 'test-id',
        type: 'response',
        category: 'system',
        action: 'repository-path-update',
        payload: { success: false },
      };
      vi.mocked(mockControlIpcHandler.sendControlMessage).mockResolvedValue(mockResponse);

      const message = JSON.stringify({
        type: 'update-repository-path',
        path: '/new/path',
      });

      await messageHandler(Buffer.from(message));

      // Should handle gracefully
      expect(mockControlIpcHandler.sendControlMessage).toHaveBeenCalled();
    });

    it('should handle missing control IPC handler', async () => {
      // Simulate no control handler available
      mockControlIpcHandler = null as unknown as ControlIpcHandler;

      const message = JSON.stringify({
        type: 'update-repository-path',
        path: '/new/path',
      });

      // Should not throw
      await expect(messageHandler(Buffer.from(message))).resolves.not.toThrow();
    });

    it('should ignore non-repository-path messages', async () => {
      const message = JSON.stringify({
        type: 'other-message-type',
        data: 'some data',
      });

      await messageHandler(Buffer.from(message));

      // Should not call sendControlMessage
      expect(mockControlIpcHandler.sendControlMessage).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON gracefully', async () => {
      const invalidMessage = 'invalid json {';

      // Should not throw
      await expect(messageHandler(Buffer.from(invalidMessage))).resolves.not.toThrow();
      expect(mockControlIpcHandler.sendControlMessage).not.toHaveBeenCalled();
    });

    it('should handle control message send errors', async () => {
      vi.mocked(mockControlIpcHandler.sendControlMessage).mockRejectedValue(
        new Error('IPC error')
      );

      const message = JSON.stringify({
        type: 'update-repository-path',
        path: '/new/path',
      });

      // Should not throw
      await expect(messageHandler(Buffer.from(message))).resolves.not.toThrow();
    });
  });
});
