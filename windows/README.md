# VibeTunnel Windows Distribution

This directory contains the Windows-specific components for VibeTunnel:

- **Service**: Windows Service wrapper for running VibeTunnel in the background
- **Tray**: Electron system tray application for managing the service
- **Installer**: MSI/NSIS installer build scripts

## Architecture

```
┌─────────────────────────────────────────┐
│   Electron Tray App (GUI)               │
│   • System tray icon                    │
│   • Start/stop service                  │
│   • Open web UI                         │
│   • Auto-start on login                 │
└──────────────┬──────────────────────────┘
               │ Controls
               ▼
┌─────────────────────────────────────────┐
│   Windows Service (Background)          │
│   • Runs VibeTunnel server              │
│   • Auto-start on boot                  │
│   • Automatic restart on failure        │
│   • Logging                             │
└──────────────┬──────────────────────────┘
               │ Hosts
               ▼
┌─────────────────────────────────────────┐
│   VibeTunnel Server (Node.js)           │
│   • Web UI: http://localhost:4020       │
│   • Terminal sessions                   │
│   • WebSocket connections               │
└─────────────────────────────────────────┘
```

## Quick Start

### Building the Installer

```powershell
# From the windows/installer directory
node build-installer.js
```

This will:
1. Build the web distribution
2. Set up the Windows service
3. Build the Electron tray app
4. Create MSI and NSIS installers
5. Generate checksums

Output: `windows/installer/dist/VibeTunnel-Setup-*.msi` and `.exe`

### Manual Installation (Development)

#### 1. Install the Service

```powershell
cd windows/service
npm install

# Run as Administrator
node install.js
```

#### 2. Run the Tray App

```powershell
cd windows/tray
npm install
npm start
```

## Components

### 1. Windows Service (`service/`)

A Node.js-based Windows Service that runs VibeTunnel server in the background.

**Key Features:**
- ✅ Automatic start on boot
- ✅ Automatic restart on failure (max 5 attempts)
- ✅ Logging to `%PROGRAMDATA%\VibeTunnel\logs\`
- ✅ PID file management
- ✅ Graceful shutdown

**Files:**
- `index.js` - Service entry point
- `install.js` - Service installer
- `uninstall.js` - Service uninstaller
- `package.json` - Dependencies (node-windows)

**Service Management:**

```powershell
# Install service (requires admin)
node install.js

# Uninstall service (requires admin)
node uninstall.js

# Windows Service Control Manager
sc start VibeTunnel
sc stop VibeTunnel
sc query VibeTunnel
```

**Logs:**
- `%PROGRAMDATA%\VibeTunnel\logs\service.log`
- `%PROGRAMDATA%\VibeTunnel\logs\daemon\*.log` (node-windows wrapper logs)

### 2. Electron Tray App (`tray/`)

A lightweight Electron application that provides system tray integration.

**Key Features:**
- ✅ System tray icon with status indicator
- ✅ Start/stop/restart service
- ✅ Open web UI in browser
- ✅ Auto-start on Windows login (optional)
- ✅ Service installation helper
- ✅ Single instance (prevents multiple launches)

**Files:**
- `main.js` - Electron main process
- `preload.js` - Preload script for security
- `status.html` - Optional status window
- `assets/` - Application icons
- `package.json` - Build configuration

**Building:**

```powershell
cd windows/tray
npm install
npm run build       # Build for current platform
npm run build:msi   # Build MSI installer
```

**Icons Required:**

Place the following in `tray/assets/`:
- `icon.ico` - Main app icon (256x256, multi-size)
- `icon-active.ico` - Tray icon when service is running
- `icon-inactive.ico` - Tray icon when service is stopped

See `tray/assets/README.md` for details.

### 3. Installer (`installer/`)

Build scripts for creating Windows installers.

**Installer Types:**
1. **MSI** - Traditional Windows Installer (recommended for enterprise)
2. **NSIS** - Modern one-click installer (recommended for end users)

**Building:**

```powershell
cd windows/installer
node build-installer.js

# Skip web build (faster rebuilds during development)
node build-installer.js --skip-web

# Skip service setup
node build-installer.js --skip-service
```

**Output:**
- `dist/VibeTunnel-Setup-1.0.0.msi`
- `dist/VibeTunnel-Setup-1.0.0.exe`
- `dist/checksums.json`

## Installation Workflow

### End User Installation

1. Download `VibeTunnel-Setup-*.msi` or `.exe`
2. Run installer (requires admin privileges)
3. Installer will:
   - Install VibeTunnel to `Program Files\VibeTunnel`
   - Install and start Windows Service
   - Add tray app to startup
   - Create Start Menu shortcuts
   - Open tray app
4. Tray app appears in system tray
5. Click tray icon to open web UI

### Enterprise Deployment

MSI installers support silent installation:

```powershell
# Silent install
msiexec /i VibeTunnel-Setup-1.0.0.msi /quiet /qn /norestart

# Silent install with logging
msiexec /i VibeTunnel-Setup-1.0.0.msi /quiet /qn /norestart /l*v install.log

# Silent uninstall
msiexec /x VibeTunnel-Setup-1.0.0.msi /quiet /qn /norestart
```

Group Policy deployment:
1. Place MSI in network share
2. Create GPO: Computer Configuration → Policies → Software Settings → Software Installation
3. Add package, select Assigned
4. Reboot target machines

## Development

### Prerequisites

- Node.js 22+ (same as VibeTunnel requirements)
- npm or pnpm
- Windows 10/11
- Administrator privileges (for service installation)

### Development Workflow

1. **Build web first:**
   ```powershell
   cd web
   pnpm install
   pnpm run build
   ```

2. **Install service:**
   ```powershell
   cd windows/service
   npm install
   # Run as Administrator
   node install.js
   ```

3. **Run tray app in dev mode:**
   ```powershell
   cd windows/tray
   npm install
   npm start
   ```

4. **Make changes and test**

5. **Rebuild installer:**
   ```powershell
   cd windows/installer
   node build-installer.js
   ```

### Debugging

**Service Logs:**
```powershell
# View service log
notepad %PROGRAMDATA%\VibeTunnel\logs\service.log

# View node-windows wrapper logs
dir %PROGRAMDATA%\VibeTunnel\logs\daemon\
```

**Service Status:**
```powershell
# Check service status
sc query VibeTunnel

# View service configuration
sc qc VibeTunnel

# Check if service is set to auto-start
reg query HKLM\SYSTEM\CurrentControlSet\Services\VibeTunnel /v Start
```

**Tray App:**
- Run `npm start` in `windows/tray/` for Electron DevTools
- Check console for errors
- Tray app logs to Electron's default log location:
  `%APPDATA%\vibetunnel-tray\logs\`

## Troubleshooting

### Service Won't Start

**Error: "Service failed to start"**

1. Check logs: `%PROGRAMDATA%\VibeTunnel\logs\service.log`
2. Verify VibeTunnel CLI exists:
   - `%PROGRAMFILES%\VibeTunnel\lib\vibetunnel-cli`
   - `%APPDATA%\npm\node_modules\vibetunnel\dist\vibetunnel-cli`
3. Test manually:
   ```powershell
   node "C:\Program Files\VibeTunnel\lib\vibetunnel-cli"
   ```
4. Check port 4020 isn't already in use:
   ```powershell
   netstat -ano | findstr :4020
   ```

### Service Crashes Repeatedly

The service auto-restarts up to 5 times with 5-second delays. If it crashes 5 times:

1. Check `service.log` for crash reasons
2. Verify Node.js version: `node --version` (requires 22+)
3. Check disk space and permissions
4. Reinstall:
   ```powershell
   node uninstall.js
   node install.js
   ```

### Tray App Won't Start Service

**Error: "Failed to start service"**

1. Verify service is installed:
   ```powershell
   sc query VibeTunnel
   ```
2. If not installed, use tray app's "Install Service" menu option
3. Try starting manually:
   ```powershell
   sc start VibeTunnel
   ```
4. Check Event Viewer: Windows Logs → Application → Filter by "VibeTunnel"

### Icons Not Showing

The tray app requires `.ico` files in `tray/assets/`:
- `icon.ico`
- `icon-active.ico`
- `icon-inactive.ico`

If missing, create them (see `tray/assets/README.md`) or the app will use Electron's default icon.

### Installer Build Fails

**Error: "electron-builder failed"**

1. Ensure all dependencies are installed:
   ```powershell
   cd windows/tray
   rm -r node_modules
   npm install
   ```

2. Check Node.js architecture matches:
   ```powershell
   node -p "process.arch"  # Should be x64
   ```

3. Try building without code signing:
   - Edit `tray/package.json`
   - Remove or comment out `"sign": "..."` in build config

### Port Already in Use

If port 4020 is already in use, VibeTunnel won't start.

**Find what's using the port:**
```powershell
netstat -ano | findstr :4020
tasklist /FI "PID eq <PID>"
```

**Kill the process:**
```powershell
taskkill /PID <PID> /F
```

Or configure VibeTunnel to use a different port (requires code changes).

## File Locations

### Installation
- **Program Files**: `C:\Program Files\VibeTunnel\`
  - `lib\vibetunnel-cli` - Server CLI
  - `bin\vibetunnel-fwd.exe` - Zig forwarder
  - `public\` - Web UI assets

### Data & Logs
- **Service Data**: `%PROGRAMDATA%\VibeTunnel\`
  - `logs\service.log` - Service logs
  - `logs\daemon\` - node-windows logs
  - `service.pid` - Process ID file

- **User Data**: `%USERPROFILE%\.vibetunnel\`
  - `control\` - Session data
  - `log.txt` - VibeTunnel logs

### Tray App
- **App Data**: `%APPDATA%\vibetunnel-tray\`
  - Configuration and logs

## Uninstallation

### Via Installer (Recommended)
1. Go to Settings → Apps → Installed Apps
2. Find "VibeTunnel"
3. Click Uninstall

### Manual
```powershell
# Stop and uninstall service (as Administrator)
cd windows/service
node uninstall.js

# Remove installation directory
Remove-Item "C:\Program Files\VibeTunnel" -Recurse -Force

# Remove data directory (optional)
Remove-Item "$env:PROGRAMDATA\VibeTunnel" -Recurse -Force
Remove-Item "$env:USERPROFILE\.vibetunnel" -Recurse -Force
```

## Security Considerations

### Administrator Privileges
- Service installation requires admin privileges
- Service runs with SYSTEM privileges
- Tray app runs with user privileges

### Network Security
- By default, VibeTunnel listens only on localhost (127.0.0.1)
- To expose to network, use `--bind 0.0.0.0` (not recommended without auth)
- Always enable authentication for network access

### Firewall
Windows Firewall may block VibeTunnel. Add exception:

```powershell
New-NetFirewallRule -DisplayName "VibeTunnel" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4020
```

## Advanced Configuration

### Custom Service Configuration

Edit `service/index.js` to customize:
- Log directory
- Max restart attempts
- Restart delay
- Service arguments (e.g., add `--bind`, `--port`)

### Custom Build

Edit `tray/package.json` build section:
- Change app name
- Modify installer options
- Configure auto-update
- Add code signing certificate

## Support

For issues, see:
- Main documentation: `../docs/`
- GitHub Issues: https://github.com/amantus-ai/vibetunnel/issues
- Service logs: `%PROGRAMDATA%\VibeTunnel\logs\service.log`
- VibeTunnel logs: `%USERPROFILE%\.vibetunnel\log.txt`

## License

See main project LICENSE file.
