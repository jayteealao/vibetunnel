/**
 * VibeTunnel System Tray Application
 *
 * A lightweight Electron app that provides system tray integration
 * for managing the VibeTunnel Windows Service.
 */

const { app, Tray, Menu, shell, dialog, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const Store = require('electron-store');

// Configuration
const store = new Store();
const SERVICE_NAME = 'VibeTunnel';
const WEB_UI_URL = 'http://localhost:4020';
const CHECK_INTERVAL = 5000; // 5 seconds

let tray = null;
let statusWindow = null;
let serviceStatus = 'unknown';
let checkInterval = null;

// Get icon path (we'll need to create these)
function getIconPath(status) {
  const iconName = status === 'running' ? 'icon-active.ico' : 'icon-inactive.ico';
  return path.join(__dirname, 'assets', iconName);
}

// Check if service is running
function checkServiceStatus(callback) {
  exec(`sc query "${SERVICE_NAME}"`, (error, stdout, stderr) => {
    if (error) {
      callback('stopped');
      return;
    }

    const isRunning = stdout.includes('RUNNING');
    callback(isRunning ? 'running' : 'stopped');
  });
}

// Start service
function startService() {
  exec(`sc start "${SERVICE_NAME}"`, (error, stdout, stderr) => {
    if (error) {
      dialog.showErrorBox('Failed to Start Service',
        `Could not start VibeTunnel service.\n\n${stderr || error.message}`
      );
      return;
    }

    dialog.showMessageBox({
      type: 'info',
      title: 'Service Started',
      message: 'VibeTunnel service started successfully!',
      buttons: ['OK'],
    });

    updateTray();
  });
}

// Stop service
function stopService() {
  exec(`sc stop "${SERVICE_NAME}"`, (error, stdout, stderr) => {
    if (error) {
      dialog.showErrorBox('Failed to Stop Service',
        `Could not stop VibeTunnel service.\n\n${stderr || error.message}`
      );
      return;
    }

    dialog.showMessageBox({
      type: 'info',
      title: 'Service Stopped',
      message: 'VibeTunnel service stopped successfully!',
      buttons: ['OK'],
    });

    updateTray();
  });
}

// Restart service
function restartService() {
  stopService();
  setTimeout(() => {
    startService();
  }, 2000);
}

// Check if service is installed
function checkServiceInstalled(callback) {
  exec(`sc query "${SERVICE_NAME}"`, (error, stdout, stderr) => {
    callback(!error);
  });
}

// Install service
function installService() {
  const servicePath = path.join(
    process.resourcesPath || path.join(__dirname, '..'),
    'service',
    'install.js'
  );

  if (!fs.existsSync(servicePath)) {
    dialog.showErrorBox('Installation Failed',
      `Service installer not found at:\n${servicePath}`
    );
    return;
  }

  // Run install script with elevated privileges
  const command = `powershell -Command "Start-Process node -ArgumentList '${servicePath}' -Verb RunAs -Wait"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      dialog.showErrorBox('Installation Failed',
        `Could not install service.\n\n${stderr || error.message}`
      );
      return;
    }

    dialog.showMessageBox({
      type: 'info',
      title: 'Service Installed',
      message: 'VibeTunnel service installed successfully!\n\nThe service will start automatically.',
      buttons: ['OK'],
    });

    updateTray();
  });
}

// Uninstall service
function uninstallService() {
  const result = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Uninstall Service',
    message: 'Are you sure you want to uninstall the VibeTunnel service?',
    buttons: ['Cancel', 'Uninstall'],
    defaultId: 0,
    cancelId: 0,
  });

  if (result !== 1) return;

  const servicePath = path.join(
    process.resourcesPath || path.join(__dirname, '..'),
    'service',
    'uninstall.js'
  );

  const command = `powershell -Command "Start-Process node -ArgumentList '${servicePath}' -Verb RunAs -Wait"`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      dialog.showErrorBox('Uninstallation Failed',
        `Could not uninstall service.\n\n${stderr || error.message}`
      );
      return;
    }

    dialog.showMessageBox({
      type: 'info',
      title: 'Service Uninstalled',
      message: 'VibeTunnel service uninstalled successfully!',
      buttons: ['OK'],
    });

    updateTray();
  });
}

// Open web UI
function openWebUI() {
  checkServiceStatus((status) => {
    if (status !== 'running') {
      const result = dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Service Not Running',
        message: 'The VibeTunnel service is not running.\n\nWould you like to start it?',
        buttons: ['Cancel', 'Start Service'],
        defaultId: 1,
      });

      if (result === 1) {
        startService();
        setTimeout(() => {
          shell.openExternal(WEB_UI_URL);
        }, 3000);
      }
    } else {
      shell.openExternal(WEB_UI_URL);
    }
  });
}

// Show status window
function showStatus() {
  if (statusWindow) {
    statusWindow.focus();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  statusWindow.loadFile(path.join(__dirname, 'status.html'));
  statusWindow.once('ready-to-show', () => {
    statusWindow.show();
  });

  statusWindow.on('closed', () => {
    statusWindow = null;
  });
}

// Update tray icon and menu
function updateTray() {
  checkServiceStatus((status) => {
    serviceStatus = status;

    // Update icon
    const iconPath = getIconPath(status);
    if (fs.existsSync(iconPath)) {
      tray.setImage(iconPath);
    }

    // Update tooltip
    const tooltip = status === 'running'
      ? 'VibeTunnel - Running'
      : 'VibeTunnel - Stopped';
    tray.setToolTip(tooltip);

    // Update menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `VibeTunnel - ${status === 'running' ? 'Running' : 'Stopped'}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Open Web UI',
        click: openWebUI,
        enabled: status === 'running',
      },
      { type: 'separator' },
      {
        label: 'Start Service',
        click: startService,
        enabled: status !== 'running',
      },
      {
        label: 'Stop Service',
        click: stopService,
        enabled: status === 'running',
      },
      {
        label: 'Restart Service',
        click: restartService,
        enabled: status === 'running',
      },
      { type: 'separator' },
      {
        label: 'Install Service',
        click: installService,
      },
      {
        label: 'Uninstall Service',
        click: uninstallService,
      },
      { type: 'separator' },
      {
        label: 'Launch on Startup',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({
            openAtLogin: item.checked,
          });
        },
      },
      { type: 'separator' },
      {
        label: 'About',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'About VibeTunnel',
            message: 'VibeTunnel',
            detail: `Version: ${app.getVersion()}\n\nTerminal sharing with web interface\n\nhttps://vibetunnel.sh`,
            buttons: ['OK'],
          });
        },
      },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
  });
}

// Initialize tray
function createTray() {
  const iconPath = getIconPath('stopped');
  tray = new Tray(iconPath);

  tray.setToolTip('VibeTunnel');

  // Initial menu (will be updated by checkServiceStatus)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Loading...', enabled: false },
  ]));

  // Update immediately
  updateTray();

  // Set up periodic status checks
  checkInterval = setInterval(updateTray, CHECK_INTERVAL);

  // Handle tray icon click
  tray.on('click', () => {
    openWebUI();
  });
}

// App ready
app.whenReady().then(() => {
  createTray();

  // Check if service is installed, prompt if not
  checkServiceInstalled((installed) => {
    if (!installed) {
      const result = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Service Not Installed',
        message: 'The VibeTunnel Windows Service is not installed.\n\nWould you like to install it now?',
        buttons: ['Later', 'Install'],
        defaultId: 1,
      });

      if (result === 1) {
        installService();
      }
    }
  });
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Clean up on quit
app.on('before-quit', () => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
});

// Handle second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    openWebUI();
  });
}
