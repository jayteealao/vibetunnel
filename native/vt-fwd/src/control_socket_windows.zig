const std = @import("std");
const windows = std.os.windows;
const logger_mod = @import("logger.zig");

/// Windows Named Pipe implementation of control socket IPC
/// Uses \\.\pipe\vibetunnel-{session-id} for communication

pub const MessageType = enum(u8) {
    stdin_data = 0x01,
    control_cmd = 0x02,
    status_update = 0x03,
    heartbeat = 0x04,
    @"error" = 0x05,
};

pub const Handler = struct {
    context: *anyopaque,
    logger: *logger_mod.Logger,
    on_stdin: *const fn (context: *anyopaque, data: []const u8) void,
    on_resize: *const fn (context: *anyopaque, cols: u16, rows: u16) void,
    on_reset_size: *const fn (context: *anyopaque) void,
    on_kill: *const fn (context: *anyopaque, signal: ?i32) void,
    on_update_title: *const fn (context: *anyopaque, title: []const u8) void,
};

// Windows API declarations
extern "kernel32" fn CreateNamedPipeA(
    lpName: [*:0]const u8,
    dwOpenMode: u32,
    dwPipeMode: u32,
    nMaxInstances: u32,
    nOutBufferSize: u32,
    nInBufferSize: u32,
    nDefaultTimeOut: u32,
    lpSecurityAttributes: ?*anyopaque,
) callconv(windows.WINAPI) windows.HANDLE;

extern "kernel32" fn ConnectNamedPipe(
    hNamedPipe: windows.HANDLE,
    lpOverlapped: ?*anyopaque,
) callconv(windows.WINAPI) windows.BOOL;

extern "kernel32" fn DisconnectNamedPipe(
    hNamedPipe: windows.HANDLE,
) callconv(windows.WINAPI) windows.BOOL;

// Named Pipe constants
const PIPE_ACCESS_DUPLEX: u32 = 0x00000003;
const PIPE_TYPE_BYTE: u32 = 0x00000000;
const PIPE_WAIT: u32 = 0x00000000;
const PIPE_UNLIMITED_INSTANCES: u32 = 255;
const INVALID_HANDLE_VALUE = @as(windows.HANDLE, @ptrFromInt(@as(usize, @bitCast(@as(isize, -1)))));

pub const Server = struct {
    pipe_handle: windows.HANDLE,
    pipe_name: []const u8,
    allocator: std.mem.Allocator,
    handler: Handler,
    running: *std.atomic.Value(bool),

    pub fn init(
        allocator: std.mem.Allocator,
        pipe_path: []const u8,
        handler: Handler,
        running: *std.atomic.Value(bool),
    ) !Server {
        // Convert Unix-style path to Windows pipe name
        // Expected input: ~/.vibetunnel/control/{session-id}/ipc.sock
        // Convert to: \\.\pipe\vibetunnel-{session-id}

        var pipe_name_buf: [256]u8 = undefined;
        const pipe_name = blk: {
            // Extract session ID from path (last directory component before ipc.sock)
            var it = std.mem.splitBackwardsScalar(u8, pipe_path, '/');
            _ = it.next(); // skip ipc.sock
            const session_id = it.next() orelse "default";

            break :blk try std.fmt.bufPrintZ(
                &pipe_name_buf,
                "\\\\.\\pipe\\vibetunnel-{s}",
                .{session_id},
            );
        };

        const pipe_handle = CreateNamedPipeA(
            pipe_name.ptr,
            PIPE_ACCESS_DUPLEX,
            PIPE_TYPE_BYTE | PIPE_WAIT,
            PIPE_UNLIMITED_INSTANCES,
            4096, // Output buffer size
            4096, // Input buffer size
            0, // Default timeout
            null, // Default security
        );

        if (pipe_handle == INVALID_HANDLE_VALUE) {
            return error.CreatePipeFailed;
        }

        const pipe_name_owned = try allocator.dupe(u8, std.mem.sliceTo(pipe_name, 0));

        return .{
            .pipe_handle = pipe_handle,
            .pipe_name = pipe_name_owned,
            .allocator = allocator,
            .handler = handler,
            .running = running,
        };
    }

    pub fn run(self: *Server) void {
        while (self.running.load(.acquire)) {
            // Wait for client connection
            const connected = ConnectNamedPipe(self.pipe_handle, null);

            if (connected == 0) {
                const err = windows.kernel32.GetLastError();
                // ERROR_PIPE_CONNECTED means client already connected
                if (err != .PIPE_CONNECTED) {
                    std.time.sleep(100 * std.time.ns_per_ms);
                    continue;
                }
            }

            self.handleClient();
            _ = DisconnectNamedPipe(self.pipe_handle);
        }
    }

    pub fn stop(self: *Server) void {
        windows.CloseHandle(self.pipe_handle);
        self.allocator.free(self.pipe_name);
    }

    fn handleClient(self: *Server) void {
        var buffer = std.ArrayList(u8).empty;
        defer buffer.deinit(self.allocator);
        var temp: [4096]u8 = undefined;

        while (self.running.load(.acquire)) {
            var bytes_read: u32 = 0;
            const result = windows.kernel32.ReadFile(
                self.pipe_handle,
                &temp,
                temp.len,
                &bytes_read,
                null,
            );

            if (result == 0 or bytes_read == 0) break;

            _ = buffer.appendSlice(self.allocator, temp[0..bytes_read]) catch break;

            // Process messages with length-prefixed framing
            while (buffer.items.len >= 5) {
                const msg_type: MessageType = @enumFromInt(buffer.items[0]);
                const payload_len = std.mem.readInt(u32, buffer.items[1..5], .big);

                if (buffer.items.len < 5 + payload_len) break;

                const payload = buffer.items[5 .. 5 + payload_len];
                self.dispatchMessage(msg_type, payload);
                buffer.replaceRange(self.allocator, 0, 5 + payload_len, &[_]u8{}) catch break;
            }
        }
    }

    fn dispatchMessage(self: *Server, msg_type: MessageType, payload: []const u8) void {
        switch (msg_type) {
            .stdin_data => self.handler.on_stdin(self.handler.context, payload),
            .control_cmd => self.handleControl(payload),
            .heartbeat => self.sendHeartbeat(),
            else => {},
        }
    }

    fn handleControl(self: *Server, payload: []const u8) void {
        var parsed = std.json.parseFromSlice(std.json.Value, self.allocator, payload, .{}) catch return;
        defer parsed.deinit();

        if (parsed.value != .object) return;
        const cmd_value = parsed.value.object.get("cmd") orelse return;
        if (cmd_value != .string) return;
        const cmd = cmd_value.string;

        if (std.mem.eql(u8, cmd, "resize")) {
            const cols = parseNumber(parsed.value.object.get("cols")) orelse return;
            const rows = parseNumber(parsed.value.object.get("rows")) orelse return;
            self.handler.on_resize(self.handler.context, @intCast(cols), @intCast(rows));
            return;
        }

        if (std.mem.eql(u8, cmd, "reset-size")) {
            self.handler.on_reset_size(self.handler.context);
            return;
        }

        if (std.mem.eql(u8, cmd, "kill")) {
            const signal = parseSignal(parsed.value.object.get("signal"));
            self.handler.on_kill(self.handler.context, signal);
            return;
        }

        if (std.mem.eql(u8, cmd, "update-title")) {
            const title_value = parsed.value.object.get("title") orelse return;
            if (title_value != .string) return;
            self.handler.on_update_title(self.handler.context, title_value.string);
            return;
        }
    }

    fn sendHeartbeat(self: *Server) void {
        const response = "OK";
        var bytes_written: u32 = 0;
        _ = windows.kernel32.WriteFile(
            self.pipe_handle,
            response.ptr,
            response.len,
            &bytes_written,
            null,
        );
    }
};

fn parseNumber(value: ?std.json.Value) ?i64 {
    const v = value orelse return null;
    return switch (v) {
        .integer => |i| i,
        .number_string => |s| std.fmt.parseInt(i64, s, 10) catch null,
        else => null,
    };
}

fn parseSignal(value: ?std.json.Value) ?i32 {
    const num = parseNumber(value) orelse return null;
    return @intCast(num);
}
