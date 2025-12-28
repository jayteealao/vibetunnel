import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('shell-detection');

/**
 * Detected shell information
 */
export interface ShellInfo {
  /**
   * Type of shell
   */
  type:
    | 'cmd'
    | 'powershell'
    | 'pwsh'
    | 'wsl-bash'
    | 'git-bash'
    | 'bash'
    | 'zsh'
    | 'fish'
    | 'sh';

  /**
   * Full path to the shell executable
   */
  path: string;

  /**
   * Display name for the shell
   */
  name: string;

  /**
   * Whether this is the system default shell
   */
  isDefault: boolean;
}

/**
 * Get default shell for the current platform
 */
export function getDefaultShell(): ShellInfo {
  if (process.platform === 'win32') {
    return getDefaultWindowsShell();
  }
  return getDefaultUnixShell();
}

/**
 * Get all available shells on the system
 */
export function getAvailableShells(): ShellInfo[] {
  if (process.platform === 'win32') {
    return getAvailableWindowsShells();
  }
  return getAvailableUnixShells();
}

/**
 * Get default Windows shell
 * Priority: PowerShell Core (pwsh) > PowerShell > cmd.exe
 */
function getDefaultWindowsShell(): ShellInfo {
  const shells = getAvailableWindowsShells();

  // Prefer PowerShell Core if available
  const pwsh = shells.find((s) => s.type === 'pwsh');
  if (pwsh) {
    return { ...pwsh, isDefault: true };
  }

  // Then PowerShell
  const powershell = shells.find((s) => s.type === 'powershell');
  if (powershell) {
    return { ...powershell, isDefault: true };
  }

  // Fallback to cmd.exe (always available)
  const cmd = shells.find((s) => s.type === 'cmd');
  return cmd || { type: 'cmd', path: 'cmd.exe', name: 'Command Prompt', isDefault: true };
}

/**
 * Get all available Windows shells
 */
function getAvailableWindowsShells(): ShellInfo[] {
  const shells: ShellInfo[] = [];

  // cmd.exe - always available
  try {
    const cmdPath = execSync('where cmd.exe', { encoding: 'utf-8' }).trim().split('\n')[0];
    shells.push({
      type: 'cmd',
      path: cmdPath || 'cmd.exe',
      name: 'Command Prompt',
      isDefault: false,
    });
  } catch {
    // Fallback if 'where' fails
    shells.push({
      type: 'cmd',
      path: 'cmd.exe',
      name: 'Command Prompt',
      isDefault: false,
    });
  }

  // PowerShell Core (pwsh)
  try {
    const pwshPath = execSync('where pwsh.exe', { encoding: 'utf-8' }).trim().split('\n')[0];
    if (pwshPath) {
      shells.push({
        type: 'pwsh',
        path: pwshPath,
        name: 'PowerShell Core',
        isDefault: false,
      });
    }
  } catch {
    // PowerShell Core not installed
    logger.debug('PowerShell Core (pwsh) not found');
  }

  // Windows PowerShell
  try {
    const powershellPath = execSync('where powershell.exe', { encoding: 'utf-8' })
      .trim()
      .split('\n')[0];
    if (powershellPath) {
      shells.push({
        type: 'powershell',
        path: powershellPath,
        name: 'Windows PowerShell',
        isDefault: false,
      });
    }
  } catch {
    // Try default location
    const defaultPath = path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    if (fs.existsSync(defaultPath)) {
      shells.push({
        type: 'powershell',
        path: defaultPath,
        name: 'Windows PowerShell',
        isDefault: false,
      });
    }
  }

  // WSL Bash
  try {
    const wslPath = execSync('where wsl.exe', { encoding: 'utf-8' }).trim().split('\n')[0];
    if (wslPath) {
      shells.push({
        type: 'wsl-bash',
        path: wslPath,
        name: 'WSL Bash',
        isDefault: false,
      });
    }
  } catch {
    logger.debug('WSL not found');
  }

  // Git Bash
  const gitBashPaths = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Git',
      'bin',
      'bash.exe'
    ),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ];

  for (const gitBashPath of gitBashPaths) {
    if (fs.existsSync(gitBashPath)) {
      shells.push({
        type: 'git-bash',
        path: gitBashPath,
        name: 'Git Bash',
        isDefault: false,
      });
      break;
    }
  }

  logger.log(`Found ${shells.length} Windows shells:`, shells.map((s) => s.name).join(', '));
  return shells;
}

/**
 * Get default Unix shell
 */
function getDefaultUnixShell(): ShellInfo {
  const shellPath = process.env.SHELL || '/bin/bash';
  const shellName = path.basename(shellPath);

  let type: ShellInfo['type'] = 'sh';
  if (shellName.includes('bash')) {
    type = 'bash';
  } else if (shellName.includes('zsh')) {
    type = 'zsh';
  } else if (shellName.includes('fish')) {
    type = 'fish';
  }

  return {
    type,
    path: shellPath,
    name: shellName,
    isDefault: true,
  };
}

/**
 * Get all available Unix shells
 */
function getAvailableUnixShells(): ShellInfo[] {
  const shells: ShellInfo[] = [];
  const defaultShell = getDefaultUnixShell();

  // Add default shell first
  shells.push(defaultShell);

  // Common shell paths
  const commonShells = [
    { path: '/bin/bash', type: 'bash' as const, name: 'Bash' },
    { path: '/bin/zsh', type: 'zsh' as const, name: 'Zsh' },
    { path: '/bin/fish', type: 'fish' as const, name: 'Fish' },
    { path: '/bin/sh', type: 'sh' as const, name: 'Sh' },
    { path: '/usr/bin/bash', type: 'bash' as const, name: 'Bash' },
    { path: '/usr/bin/zsh', type: 'zsh' as const, name: 'Zsh' },
    { path: '/usr/bin/fish', type: 'fish' as const, name: 'Fish' },
  ];

  for (const shell of commonShells) {
    // Skip if already added as default
    if (shell.path === defaultShell.path) {
      continue;
    }

    if (fs.existsSync(shell.path)) {
      shells.push({
        type: shell.type,
        path: shell.path,
        name: shell.name,
        isDefault: false,
      });
    }
  }

  return shells;
}

/**
 * Get shell for a specific preference
 */
export function getShellByPreference(preference?: string): ShellInfo {
  if (!preference) {
    return getDefaultShell();
  }

  const lowerPref = preference.toLowerCase();

  // Try to match by type
  if (process.platform === 'win32') {
    if (lowerPref.includes('pwsh') || lowerPref === 'powershell-core') {
      const shells = getAvailableWindowsShells();
      const pwsh = shells.find((s) => s.type === 'pwsh');
      if (pwsh) return pwsh;
    }

    if (lowerPref.includes('powershell') || lowerPref === 'ps') {
      const shells = getAvailableWindowsShells();
      const ps = shells.find((s) => s.type === 'powershell');
      if (ps) return ps;
    }

    if (lowerPref === 'cmd' || lowerPref === 'cmd.exe') {
      const shells = getAvailableWindowsShells();
      const cmd = shells.find((s) => s.type === 'cmd');
      if (cmd) return cmd;
    }

    if (lowerPref.includes('wsl') || lowerPref.includes('bash')) {
      const shells = getAvailableWindowsShells();
      const wsl = shells.find((s) => s.type === 'wsl-bash');
      if (wsl) return wsl;

      const gitBash = shells.find((s) => s.type === 'git-bash');
      if (gitBash) return gitBash;
    }
  }

  // If preference doesn't match or not on Windows, return default
  return getDefaultShell();
}
