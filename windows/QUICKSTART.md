# VibeTunnel Windows - Quick Start Guide

## For End Users

### Installation

1. **Download the installer:**
   - Download `VibeTunnel-Setup-1.0.0.msi` (recommended)
   - Or `VibeTunnel-Setup-1.0.0.exe`

2. **Run the installer:**
   - Double-click the downloaded file
   - Click "Yes" if prompted for administrator access
   - Follow the installation wizard
   - The installer will automatically:
     - Install VibeTunnel
     - Start the Windows Service
     - Launch the tray app

3. **Access VibeTunnel:**
   - Look for the VibeTunnel icon in your system tray (bottom-right corner)
   - Click the icon and select "Open Web UI"
   - Your browser will open to `http://localhost:4020`

### Using VibeTunnel

**System Tray Menu:**
- **Open Web UI** - Opens VibeTunnel in your browser
- **Start/Stop Service** - Control the background service
- **Restart Service** - Restart if having issues
- **Launch on Startup** - Auto-start tray app on Windows login

**Managing Sessions:**
1. Open web UI from tray menu
2. Click "New Session" or run commands with `vt`:
   ```powershell
   vt powershell
   vt python script.py
   vt cmd
   ```

### Uninstallation

1. **Via Settings:**
   - Go to Settings → Apps → Installed Apps
   - Find "VibeTunnel"
   - Click "Uninstall"

2. **Via Tray:**
   - Right-click tray icon
   - Select "Uninstall Service"
   - Then uninstall the main app via Windows Settings

---

## For Developers

### Prerequisites

- Node.js 22+ (required for VibeTunnel)
- npm or pnpm
- Windows 10/11
- Administrator privileges (for service installation)
- PowerShell or Command Prompt

### Development Setup

#### 1. Install Dependencies

```powershell
# From windows/ directory
npm run install:all

# Or manually:
cd service && npm install
cd ../tray && npm install
```

#### 2. Build VibeTunnel Web First

```powershell
# From project root
cd web
pnpm install
pnpm run build
```

This creates `web/dist/vibetunnel-cli` which the service needs.

#### 3. Install the Service (requires admin)

```powershell
# From windows/ directory
npm run service:install

# Or manually:
cd service
node install.js
```

The service will:
- Install as "VibeTunnel" Windows Service
- Auto-start on boot
- Start immediately
- Log to `%PROGRAMDATA%\VibeTunnel\logs\`

#### 4. Run Tray App in Development Mode

```powershell
# From windows/ directory
npm run dev:tray

# Or manually:
cd tray
npm start
```

This launches Electron with DevTools for debugging.

### Building the Installer

```powershell
# Full build (includes web build)
npm run build

# Fast build (skip web rebuild)
npm run build:fast
```

Output: `windows/installer/dist/`
- `VibeTunnel-Setup-1.0.0.msi`
- `VibeTunnel-Setup-1.0.0.exe`
- `checksums.json`

### Development Workflow

1. **Make changes to code**

2. **Rebuild affected components:**
   ```powershell
   # If you changed web code:
   cd web && pnpm run build

   # If you changed service code:
   # Restart service via tray app or:
   sc stop VibeTunnel
   sc start VibeTunnel

   # If you changed tray code:
   # Just restart the tray app (Ctrl+C and npm start)
   ```

3. **Test changes**

4. **Rebuild installer when ready:**
   ```powershell
   npm run build
   ```

### Common Development Tasks

#### Restart Service After Changes

```powershell
# Via tray app (easiest):
# Right-click tray icon → Restart Service

# Via command line:
sc stop VibeTunnel
sc start VibeTunnel

# Or uninstall/reinstall:
npm run service:uninstall
npm run service:install
```

#### View Service Logs

```powershell
# Service log
notepad %PROGRAMDATA%\VibeTunnel\logs\service.log

# VibeTunnel log
notepad %USERPROFILE%\.vibetunnel\log.txt

# node-windows daemon logs
explorer %PROGRAMDATA%\VibeTunnel\logs\daemon\
```

#### Debug Tray App

```powershell
cd tray
npm start
```

- Electron DevTools will open automatically
- Check Console for errors
- Use "View → Reload" to refresh after changes

#### Test Service Manually (without installing)

```powershell
cd service
node index.js
```

Runs the service script directly (useful for debugging).

#### Clean Build Artifacts

```powershell
npm run clean
```

Removes `node_modules` and build outputs.

### Creating Icons

The tray app needs three icon files in `tray/assets/`:

1. **icon.ico** - Main app icon (256x256)
2. **icon-active.ico** - Service running (16x16, 32x32)
3. **icon-inactive.ico** - Service stopped (16x16, 32x32)

Use ImageMagick or an online tool:

```bash
# From PNG files:
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
convert icon-active.png -define icon:auto-resize=32,16 icon-active.ico
convert icon-inactive.png -define icon:auto-resize=32,16 icon-inactive.ico
```

### Troubleshooting

#### Service won't start

1. Check if VibeTunnel CLI exists:
   ```powershell
   # Should exist:
   dir "../web/dist/vibetunnel-cli"
   # Or if globally installed:
   dir "%APPDATA%\npm\node_modules\vibetunnel\dist\vibetunnel-cli"
   ```

2. Test the CLI directly:
   ```powershell
   node "../web/dist/vibetunnel-cli"
   ```

3. Check logs:
   ```powershell
   type %PROGRAMDATA%\VibeTunnel\logs\service.log
   ```

#### Port 4020 already in use

```powershell
# Find what's using the port:
netstat -ano | findstr :4020

# Kill the process:
taskkill /PID <PID> /F
```

#### Tray app won't connect to service

1. Verify service is running:
   ```powershell
   sc query VibeTunnel
   ```

2. If stopped, start it:
   ```powershell
   sc start VibeTunnel
   ```

3. Check service status in tray menu (should show "Running")

#### Installer build fails

1. Ensure all dependencies are installed:
   ```powershell
   npm run install:all
   ```

2. Build web first:
   ```powershell
   cd web && pnpm run build
   ```

3. Try again:
   ```powershell
   npm run build
   ```

### File Structure

```
windows/
├── service/              # Windows Service
│   ├── index.js         # Service entry point
│   ├── install.js       # Installer script
│   ├── uninstall.js     # Uninstaller script
│   └── package.json     # Dependencies
├── tray/                # Electron tray app
│   ├── main.js          # Main process
│   ├── preload.js       # Preload script
│   ├── status.html      # Status window
│   ├── assets/          # Icons
│   └── package.json     # Build config
├── installer/           # Installer build
│   └── build-installer.js
├── package.json         # Root scripts
├── README.md            # Full documentation
└── QUICKSTART.md        # This file
```

### Next Steps

1. **Review code:** Start with `service/index.js` and `tray/main.js`
2. **Customize:** Modify service behavior, tray menu, installer options
3. **Test:** Run in development mode and verify all features
4. **Build:** Create installer with `npm run build`
5. **Distribute:** Share the MSI/EXE installer

### Getting Help

- Full documentation: See `README.md`
- Service logs: `%PROGRAMDATA%\VibeTunnel\logs\service.log`
- VibeTunnel logs: `%USERPROFILE%\.vibetunnel\log.txt`
- Check service status: `sc query VibeTunnel`
- GitHub Issues: https://github.com/amantus-ai/vibetunnel/issues

---

## Quick Command Reference

```powershell
# Install dependencies
npm run install:all

# Build installer
npm run build

# Install service (as admin)
npm run service:install

# Uninstall service (as admin)
npm run service:uninstall

# Run tray app in dev mode
npm run dev:tray

# Run service directly (dev)
npm run dev:service

# Clean build artifacts
npm run clean

# View service logs
type %PROGRAMDATA%\VibeTunnel\logs\service.log

# Check service status
sc query VibeTunnel

# Start/stop service
sc start VibeTunnel
sc stop VibeTunnel
```

That's it! You're ready to develop and build VibeTunnel for Windows. 🚀
