const std = @import("std");
const windows = std.os.windows;

/// Windows-specific ConPTY (Pseudo Console) implementation for VibeTunnel
/// Uses CreatePseudoConsole API introduced in Windows 10 1809
///
/// Architecture:
/// - ConPTY provides a pseudo-console that can be attached to any process
/// - Uses Named Pipes for input/output communication
/// - Handles ANSI/VT sequences natively (unlike classic Windows Console)

pub const winsize = struct {
    ws_row: u16 = 100,
    ws_col: u16 = 80,
    ws_xpixel: u16 = 800,
    ws_ypixel: u16 = 600,
};

const HPCON = windows.HANDLE;
const COORD = extern struct {
    X: i16,
    Y: i16,
};

// Windows API declarations
extern "kernel32" fn CreatePseudoConsole(
    size: COORD,
    hInput: windows.HANDLE,
    hOutput: windows.HANDLE,
    dwFlags: u32,
    phPC: *HPCON,
) callconv(windows.WINAPI) windows.HRESULT;

extern "kernel32" fn ResizePseudoConsole(
    hPC: HPCON,
    size: COORD,
) callconv(windows.WINAPI) windows.HRESULT;

extern "kernel32" fn ClosePseudoConsole(
    hPC: HPCON,
) callconv(windows.WINAPI) void;

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

// Named Pipe constants
const PIPE_ACCESS_INBOUND: u32 = 0x00000001;
const PIPE_ACCESS_OUTBOUND: u32 = 0x00000002;
const PIPE_TYPE_BYTE: u32 = 0x00000000;
const PIPE_WAIT: u32 = 0x00000000;
const PIPE_UNLIMITED_INSTANCES: u32 = 255;

// ConPTY flags
const PSEUDOCONSOLE_INHERIT_CURSOR: u32 = 0x1;

pub const Pty = struct {
    pub const Fd = windows.HANDLE;
    pub const OpenError = error{ CreatePipeFailed, CreateConPTYFailed, OutOfMemory };
    pub const SetSizeError = error{ResizeFailed};
    pub const GetSizeError = error{NotSupported};
    pub const ChildPreExecError = error{NotNeeded};

    hPC: HPCON,
    input_read: Fd,
    input_write: Fd,
    output_read: Fd,
    output_write: Fd,
    allocator: std.mem.Allocator,
    current_size: winsize,

    /// Open a new ConPTY with the specified size
    pub fn open(allocator: std.mem.Allocator, size: winsize) OpenError!Pty {
        // Create pipes for ConPTY input
        var input_read: windows.HANDLE = undefined;
        var input_write: windows.HANDLE = undefined;

        if (windows.kernel32.CreatePipe(
            &input_read,
            &input_write,
            null,
            0,
        ) == 0) {
            return error.CreatePipeFailed;
        }
        errdefer {
            windows.CloseHandle(input_read);
            windows.CloseHandle(input_write);
        }

        // Create pipes for ConPTY output
        var output_read: windows.HANDLE = undefined;
        var output_write: windows.HANDLE = undefined;

        if (windows.kernel32.CreatePipe(
            &output_read,
            &output_write,
            null,
            0,
        ) == 0) {
            windows.CloseHandle(input_read);
            windows.CloseHandle(input_write);
            return error.CreatePipeFailed;
        }
        errdefer {
            windows.CloseHandle(output_read);
            windows.CloseHandle(output_write);
        }

        // Create ConPTY
        const coord = COORD{
            .X = @intCast(size.ws_col),
            .Y = @intCast(size.ws_row),
        };

        var hPC: HPCON = undefined;
        const hr = CreatePseudoConsole(
            coord,
            input_read,
            output_write,
            PSEUDOCONSOLE_INHERIT_CURSOR,
            &hPC,
        );

        if (hr < 0) {
            windows.CloseHandle(input_read);
            windows.CloseHandle(input_write);
            windows.CloseHandle(output_read);
            windows.CloseHandle(output_write);
            return error.CreateConPTYFailed;
        }

        return .{
            .hPC = hPC,
            .input_read = input_read,
            .input_write = input_write,
            .output_read = output_read,
            .output_write = output_write,
            .allocator = allocator,
            .current_size = size,
        };
    }

    /// Close the ConPTY and all associated handles
    pub fn deinit(self: *Pty) void {
        ClosePseudoConsole(self.hPC);
        windows.CloseHandle(self.input_read);
        windows.CloseHandle(self.input_write);
        windows.CloseHandle(self.output_read);
        windows.CloseHandle(self.output_write);
        self.* = undefined;
    }

    /// Resize the ConPTY
    pub fn setSize(self: *Pty, size: winsize) SetSizeError!void {
        const coord = COORD{
            .X = @intCast(size.ws_col),
            .Y = @intCast(size.ws_row),
        };

        const hr = ResizePseudoConsole(self.hPC, coord);
        if (hr < 0) {
            return error.ResizeFailed;
        }

        self.current_size = size;
    }

    /// Get current ConPTY size
    pub fn getSize(self: Pty) GetSizeError!winsize {
        return self.current_size;
    }

    /// Not needed on Windows - ConPTY handles process setup
    pub fn childPreExec(_: Pty) ChildPreExecError!void {
        return error.NotNeeded;
    }

    /// Get the master (output) file descriptor for reading terminal output
    pub fn getMasterReadFd(self: Pty) Fd {
        return self.output_read;
    }

    /// Get the master (input) file descriptor for writing terminal input
    pub fn getMasterWriteFd(self: Pty) Fd {
        return self.input_write;
    }

    /// Get the ConPTY handle for process creation
    pub fn getConPtyHandle(self: Pty) HPCON {
        return self.hPC;
    }
};

/// Get window size from a file descriptor (not supported on Windows)
pub fn getWinsizeFromFd(_: windows.HANDLE) Pty.GetSizeError!winsize {
    // Windows doesn't have a direct equivalent - return default
    // Actual size would need to be queried from console API
    return error.NotSupported;
}

/// Get console window size from Windows Console API
pub fn getConsoleWindowSize() !winsize {
    const stdout = windows.GetStdHandle(windows.STD_OUTPUT_HANDLE) catch return error.GetHandleFailed;

    var csbi: windows.CONSOLE_SCREEN_BUFFER_INFO = undefined;
    if (windows.kernel32.GetConsoleScreenBufferInfo(stdout, &csbi) == 0) {
        return error.GetConsoleInfoFailed;
    }

    const width = csbi.srWindow.Right - csbi.srWindow.Left + 1;
    const height = csbi.srWindow.Bottom - csbi.srWindow.Top + 1;

    return winsize{
        .ws_col = @intCast(width),
        .ws_row = @intCast(height),
        .ws_xpixel = 0,
        .ws_ypixel = 0,
    };
}
