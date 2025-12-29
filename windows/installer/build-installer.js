#!/usr/bin/env node

/**
 * Build VibeTunnel Windows Installer
 *
 * This script builds both the Electron tray app and creates
 * MSI/NSIS installers for Windows distribution.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const TRAY_DIR = path.join(__dirname, '..', 'tray');
const SERVICE_DIR = path.join(__dirname, '..', 'service');
const WEB_DIR = path.join(PROJECT_ROOT, 'web');
const OUTPUT_DIR = path.join(__dirname, 'dist');

console.log('🏗️  Building VibeTunnel Windows Installer\n');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Step 1: Build web distribution
 */
function buildWeb() {
  console.log('1️⃣  Building web distribution...\n');

  if (!fs.existsSync(WEB_DIR)) {
    console.error('❌ Web directory not found:', WEB_DIR);
    process.exit(1);
  }

  try {
    // Install dependencies
    console.log('   Installing web dependencies...');
    execSync('pnpm install', { cwd: WEB_DIR, stdio: 'inherit' });

    // Build
    console.log('   Building web...');
    execSync('pnpm run build', { cwd: WEB_DIR, stdio: 'inherit' });

    console.log('   ✅ Web build completed\n');
  } catch (error) {
    console.error('❌ Web build failed:', error.message);
    process.exit(1);
  }
}

/**
 * Step 2: Install service dependencies
 */
function setupService() {
  console.log('2️⃣  Setting up Windows service...\n');

  try {
    console.log('   Installing service dependencies...');
    execSync('npm install', { cwd: SERVICE_DIR, stdio: 'inherit' });

    console.log('   ✅ Service setup completed\n');
  } catch (error) {
    console.error('❌ Service setup failed:', error.message);
    process.exit(1);
  }
}

/**
 * Step 3: Build Electron tray app
 */
function buildTray() {
  console.log('3️⃣  Building Electron tray app...\n');

  try {
    // Install dependencies
    console.log('   Installing tray dependencies...');
    execSync('npm install', { cwd: TRAY_DIR, stdio: 'inherit' });

    // Build for Windows
    console.log('   Building Electron app...');
    execSync('npm run build:msi', { cwd: TRAY_DIR, stdio: 'inherit' });

    console.log('   ✅ Tray app build completed\n');
  } catch (error) {
    console.error('❌ Tray app build failed:', error.message);
    process.exit(1);
  }
}

/**
 * Step 4: Copy installers to output directory
 */
function copyInstallers() {
  console.log('4️⃣  Copying installers...\n');

  const trayDistDir = path.join(TRAY_DIR, 'dist');

  if (!fs.existsSync(trayDistDir)) {
    console.error('❌ Tray dist directory not found:', trayDistDir);
    process.exit(1);
  }

  try {
    // Find all installer files
    const files = fs.readdirSync(trayDistDir);
    const installers = files.filter(f =>
      f.endsWith('.msi') || f.endsWith('.exe')
    );

    if (installers.length === 0) {
      console.error('❌ No installer files found in:', trayDistDir);
      process.exit(1);
    }

    // Copy installers
    for (const installer of installers) {
      const src = path.join(trayDistDir, installer);
      const dest = path.join(OUTPUT_DIR, installer);

      fs.copyFileSync(src, dest);
      console.log(`   ✅ Copied: ${installer}`);
    }

    console.log('');
  } catch (error) {
    console.error('❌ Failed to copy installers:', error.message);
    process.exit(1);
  }
}

/**
 * Step 5: Generate checksums
 */
function generateChecksums() {
  console.log('5️⃣  Generating checksums...\n');

  const crypto = require('crypto');

  try {
    const files = fs.readdirSync(OUTPUT_DIR);
    const installers = files.filter(f =>
      f.endsWith('.msi') || f.endsWith('.exe')
    );

    const checksums = {};

    for (const installer of installers) {
      const filePath = path.join(OUTPUT_DIR, installer);
      const fileBuffer = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      checksums[installer] = {
        sha256: hash,
        size: fs.statSync(filePath).size,
      };

      console.log(`   ${installer}:`);
      console.log(`     SHA256: ${hash}`);
      console.log(`     Size: ${(checksums[installer].size / 1024 / 1024).toFixed(2)} MB`);
    }

    // Write checksums file
    const checksumsPath = path.join(OUTPUT_DIR, 'checksums.json');
    fs.writeFileSync(checksumsPath, JSON.stringify(checksums, null, 2));

    console.log(`\n   ✅ Checksums written to: checksums.json\n`);
  } catch (error) {
    console.error('❌ Failed to generate checksums:', error.message);
    process.exit(1);
  }
}

/**
 * Main build process
 */
async function main() {
  const startTime = Date.now();

  // Parse arguments
  const args = process.argv.slice(2);
  const skipWeb = args.includes('--skip-web');
  const skipService = args.includes('--skip-service');

  try {
    // Run build steps
    if (!skipWeb) {
      buildWeb();
    } else {
      console.log('⏭️  Skipping web build (--skip-web)\n');
    }

    if (!skipService) {
      setupService();
    } else {
      console.log('⏭️  Skipping service setup (--skip-service)\n');
    }

    buildTray();
    copyInstallers();
    generateChecksums();

    // Success!
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('━'.repeat(60));
    console.log(`✅ Build completed successfully in ${duration}s`);
    console.log('━'.repeat(60));
    console.log('\n📦 Installers available at:');
    console.log(`   ${OUTPUT_DIR}`);
    console.log('');

    // List output files
    const files = fs.readdirSync(OUTPUT_DIR);
    files.forEach(file => {
      if (file.endsWith('.msi') || file.endsWith('.exe')) {
        console.log(`   • ${file}`);
      }
    });
    console.log('');

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
