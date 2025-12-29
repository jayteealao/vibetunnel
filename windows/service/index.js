#!/usr/bin/env node

/**
 * VibeTunnel Windows Service Entry Point
 *
 * This script runs as a Windows Service and manages the VibeTunnel server.
 * It provides automatic restart on failure, logging, and proper lifecycle management.
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Configuration
const SERVICE_NAME = 'VibeTunnel';
const LOG_DIR = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'VibeTunnel', 'logs');
const PID_FILE = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'VibeTunnel', 'service.pid');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Logging utility
class Logger {
  constructor(logFile) {
    this.logFile = logFile;
    this.stream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    this.stream.write(logMessage);
    console.log(logMessage.trim());
  }

  info(message) { this.log('INFO', message); }
  warn(message) { this.log('WARN', message); }
  error(message) { this.log('ERROR', message); }

  close() {
    this.stream.end();
  }
}

const logger = new Logger(path.join(LOG_DIR, 'service.log'));

// Find vibetunnel CLI
function findVibeTunnelCLI() {
  const possiblePaths = [
    // Global npm install
    path.join(process.env.APPDATA, 'npm', 'node_modules', 'vibetunnel', 'dist', 'vibetunnel-cli'),
    // Local installation
    path.join(__dirname, '..', '..', 'web', 'dist', 'vibetunnel-cli'),
    // Program Files installation
    path.join(process.env.PROGRAMFILES, 'VibeTunnel', 'lib', 'vibetunnel-cli'),
  ];

  for (const cliPath of possiblePaths) {
    if (fs.existsSync(cliPath)) {
      logger.info(`Found VibeTunnel CLI at: ${cliPath}`);
      return cliPath;
    }
  }

  logger.error('VibeTunnel CLI not found in any expected location');
  throw new Error('VibeTunnel CLI not found');
}

// Service manager
class VibeTunnelService {
  constructor() {
    this.process = null;
    this.stopping = false;
    this.restartCount = 0;
    this.maxRestarts = 5;
    this.restartDelay = 5000; // 5 seconds
    this.cliPath = null;
  }

  async start() {
    try {
      this.cliPath = findVibeTunnelCLI();
      logger.info(`${SERVICE_NAME} service starting...`);

      // Write PID file
      fs.writeFileSync(PID_FILE, process.pid.toString());

      await this.startServer();
      this.setupSignalHandlers();

      logger.info(`${SERVICE_NAME} service started successfully`);
    } catch (error) {
      logger.error(`Failed to start service: ${error.message}`);
      process.exit(1);
    }
  }

  startServer() {
    return new Promise((resolve, reject) => {
      if (this.process) {
        logger.warn('Server already running, stopping first...');
        this.process.kill();
        this.process = null;
      }

      logger.info(`Starting VibeTunnel server: node ${this.cliPath}`);

      this.process = spawn('node', [this.cliPath, '--no-auth'], {
        cwd: path.dirname(this.cliPath),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          VIBETUNNEL_SERVICE: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // Log stdout
      this.process.stdout.on('data', (data) => {
        logger.info(`[SERVER] ${data.toString().trim()}`);
      });

      // Log stderr
      this.process.stderr.on('data', (data) => {
        logger.error(`[SERVER] ${data.toString().trim()}`);
      });

      // Handle exit
      this.process.on('exit', (code, signal) => {
        logger.warn(`Server exited with code ${code}, signal ${signal}`);
        this.process = null;

        if (!this.stopping) {
          this.handleUnexpectedExit(code);
        }
      });

      // Handle errors
      this.process.on('error', (error) => {
        logger.error(`Server process error: ${error.message}`);
        reject(error);
      });

      // Wait a bit to ensure it started successfully
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve();
        } else {
          reject(new Error('Server failed to start'));
        }
      }, 2000);
    });
  }

  handleUnexpectedExit(code) {
    if (this.restartCount >= this.maxRestarts) {
      logger.error(`Server crashed ${this.maxRestarts} times, giving up`);
      process.exit(1);
      return;
    }

    this.restartCount++;
    logger.warn(`Attempting restart ${this.restartCount}/${this.maxRestarts} in ${this.restartDelay}ms...`);

    setTimeout(() => {
      this.startServer()
        .then(() => {
          logger.info('Server restarted successfully');
          // Reset restart count on successful start
          setTimeout(() => {
            this.restartCount = 0;
          }, 60000); // Reset after 1 minute of stability
        })
        .catch((error) => {
          logger.error(`Restart failed: ${error.message}`);
          this.handleUnexpectedExit(code);
        });
    }, this.restartDelay);
  }

  setupSignalHandlers() {
    const shutdown = (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      this.stop();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Windows-specific signals
    process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  }

  stop() {
    if (this.stopping) return;
    this.stopping = true;

    logger.info('Stopping VibeTunnel service...');

    if (this.process) {
      this.process.kill('SIGTERM');

      // Force kill after 10 seconds
      setTimeout(() => {
        if (this.process) {
          logger.warn('Force killing server process');
          this.process.kill('SIGKILL');
        }
      }, 10000);
    }

    // Cleanup PID file
    try {
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
    } catch (error) {
      logger.error(`Failed to remove PID file: ${error.message}`);
    }

    logger.info('VibeTunnel service stopped');
    logger.close();

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Start the service
const service = new VibeTunnelService();
service.start().catch((error) => {
  logger.error(`Service failed to start: ${error.message}`);
  process.exit(1);
});
