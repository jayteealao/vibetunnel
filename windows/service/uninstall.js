#!/usr/bin/env node

/**
 * Uninstall VibeTunnel Windows Service
 *
 * Usage: node uninstall.js
 */

const Service = require('node-windows').Service;
const path = require('path');
const fs = require('fs');

// Service configuration
const servicePath = path.join(__dirname, 'index.js');

// Create the service object
const svc = new Service({
  name: 'VibeTunnel',
  script: servicePath,
});

console.log('🗑️  Uninstalling VibeTunnel Windows Service...\n');

// Handle uninstallation events
svc.on('uninstall', () => {
  console.log('✅ Service uninstalled successfully!');
  console.log('');
  console.log('VibeTunnel Windows Service has been removed.');
  console.log('');
  console.log('Note: Log files and data remain at:');
  console.log('   %PROGRAMDATA%\\VibeTunnel\\');
  console.log('');
  console.log('To remove all data, manually delete this directory.');
  process.exit(0);
});

svc.on('alreadyuninstalled', () => {
  console.log('ℹ️  Service is not installed');
  console.log('');
  console.log('Nothing to uninstall.');
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('❌ Service uninstallation failed:', err);
  process.exit(1);
});

// Check for admin privileges
try {
  const testPath = 'C:\\Windows\\System32\\test-admin.txt';
  fs.writeFileSync(testPath, 'test');
  fs.unlinkSync(testPath);
} catch (err) {
  console.error('❌ Administrator privileges required!');
  console.error('');
  console.error('Please run this script as Administrator:');
  console.error('   1. Right-click Command Prompt');
  console.error('   2. Select "Run as administrator"');
  console.error('   3. Run: node uninstall.js');
  console.error('');
  process.exit(1);
}

// Stop the service first if it's running
console.log('🛑 Stopping service if running...');
try {
  svc.stop();
  setTimeout(() => {
    svc.uninstall();
  }, 2000); // Wait 2 seconds for service to stop
} catch (err) {
  // Service might not be running, proceed with uninstall
  svc.uninstall();
}
