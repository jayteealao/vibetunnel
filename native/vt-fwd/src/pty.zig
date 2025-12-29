const std = @import("std");
const builtin = @import("builtin");

/// Cross-platform PTY abstraction
/// - Unix (macOS/Linux): Uses openpty() and termios
/// - Windows: Uses ConPTY (CreatePseudoConsole)

pub const winsize = @import(if (builtin.os.tag == .windows)
    "pty_windows.zig"
else
    "pty_unix.zig").winsize;

pub const Pty = @import(if (builtin.os.tag == .windows)
    "pty_windows.zig"
else
    "pty_unix.zig").Pty;

pub const getWinsizeFromFd = @import(if (builtin.os.tag == .windows)
    "pty_windows.zig"
else
    "pty_unix.zig").getWinsizeFromFd;

// Re-export platform-specific constants for Unix compatibility
pub const TIOCSCTTY = if (builtin.os.tag != .windows)
    @import("pty_unix.zig").TIOCSCTTY
else
    0;

// Utility function to open PTY with unified interface
pub fn open(allocator: std.mem.Allocator, size: winsize) Pty.OpenError!Pty {
    if (builtin.os.tag == .windows) {
        const pty_windows = @import("pty_windows.zig");
        return pty_windows.Pty.open(allocator, size);
    } else {
        const pty_unix = @import("pty_unix.zig");
        return pty_unix.Pty.open(size);
    }
}
