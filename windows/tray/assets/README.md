# VibeTunnel Tray Icons

This directory should contain the following icon files:

## Required Icons

### `icon.ico`
- Main application icon
- Size: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16 (multi-size .ico)
- Used for: App icon, installer, shortcuts

### `icon-active.ico`
- System tray icon (service running)
- Size: 16x16, 32x32 (for high DPI)
- Style: Colored or with a green indicator

### `icon-inactive.ico`
- System tray icon (service stopped)
- Size: 16x16, 32x32 (for high DPI)
- Style: Grayscale or with a red indicator

## Creating Icons

You can create `.ico` files from PNG images using online tools or ImageMagick:

```bash
# Using ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
convert icon-active.png -define icon:auto-resize=32,16 icon-active.ico
convert icon-inactive.png -define icon:auto-resize=32,16 icon-inactive.ico
```

## Temporary Fallback

If icons are not available, the app will use Electron's default icon.
For production, proper branded icons should be created.

## Design Guidelines

- **Main Icon**: Should represent VibeTunnel's brand identity
- **Active Icon**: Clear visual indicator that service is running (e.g., green dot)
- **Inactive Icon**: Clear visual indicator that service is stopped (e.g., gray or red)
- Follow Windows icon design guidelines for system tray icons
