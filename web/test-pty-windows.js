/**
 * Minimal test script to debug node-pty on Windows
 * Run with: node test-pty-windows.js
 */

console.log('=== Node-PTY Windows Test ===\n');
console.log('Platform:', process.platform);
console.log('Node version:', process.version);
console.log('');

// Step 1: Try to load the native module
console.log('Step 1: Loading native module...');
let ptyNative;
try {
  ptyNative = require('./node_modules/.pnpm/node-pty@file+node-pty/node_modules/node-pty/build/Release/pty.node');
  console.log('  ✅ Native module loaded successfully');
  console.log('  Exports:', Object.keys(ptyNative));
} catch (err) {
  console.log('  ❌ Failed to load native module:', err.message);
  process.exit(1);
}

// Step 2: Try to import node-pty
console.log('\nStep 2: Importing node-pty...');
let pty;
try {
  pty = require('./node_modules/.pnpm/node-pty@file+node-pty/node_modules/node-pty');
  console.log('  ✅ node-pty imported successfully');
} catch (err) {
  console.log('  ❌ Failed to import node-pty:', err.message);
  console.log('  Stack:', err.stack);
  process.exit(1);
}

// Step 3: Try to spawn a simple process
console.log('\nStep 3: Spawning cmd.exe...');
let term;
try {
  term = pty.spawn('cmd.exe', [], {
    name: 'test-terminal',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });
  console.log('  ✅ PTY spawned successfully');
  console.log('  PID:', term.pid);
} catch (err) {
  console.log('  ❌ Failed to spawn PTY:', err.message);
  console.log('  Stack:', err.stack);
  process.exit(1);
}

// Step 4: Test event handlers
console.log('\nStep 4: Setting up event handlers...');
let dataReceived = false;
let errorOccurred = false;

term.onData((data) => {
  if (!dataReceived) {
    dataReceived = true;
    console.log('  ✅ Received first data from PTY');
    console.log('  Data preview:', JSON.stringify(data.substring(0, 100)));
  }
});

term.on('data', (data) => {
  // Alternative event API
});

term.on('error', (err) => {
  errorOccurred = true;
  console.log('  ❌ PTY error:', err.message);
});

term.on('exit', (code, signal) => {
  console.log('\n  PTY exited with code:', code, 'signal:', signal);
});

// Step 5: Send a command
console.log('\nStep 5: Sending test command...');
try {
  term.write('echo Hello from VibeTunnel\r\n');
  console.log('  ✅ Command sent');
} catch (err) {
  console.log('  ❌ Failed to write:', err.message);
}

// Wait a bit for output, then cleanup
console.log('\nWaiting 3 seconds for output...');
setTimeout(() => {
  console.log('\n=== Test Summary ===');
  console.log('Data received:', dataReceived ? '✅ Yes' : '❌ No');
  console.log('Errors:', errorOccurred ? '❌ Yes' : '✅ None');

  console.log('\nStep 6: Killing PTY...');
  try {
    term.kill();
    console.log('  ✅ PTY killed');
  } catch (err) {
    console.log('  ❌ Failed to kill:', err.message);
  }

  console.log('\n=== Test Complete ===');
  process.exit(0);
}, 3000);
