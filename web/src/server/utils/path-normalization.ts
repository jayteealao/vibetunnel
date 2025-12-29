import * as path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('path-norm');

/**
 * Normalize a path for the current platform
 * Handles WSL paths, Windows paths, and Unix paths
 */
export function normalizePath(inputPath: string): string {
  if (!inputPath) {
    return inputPath;
  }

  // Handle different platforms
  if (process.platform === 'win32') {
    return normalizeWindowsPath(inputPath);
  }

  // Unix/macOS - just normalize
  return path.normalize(inputPath);
}

/**
 * Normalize paths on Windows
 * Handles WSL mount paths (/mnt/c/ -> C:\) and Unix-style paths
 */
function normalizeWindowsPath(inputPath: string): string {
  let normalizedPath = inputPath;

  // Convert WSL mount paths (/mnt/c/... -> C:\...)
  const wslMountRegex = /^\/mnt\/([a-z])\//i;
  const wslMatch = inputPath.match(wslMountRegex);

  if (wslMatch) {
    const driveLetter = wslMatch[1].toUpperCase();
    const remainingPath = inputPath.slice(wslMatch[0].length);

    // Convert to Windows path
    normalizedPath = `${driveLetter}:\\${remainingPath.replace(/\//g, '\\')}`;
    logger.debug(`Converted WSL path: ${inputPath} -> ${normalizedPath}`);

    return path.normalize(normalizedPath);
  }

  // Convert forward slashes to backslashes for absolute Unix-style paths
  // But preserve UNC paths (\\server\share) and Windows paths (C:\...)
  if (inputPath.startsWith('/') && !inputPath.startsWith('//')) {
    // This might be a Unix-style absolute path on Windows (from Git Bash, etc.)
    // Try to determine the root drive
    const systemDrive = process.env.SystemDrive || 'C:';
    normalizedPath = path.join(systemDrive, '\\', inputPath);
    logger.debug(`Converted Unix-style path: ${inputPath} -> ${normalizedPath}`);
  }

  // Normalize Windows path separators and resolve ../ and ./
  return path.normalize(normalizedPath);
}

/**
 * Convert a Windows path to WSL format
 * C:\Users\... -> /mnt/c/Users/...
 */
export function windowsToWslPath(windowsPath: string): string {
  if (process.platform !== 'win32') {
    return windowsPath;
  }

  // Check if it's a Windows drive letter path
  const driveRegex = /^([a-z]):\\/i;
  const match = windowsPath.match(driveRegex);

  if (match) {
    const driveLetter = match[1].toLowerCase();
    const remainingPath = windowsPath.slice(3); // Skip "C:\"

    // Convert to WSL mount path
    const wslPath = `/mnt/${driveLetter}/${remainingPath.replace(/\\/g, '/')}`;

    logger.debug(`Converted Windows to WSL: ${windowsPath} -> ${wslPath}`);
    return wslPath;
  }

  // Not a drive letter path, return as-is
  return windowsPath;
}

/**
 * Convert a WSL path to Windows format
 * /mnt/c/Users/... -> C:\Users\...
 */
export function wslToWindowsPath(wslPath: string): string {
  if (process.platform !== 'win32') {
    return wslPath;
  }

  // Check if it's a WSL mount path
  const wslMountRegex = /^\/mnt\/([a-z])\//i;
  const match = wslPath.match(wslMountRegex);

  if (match) {
    const driveLetter = match[1].toUpperCase();
    const remainingPath = wslPath.slice(match[0].length);

    // Convert to Windows path
    const windowsPath = `${driveLetter}:\\${remainingPath.replace(/\//g, '\\')}`;

    logger.debug(`Converted WSL to Windows: ${wslPath} -> ${windowsPath}`);
    return windowsPath;
  }

  // Not a WSL mount path, return as-is
  return wslPath;
}

/**
 * Ensure a path uses the platform's native separator
 */
export function ensureNativeSeparators(inputPath: string): string {
  if (process.platform === 'win32') {
    return inputPath.replace(/\//g, '\\');
  }
  return inputPath.replace(/\\/g, '/');
}

/**
 * Ensure a path uses forward slashes (Unix-style)
 */
export function ensureForwardSlashes(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Ensure a path uses backslashes (Windows-style)
 */
export function ensureBackslashes(inputPath: string): string {
  return inputPath.replace(/\//g, '\\');
}

/**
 * Check if a path is an absolute path
 * Handles Windows drive letters and UNC paths
 */
export function isAbsolutePath(inputPath: string): boolean {
  if (process.platform === 'win32') {
    // Windows: Check for drive letter (C:\) or UNC path (\\server\share)
    return /^[a-z]:\\/i.test(inputPath) || /^\\\\/.test(inputPath);
  }

  // Unix: Check for leading /
  return inputPath.startsWith('/');
}

/**
 * Get the home directory with proper path separators
 */
export function getHomeDirectory(): string {
  const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;

  if (!home) {
    throw new Error('Could not determine home directory');
  }

  return normalizePath(home);
}

/**
 * Resolve a path relative to the home directory
 * Handles ~ expansion
 */
export function resolveHomePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    const home = getHomeDirectory();
    return path.join(home, inputPath.slice(1));
  }

  return normalizePath(inputPath);
}
