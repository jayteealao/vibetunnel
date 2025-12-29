#!/usr/bin/env node

/**
 * Install VibeTunnel as a Windows Service
 *
 * Usage: node install.js [options]
 * Options:
 *   --auto-start    Start service automatically on boot (default: true)
 *   --start-now     Start service immediately after install (default: true)
 */

const Service = require('node-windows').Service;
const path = require('path');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const autoStart = !args.includes('--no-auto-start');
const startNow = !args.includes('--no-start-now');

// Service configuration
const servicePath = path.join(__dirname, 'index.js');

if (!fs.existsSync(servicePath)) {
  console.error(`❌ Service script not found: ${servicePath}`);
  process.exit(1);
}

// Create the service
const svc = new Service({
  name: 'VibeTunnel',
  description: 'VibeTunnel - Terminal sharing with web interface',
  script: servicePath,
  nodeOptions: [
    '--max_old_space_size=2048',
  ],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production',
    },
    {
      name: 'VIBETUNNEL_SERVICE',
      value: '1',
    },
  ],
  wait: 2, // Wait 2 seconds before considering the service started
  grow: 0.5, // Grow wait time by 50% if service crashes
  maxRetries: 10, // Maximum restart attempts
});

console.log('📦 Installing VibeTunnel Windows Service...\n');
console.log(`   Name: ${svc.name}`);
console.log(`   Script: ${servicePath}`);
console.log(`   Auto-start: ${autoStart ? 'Yes' : 'No'}`);
console.log(`   Start now: ${startNow ? 'Yes' : 'No'}`);
console.log('');

// Handle installation events
svc.on('install', () => {
  console.log('✅ Service installed successfully!');
  console.log('');
  console.log('Service Details:');
  console.log(`   Name: ${svc.name}`);
  console.log(`   Display Name: ${svc.name}`);
  console.log(`   Description: ${svc.description}`);
  console.log('');

  if (startNow) {
    console.log('▶️  Starting service...');
    svc.start();
  } else {
    console.log('ℹ️  Service installed but not started');
    console.log('   Run "sc start VibeTunnel" to start manually');
  }
});

svc.on('start', () => {
  console.log('✅ Service started successfully!');
  console.log('');
  console.log('VibeTunnel is now running as a Windows Service.');
  console.log('Access the web UI at: http://localhost:4020');
  console.log('');
  console.log('Service Management:');
  console.log('   Start:   sc start VibeTunnel');
  console.log('   Stop:    sc stop VibeTunnel');
  console.log('   Restart: sc stop VibeTunnel && sc start VibeTunnel');
  console.log('   Status:  sc query VibeTunnel');
  console.log('');
  console.log('Logs Location:');
  console.log('   %PROGRAMDATA%\\VibeTunnel\\logs\\service.log');
  process.exit(0);
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️  Service is already installed!');
  console.log('');
  console.log('To reinstall:');
  console.log('   1. Run: node uninstall.js');
  console.log('   2. Run: node install.js');
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('❌ Service installation failed:', err);
  process.exit(1);
});

// Check for admin privileges
try {
  // This will fail if not running as admin on Windows
  const testPath = 'C:\\Windows\\System32\\test-admin.txt';
  fs.writeFileSync(testPath, 'test');
  fs.unlinkSync(testPath);
} catch (err) {
  console.error('❌ Administrator privileges required!');
  console.error('');
  console.error('Please run this script as Administrator:');
  console.error('   1. Right-click Command Prompt');
  console.error('   2. Select "Run as administrator"');
  console.error('   3. Run: node install.js');
  console.error('');
  process.exit(1);
}

// Install the service
svc.install();
