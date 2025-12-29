const std = @import("std");
const builtin = @import("builtin");

/// Cross-platform IPC abstraction for control socket
/// - Unix (macOS/Linux): Uses Unix domain sockets
/// - Windows: Uses Named Pipes

// Re-export types from platform-specific implementation
pub const MessageType = @import(if (builtin.os.tag == .windows)
    "control_socket_windows.zig"
else
    "control_socket_unix.zig").MessageType;

pub const Handler = @import(if (builtin.os.tag == .windows)
    "control_socket_windows.zig"
else
    "control_socket_unix.zig").Handler;

pub const Server = @import(if (builtin.os.tag == .windows)
    "control_socket_windows.zig"
else
    "control_socket_unix.zig").Server;
