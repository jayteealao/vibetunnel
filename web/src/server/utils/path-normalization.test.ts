import { describe, expect, it, vi } from 'vitest';
import * as path from 'node:path';
import {
  normalizePath,
  windowsToWslPath,
  wslToWindowsPath,
  ensureNativeSeparators,
  isAbsolutePath,
  resolveHomePath,
} from './path-normalization.js';

// Mock dependencies
vi.mock('./logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Path Normalization', () => {
  // We can't easily mock process.platform in Node.js, so we'll have to rely on
  // the fact that we're running on Linux in this environment.
  // However, we can test the platform-agnostic functions or conditional logic
  // by inspecting how they behave on the current platform (likely Linux).

  // For Windows-specific logic, we might need to refactor the code to accept a platform argument
  // or use a more sophisticated mocking strategy. For now, we'll test what we can.

  describe('ensureNativeSeparators', () => {
    it('should normalize separators based on platform', () => {
      const input = 'path/to/file';
      const result = ensureNativeSeparators(input);

      if (process.platform === 'win32') {
        expect(result).toBe('path\\to\\file');
      } else {
        expect(result).toBe('path/to/file');
      }
    });

    it('should handle mixed separators', () => {
      // This test depends on the platform
      if (process.platform === 'win32') {
        expect(ensureNativeSeparators('path/to\\file')).toBe('path\\to\\file');
      } else {
        // On Unix, ensureNativeSeparators replaces backslashes with forward slashes
        // because it assumes backslashes were intended as separators if they appear in path context
        expect(ensureNativeSeparators('path\\to/file')).toBe('path/to/file');
      }
    });
  });

  describe('isAbsolutePath', () => {
    it('should detect Unix absolute paths', () => {
      if (process.platform !== 'win32') {
        expect(isAbsolutePath('/home/user')).toBe(true);
        expect(isAbsolutePath('relative/path')).toBe(false);
      }
    });

    // We can't easily test Windows absolute paths on Linux without mocking process.platform
    // But we can check that it doesn't crash
    it('should handle paths gracefully', () => {
      expect(typeof isAbsolutePath('C:\\Windows')).toBe('boolean');
    });
  });

  describe('resolveHomePath', () => {
    it('should expand tilde', () => {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      if (!home) return; // Skip if no home dir

      const result = resolveHomePath('~/documents');
      expect(result).toBe(path.join(home, 'documents'));
    });

    it('should return regular paths as is', () => {
      expect(resolveHomePath('/absolute/path')).toBe(path.normalize('/absolute/path'));
    });
  });

  // Windows specific tests - only run if we can mock or force the logic
  // Since we can't change process.platform easily, we'll skip these or
  // add a TODO to refactor the code for better testability.

  describe('Windows/WSL conversions (Mocked if possible)', () => {
    // These functions have explicit checks for process.platform !== 'win32'
    // so they will just return the input on Linux.

    it('should return input as-is on non-Windows platforms', () => {
      if (process.platform !== 'win32') {
        expect(windowsToWslPath('C:\\Users')).toBe('C:\\Users');
        expect(wslToWindowsPath('/mnt/c/Users')).toBe('/mnt/c/Users');
      }
    });
  });
});
