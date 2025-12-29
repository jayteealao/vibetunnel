"use strict";
/**
 * Simplified Windows terminal implementation without threading
 * Removed ConoutSocketWorker and shared pipe architecture
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsTerminal = void 0;
const fs = __importStar(require("fs"));
const net = __importStar(require("net"));
const net_1 = require("net");
const terminal_1 = require("./terminal");
const utils_1 = require("./utils");
const DEFAULT_FILE = 'cmd.exe';
const DEFAULT_NAME = 'Windows Shell';
let conptyNative;
class WindowsTerminal extends terminal_1.Terminal {
    get master() { return this._outSocket; }
    get slave() { return this._inSocket; }
    // Override emit to use internal event emitter, preventing infinite loop
    // when socket handlers call this.emit() which would otherwise go back to the socket
    emit(eventName, ...args) {
        return this._internalee.emit(eventName, ...args);
    }
    // Override on to use internal event emitter for consistency
    on(eventName, listener) {
        this._internalee.on(eventName, listener);
    }
    addListener(eventName, listener) {
        this.on(eventName, listener);
    }
    removeListener(eventName, listener) {
        this._internalee.removeListener(eventName, listener);
    }
    once(eventName, listener) {
        this._internalee.once(eventName, listener);
    }
    constructor(file, args, opt) {
        super(opt);
        this._isReady = false;
        this._pid = 0;
        this._innerPid = 0;
        this._useConptyDll = false;
        // Load native module
        if (!conptyNative) {
            try {
                conptyNative = require('../build/Release/pty.node');
            }
            catch (outerError) {
                try {
                    conptyNative = require('../build/Debug/pty.node');
                }
                catch (innerError) {
                    throw outerError;
                }
            }
        }
        this._ptyNative = conptyNative;
        // Initialize arguments
        args = args || [];
        file = file || DEFAULT_FILE;
        opt = opt || {};
        opt.env = opt.env || process.env;
        const env = (0, utils_1.assign)({}, opt.env);
        this._cols = opt.cols || terminal_1.DEFAULT_COLS;
        this._rows = opt.rows || terminal_1.DEFAULT_ROWS;
        const cwd = opt.cwd || process.cwd();
        const parsedEnv = this._parseEnv(env);
        // Compose command line
        const commandLine = this._argsToCommandLine(file, args);
        // Start ConPTY process
        const pipeName = this._generatePipeName();
        const term = this._ptyNative.startProcess(file, this._cols, this._rows, false, pipeName, false, this._useConptyDll);
        this._pty = term.pty;
        this._fd = term.fd;
        // Create direct socket connections without worker threads
        this._setupDirectSockets(term);
        // Connect the process
        const connect = this._ptyNative.connect(this._pty, commandLine, cwd, parsedEnv, this._useConptyDll, (exitCode) => {
            this._exitCode = exitCode;
            this.emit('exit', exitCode);
            this._close();
        });
        this._innerPid = connect.pid;
        this._pid = connect.pid;
        this._file = file;
        this._name = opt.name || env.TERM || DEFAULT_NAME;
        this._readable = true;
        this._writable = true;
        this._forwardEvents();
    }
    _setupDirectSockets(term) {
        // Windows named pipes must be connected as clients, not opened as files
        // The conout/conin paths are like \\.\pipe\conpty-<timestamp>-<random>
        // Setup output socket - connect to conout named pipe
        this._outSocket = net.connect(term.conout);
        this._outSocket.setEncoding('utf8');
        this._socket = this._outSocket;
        // Setup input socket - connect to conin named pipe
        this._inSocket = net.connect(term.conin);
        this._inSocket.setEncoding('utf8');
        // Forward events directly
        this._outSocket.on('data', (data) => {
            if (!this._isReady) {
                this._isReady = true;
            }
            this.emit('data', data);
        });
        this._outSocket.on('error', (err) => {
            if (err.code && (err.code.includes('EPIPE') || err.code.includes('EIO'))) {
                // Expected errors when process exits
                return;
            }
            this.emit('error', err);
        });
        this._outSocket.on('close', () => {
            if (this._exitCode === undefined) {
                this.emit('exit', 0);
            }
            this._close();
        });
        this._inSocket.on('error', (err) => {
            if (err.code && (err.code.includes('EPIPE') || err.code.includes('EIO'))) {
                // Expected errors when process exits
                return;
            }
            // Don't emit errors for input socket - just log them
        });
    }
    _write(data) {
        if (this._inSocket && this._inSocket.writable) {
            this._inSocket.write(data);
        }
    }
    resize(cols, rows) {
        if (cols <= 0 || rows <= 0 || isNaN(cols) || isNaN(rows) || cols === Infinity || rows === Infinity) {
            throw new Error('resizing must be done using positive cols and rows');
        }
        if (this._exitCode !== undefined) {
            throw new Error('Cannot resize a pty that has already exited');
        }
        this._cols = cols;
        this._rows = rows;
        this._ptyNative.resize(this._pty, cols, rows, this._useConptyDll);
    }
    clear() {
        this._ptyNative.clear(this._pty, this._useConptyDll);
    }
    kill(signal) {
        // Only emit exit once
        const shouldEmitExit = this._exitCode === undefined;
        this._close();
        try {
            process.kill(this._pid);
        }
        catch (e) {
            // Ignore if process cannot be found
        }
        this._ptyNative.kill(this._pty, this._useConptyDll);
        // Emit exit event if the native callback hasn't fired yet
        // This ensures listeners are notified even on forceful termination
        if (shouldEmitExit) {
            this._exitCode = 0;
            this.emit('exit', 0);
        }
    }
    _close() {
        if (this._inSocket) {
            this._inSocket.destroy();
        }
        if (this._outSocket) {
            this._outSocket.destroy();
        }
    }
    _generatePipeName() {
        return `\\\\.\\pipe\\conpty-${Date.now()}-${Math.random()}`;
    }
    _argsToCommandLine(file, args) {
        if (typeof args === 'string') {
            return `${file} ${args}`;
        }
        const argv = [file];
        if (args) {
            argv.push(...args);
        }
        return argv.map(arg => {
            if (arg.includes(' ') || arg.includes('\t')) {
                return `"${arg.replace(/"/g, '\\"')}"`;
            }
            return arg;
        }).join(' ');
    }
    static open(options) {
        throw new Error('open() not supported on windows, use spawn() instead.');
    }
    get process() { return this._name; }
    get pid() { return this._pid; }
    destroy() {
        this.kill();
    }
}
exports.WindowsTerminal = WindowsTerminal;
