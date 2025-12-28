# Windows Support

VibeTunnel provides full Windows support starting from version 1.0.0-beta.17. This document outlines the Windows-specific features, requirements, and implementation details.

## Requirements

### System Requirements
- **OS**: Windows 10 or later (64-bit)
- **Node.js**: 22.12.0 or later
- **Optional**: Bonjour for Windows (for mDNS service discovery)

### Supported Shells
VibeTunnel automatically detects and uses the best available shell on Windows:

1. **PowerShell Core (pwsh)** - Recommended, modern cross-platform PowerShell
2. **Windows PowerShell** - Built-in PowerShell (v5.1)
3. **Command Prompt (cmd.exe)** - Classic Windows command shell
4. **WSL Bash** - Windows Subsystem for Linux
5. **Git Bash** - Bash shell from Git for Windows

## Installation

```powershell
# Install via npm
npm install -g vibetunnel

# Or using yarn
yarn global add vibetunnel

# Or using pnpm
pnpm add -g vibetunnel
```

## Windows-Specific Features

### 1. ConPTY Support
VibeTunnel uses Windows Pseudo Console (ConPTY) for native terminal emulation on Windows. ConPTY provides:
- Full Unicode support
- ANSI escape sequence handling
- Proper terminal resizing
- Native Windows console experience

### 2. Named Pipes IPC
On Windows, VibeTunnel uses Named Pipes instead of Unix Domain Sockets for inter-process communication:
- **Format**: `\\.\pipe\vibetunnel-control`
- **Security**: Proper Windows ACL permissions
- **Performance**: Equivalent to Unix sockets

### 3. Path Handling
VibeTunnel automatically handles Windows path conventions:
- Converts WSL paths (`/mnt/c/Users/...`) to Windows paths (`C:\Users\...`)
- Handles both forward slashes and backslashes
- Supports UNC paths (`\\server\share`)
- Resolves drive letters correctly

### 4. Shell Detection
Automatic detection of available shells with intelligent defaults:
```javascript
import { getAvailableShells, getDefaultShell } from 'vibetunnel/utils/shell-detection';

// Get default shell
const defaultShell = getDefaultShell();
// Returns PowerShell Core if available, otherwise PowerShell, then cmd.exe

// Get all available shells
const shells = getAvailableShells();
// Returns array of all detected shells with metadata
```

## Authentication on Windows

### Environment-Based Authentication
Windows installations use environment variable-based authentication by default:

```powershell
# Set authentication password
$env:VIBETUNNEL_PASSWORD = "your-secure-password"

# Start server
vibetunnel
```

### Why Not PAM?
PAM (Pluggable Authentication Modules) is a Unix/Linux-specific authentication framework. Windows uses different authentication mechanisms (SSPI, Local Security Authority, etc.).

For simplicity and consistency, VibeTunnel uses environment variable authentication on Windows. Future versions may add:
- Windows Credential Manager integration
- Active Directory / Windows Hello support
- Biometric authentication

## Running as a Service

### Option 1: Using NSSM (Recommended)
[NSSM (Non-Sucking Service Manager)](https://nssm.cc/) makes it easy to run VibeTunnel as a Windows service:

```powershell
# Install NSSM
choco install nssm

# Create service
nssm install VibeTunnel "C:\Program Files\nodejs\vibetunnel.cmd"
nssm set VibeTunnel AppDirectory "C:\Users\YourUsername"
nssm set VibeTunnel AppEnvironmentExtra "VIBETUNNEL_PASSWORD=your-password"

# Start service
nssm start VibeTunnel
```

### Option 2: Using Windows Task Scheduler
```powershell
# Create a scheduled task that runs at startup
$action = New-ScheduledTaskAction -Execute "vibetunnel"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName "VibeTunnel" -Action $action -Trigger $trigger -Principal $principal
```

## Firewall Configuration

Windows Firewall may block incoming connections. Add a firewall rule:

```powershell
# Allow VibeTunnel through Windows Firewall
New-NetFirewallRule -DisplayName "VibeTunnel" `
  -Direction Inbound `
  -Program "C:\Program Files\nodejs\node.exe" `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 4020

# Or using netsh
netsh advfirewall firewall add rule name="VibeTunnel" dir=in action=allow protocol=TCP localport=4020
```

## mDNS Service Discovery

### Installing Bonjour for Windows
For mDNS service discovery to work on Windows, you need Bonjour for Windows:

**Option 1: Install with Bonjour Print Services**
Download from [Apple's website](https://support.apple.com/kb/DL999)

**Option 2: Already installed?**
If you have iTunes, iCloud, or other Apple software installed, Bonjour for Windows is likely already present.

**Option 3: Use static IP**
mDNS is optional. You can access VibeTunnel via IP address or hostname without Bonjour.

## Windows Native App (Coming Soon)

A native Windows application is planned with the following features:
- **System Tray Integration**: Run VibeTunnel in the background
- **Auto-Start**: Configure to start with Windows
- **GUI Configuration**: Easy setup without command line
- **Windows Terminal Integration**: Open sessions in Windows Terminal
- **Notification Center**: Native Windows notifications

## Development on Windows

### Building from Source
```powershell
# Clone repository
git clone https://github.com/amantus-ai/vibetunnel.git
cd vibetunnel/web

# Install dependencies
pnpm install

# Build native modules (requires build tools)
pnpm run build:native

# Build project
pnpm run build

# Run tests
pnpm test
```

### Prerequisites for Building
1. **Visual Studio Build Tools**:
   ```powershell
   # Using Chocolatey
   choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools"
   ```

2. **Python** (for node-gyp):
   ```powershell
   choco install python
   ```

3. **Node.js with npm**:
   ```powershell
   choco install nodejs-lts
   ```

## Troubleshooting

### Issue: "PTY spawn failed"
**Solution**: Ensure you're using Node.js 22.12.0 or later. ConPTY requires modern Node.js versions.

### Issue: "Module not found: conpty.node"
**Solution**: Rebuild native modules:
```powershell
cd node_modules/vibetunnel
pnpm run build:native
```

### Issue: "Cannot connect to server"
**Solution**: Check Windows Firewall settings and ensure the port (default 4020) is allowed.

### Issue: "Shell not found"
**Solution**: Set the SHELL environment variable or install PowerShell Core:
```powershell
winget install Microsoft.PowerShell
```

### Issue: "Permission denied"
**Solution**: Run PowerShell as Administrator or adjust folder permissions:
```powershell
icacls "C:\Users\YourUsername\.vibetunnel" /grant YourUsername:F /t
```

## Known Limitations

1. **No PAM Authentication**: Windows uses environment variable authentication instead
2. **Bonjour Required for mDNS**: Optional dependency for service discovery
3. **No Native App Yet**: Currently CLI-only, GUI app in development

## Feature Parity Matrix

| Feature | Windows | macOS | Linux |
|---------|---------|-------|-------|
| Terminal Sessions | ✅ | ✅ | ✅ |
| Shell Detection | ✅ | ✅ | ✅ |
| Web Interface | ✅ | ✅ | ✅ |
| File Upload/Download | ✅ | ✅ | ✅ |
| Session Recording | ✅ | ✅ | ✅ |
| Git Integration | ✅ | ✅ | ✅ |
| mDNS Discovery | ✅* | ✅ | ✅ |
| Native App | 🚧 | ✅ | ❌ |
| System Tray | 🚧 | ✅ | ❌ |
| PAM Auth | ❌ | ✅ | ✅ |
| Env Auth | ✅ | ✅ | ✅ |

*Requires Bonjour for Windows
🚧 = In development

## Contributing

We welcome contributions to improve Windows support! Areas of interest:
- Native Windows application (Electron/Tauri)
- Windows Credential Manager integration
- Performance optimizations
- Bug fixes and testing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

## Related Documentation

- [Architecture](./ARCHITECTURE.md)
- [API Specification](./spec.md)
- [Release Process](./RELEASE.md)
