const std = @import("std");
const windows = std.os.windows;
const pty_windows = @import("pty_windows.zig");
const process_windows = @import("process_windows.zig");
const logger_mod = @import("logger.zig");

/// Windows-specific process spawning and management
/// This module handles the Windows-specific parts that differ from Unix:
/// - Uses CreateProcess instead of fork/exec
/// - Uses Windows console API for terminal size
/// - Handles Windows process termination

pub fn spawnProcess(
    allocator: std.mem.Allocator,
    pty: *pty_windows.Pty,
    command: []const []const u8,
    cwd: []const u8,
    env_map: *std.process.EnvMap,
    logger: *logger_mod.Logger,
) !process_windows.ProcessInfo {
    logger.logInfo("Spawning process on Windows with ConPTY", .{});

    const proc_info = try process_windows.spawnWithConPty(allocator, .{
        .pty = pty,
        .command = command,
        .env_map = env_map,
        .cwd = cwd,
    });

    logger.logInfo("Process created: PID {d}", .{proc_info.process_id});

    return proc_info;
}

pub fn getInitialTerminalSize() !pty_windows.winsize {
    return pty_windows.getConsoleWindowSize() catch {
        // Fallback to reasonable defaults
        return pty_windows.winsize{
            .ws_col = 120,
            .ws_row = 40,
            .ws_xpixel = 0,
            .ws_ypixel = 0,
        };
    };
}

pub fn isTerminal(handle: windows.HANDLE) bool {
    var mode: u32 = undefined;
    return windows.kernel32.GetConsoleMode(handle, &mode) != 0;
}

/// Windows doesn't have Unix signals, but we can simulate with events
pub fn installSignalHandlers() !void {
    // On Windows, Ctrl+C is handled automatically by the console
    // We can use SetConsoleCtrlHandler if we need custom handling
    // For now, rely on default behavior
}

pub fn handleWindowsSignals(_: *std.atomic.Value(bool)) void {
    // Windows signal handling would go here if needed
    // For now, the console's default Ctrl+C handler is sufficient
}

/// Get home directory on Windows
pub fn getHomeDir() []const u8 {
    if (std.os.getenv("USERPROFILE")) |home| {
        return home;
    }
    if (std.os.getenv("HOMEDRIVE")) |drive| {
        if (std.os.getenv("HOMEPATH")) |path_suffix| {
            // This leaks, but it's a one-time allocation for the lifetime of the program
            const home = std.fmt.allocPrint(
                std.heap.page_allocator,
                "{s}{s}",
                .{ drive, path_suffix },
            ) catch return "C:\\";
            return home;
        }
    }
    return "C:\\";
}

/// Convert Unix-style path to Windows path
pub fn normalizeWindowsPath(allocator: std.mem.Allocator, unix_path: []const u8) ![]u8 {
    // Replace forward slashes with backslashes
    var result = try allocator.dupe(u8, unix_path);
    for (result) |*c| {
        if (c.* == '/') c.* = '\\';
    }
    return result;
}

/// Check if a process is still alive (by PID)
pub fn isProcessAlive(pid: i32) !bool {
    if (pid <= 0) return false;

    // Open process handle with minimal rights (just to check if it exists)
    const handle = windows.OpenProcess(
        windows.SYNCHRONIZE,
        windows.FALSE,
        @intCast(pid),
    ) catch {
        // If we can't open it, assume it's dead
        return false;
    };
    defer windows.CloseHandle(handle);

    // Check if process has exited
    var exit_code: u32 = 0;
    if (windows.kernel32.GetExitCodeProcess(handle, &exit_code) == 0) {
        return false;
    }

    // STILL_ACTIVE = 259 means process is still running
    const STILL_ACTIVE: u32 = 259;
    return exit_code == STILL_ACTIVE;
}

/// Wait for process to exit and get exit code (by PID)
pub fn waitForProcess(pid: i32) !struct { exit_code: i32, signal: ?u8 } {
    if (pid <= 0) return .{ .exit_code = 1, .signal = null };

    const handle = windows.OpenProcess(
        windows.SYNCHRONIZE | windows.PROCESS_QUERY_INFORMATION,
        windows.FALSE,
        @intCast(pid),
    ) catch return .{ .exit_code = 1, .signal = null };
    defer windows.CloseHandle(handle);

    // Wait for process to exit
    _ = windows.WaitForSingleObject(handle, windows.INFINITE) catch {
        return .{ .exit_code = 1, .signal = null };
    };

    // Get exit code
    var exit_code: u32 = 0;
    if (windows.kernel32.GetExitCodeProcess(handle, &exit_code) == 0) {
        return .{ .exit_code = 1, .signal = null };
    }

    return .{ .exit_code = @intCast(exit_code), .signal = null };
}

/// Terminate a process (by PID)
pub fn terminateProcess(pid: i32) !void {
    if (pid <= 0) return;

    const handle = windows.OpenProcess(
        windows.PROCESS_TERMINATE,
        windows.FALSE,
        @intCast(pid),
    ) catch return;
    defer windows.CloseHandle(handle);

    _ = windows.TerminateProcess(handle, 1);
}

/// Read from ConPTY output (non-blocking with timeout)
pub fn readFromPty(
    pty: *pty_windows.Pty,
    buffer: []u8,
    timeout_ms: u32,
) !usize {
    const handle = pty.getMasterReadFd();

    // Use overlapped I/O for timeout support
    var overlapped: windows.OVERLAPPED = std.mem.zeroes(windows.OVERLAPPED);
    var bytes_read: u32 = 0;

    const result = windows.kernel32.ReadFile(
        handle,
        buffer.ptr,
        @intCast(buffer.len),
        &bytes_read,
        &overlapped,
    );

    if (result != 0) {
        return bytes_read;
    }

    const err = windows.kernel32.GetLastError();
    if (err == .IO_PENDING) {
        // Wait for completion
        const wait_result = windows.WaitForSingleObject(
            handle,
            timeout_ms,
        ) catch return error.WaitFailed;

        if (wait_result == windows.WAIT_TIMEOUT) {
            return 0;
        }

        if (windows.kernel32.GetOverlappedResult(
            handle,
            &overlapped,
            &bytes_read,
            0,
        ) == 0) {
            return error.ReadFailed;
        }

        return bytes_read;
    }

    return error.ReadFailed;
}

/// Write to ConPTY input
pub fn writeToPty(pty: *pty_windows.Pty, data: []const u8) !usize {
    const handle = pty.getMasterWriteFd();

    var bytes_written: u32 = 0;
    const result = windows.kernel32.WriteFile(
        handle,
        data.ptr,
        @intCast(data.len),
        &bytes_written,
        null,
    );

    if (result == 0) {
        return error.WriteFailed;
    }

    return bytes_written;
}
