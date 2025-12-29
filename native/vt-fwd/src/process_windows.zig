const std = @import("std");
const windows = std.os.windows;
const pty_windows = @import("pty_windows.zig");

/// Windows process creation using CreateProcess with ConPTY attachment
///
/// Unlike Unix fork/exec, Windows uses CreateProcess which creates a new process
/// in one step. We attach the ConPTY to the new process using STARTUPINFOEX.

const EXTENDED_STARTUPINFO_PRESENT: u32 = 0x00080000;
const PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE: usize = 0x00020016;

// Extended structures for ConPTY process creation
const STARTUPINFOEXW = extern struct {
    StartupInfo: windows.STARTUPINFOW,
    lpAttributeList: ?*anyopaque,
};

extern "kernel32" fn InitializeProcThreadAttributeList(
    lpAttributeList: ?*anyopaque,
    dwAttributeCount: u32,
    dwFlags: u32,
    lpSize: *usize,
) callconv(windows.WINAPI) windows.BOOL;

extern "kernel32" fn UpdateProcThreadAttribute(
    lpAttributeList: *anyopaque,
    dwFlags: u32,
    Attribute: usize,
    lpValue: *const anyopaque,
    cbSize: usize,
    lpPreviousValue: ?*anyopaque,
    lpReturnSize: ?*usize,
) callconv(windows.WINAPI) windows.BOOL;

extern "kernel32" fn DeleteProcThreadAttributeList(
    lpAttributeList: *anyopaque,
) callconv(windows.WINAPI) void;

pub const ProcessInfo = struct {
    process_handle: windows.HANDLE,
    thread_handle: windows.HANDLE,
    process_id: u32,
    thread_id: u32,

    pub fn deinit(self: *ProcessInfo) void {
        windows.CloseHandle(self.thread_handle);
        windows.CloseHandle(self.process_handle);
        self.* = undefined;
    }

    pub fn wait(self: ProcessInfo) !u32 {
        _ = windows.WaitForSingleObject(self.process_handle, windows.INFINITE) catch return error.WaitFailed;

        var exit_code: u32 = undefined;
        if (windows.kernel32.GetExitCodeProcess(self.process_handle, &exit_code) == 0) {
            return error.GetExitCodeFailed;
        }

        return exit_code;
    }

    pub fn terminate(self: ProcessInfo, exit_code: u32) !void {
        if (windows.kernel32.TerminateProcess(self.process_handle, exit_code) == 0) {
            return error.TerminateFailed;
        }
    }
};

pub const SpawnOptions = struct {
    pty: *pty_windows.Pty,
    command: []const []const u8,
    env_map: *const std.process.EnvMap,
    cwd: ?[]const u8 = null,
};

/// Spawn a process attached to a ConPTY
pub fn spawnWithConPty(allocator: std.mem.Allocator, options: SpawnOptions) !ProcessInfo {
    // Build command line (Windows requires a single string)
    const command_line = try buildCommandLine(allocator, options.command);
    defer allocator.free(command_line);

    const command_line_w = try windows.sliceToPrefixedFileW(null, command_line);
    defer allocator.free(command_line_w);

    // Build environment block
    const env_block = try buildEnvBlock(allocator, options.env_map);
    defer allocator.free(env_block);

    // Convert cwd to wide string if provided
    const cwd_w = if (options.cwd) |cwd|
        try windows.sliceToPrefixedFileW(null, cwd)
    else
        null;
    defer if (cwd_w) |cw| allocator.free(cw);

    // Create attribute list for ConPTY
    var attr_list_size: usize = 0;
    _ = InitializeProcThreadAttributeList(null, 1, 0, &attr_list_size);

    const attr_list = try allocator.alignedAlloc(u8, @alignOf(usize), attr_list_size);
    defer allocator.free(attr_list);

    if (InitializeProcThreadAttributeList(
        @ptrCast(attr_list.ptr),
        1,
        0,
        &attr_list_size,
    ) == 0) {
        return error.InitAttributeListFailed;
    }
    defer DeleteProcThreadAttributeList(@ptrCast(attr_list.ptr));

    // Attach ConPTY handle to the attribute list
    const hPC = options.pty.getConPtyHandle();
    if (UpdateProcThreadAttribute(
        @ptrCast(attr_list.ptr),
        0,
        PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
        &hPC,
        @sizeOf(@TypeOf(hPC)),
        null,
        null,
    ) == 0) {
        return error.UpdateAttributeFailed;
    }

    // Setup STARTUPINFOEX
    var startup_info: STARTUPINFOEXW = std.mem.zeroes(STARTUPINFOEXW);
    startup_info.StartupInfo.cb = @sizeOf(STARTUPINFOEXW);
    startup_info.lpAttributeList = @ptrCast(attr_list.ptr);

    var process_info: windows.PROCESS_INFORMATION = undefined;

    // Create the process
    const result = windows.kernel32.CreateProcessW(
        null, // Application name (use command line)
        command_line_w.ptr,
        null, // Process security attributes
        null, // Thread security attributes
        0, // Don't inherit handles
        windows.CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
        env_block.ptr,
        if (cwd_w) |cw| cw.ptr else null,
        @ptrCast(&startup_info),
        &process_info,
    );

    if (result == 0) {
        return error.CreateProcessFailed;
    }

    return ProcessInfo{
        .process_handle = process_info.hProcess,
        .thread_handle = process_info.hThread,
        .process_id = process_info.dwProcessId,
        .thread_id = process_info.dwThreadId,
    };
}

/// Build a Windows command line from arguments
/// Properly escapes arguments according to Windows rules
fn buildCommandLine(allocator: std.mem.Allocator, args: []const []const u8) ![]u8 {
    var result = std.ArrayList(u8).init(allocator);
    defer result.deinit();

    for (args, 0..) |arg, i| {
        if (i > 0) try result.append(' ');

        // Check if argument needs quoting
        const needs_quote = std.mem.indexOfAny(u8, arg, " \t\"") != null;

        if (needs_quote) try result.append('"');

        // Escape argument
        for (arg) |c| {
            if (c == '"') {
                try result.appendSlice("\\\"");
            } else if (c == '\\') {
                // Check if backslash is before a quote
                try result.append('\\');
            } else {
                try result.append(c);
            }
        }

        if (needs_quote) try result.append('"');
    }

    return result.toOwnedSlice();
}

/// Build Windows environment block (null-terminated wide string pairs)
fn buildEnvBlock(allocator: std.mem.Allocator, env_map: *const std.process.EnvMap) ![]u16 {
    var result = std.ArrayList(u16).init(allocator);
    defer result.deinit();

    var it = env_map.iterator();
    while (it.next()) |entry| {
        const key = entry.key_ptr.*;
        const value = entry.value_ptr.*;

        // Convert key=value to wide string
        const pair = try std.fmt.allocPrint(allocator, "{s}={s}", .{ key, value });
        defer allocator.free(pair);

        const pair_w = try windows.sliceToPrefixedFileW(null, pair);
        defer allocator.free(pair_w);

        // Append without the null terminator (we'll add one at the end)
        try result.appendSlice(pair_w[0 .. pair_w.len - 1]);
        try result.append(0);
    }

    // Double null terminator to mark end of environment block
    try result.append(0);

    return result.toOwnedSlice();
}
