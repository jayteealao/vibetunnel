const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "vibetunnel-fwd",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    exe.linkLibC();

    // Windows-specific linking
    if (target.result.os.tag == .windows) {
        exe.linkSystemLibrary("kernel32");
        exe.linkSystemLibrary("user32");
        exe.linkSystemLibrary("shell32");
        exe.linkSystemLibrary("advapi32");
    }

    const options = b.addOptions();
    const version = b.option([]const u8, "version", "VibeTunnel version") orelse "unknown";
    options.addOption([]const u8, "version", version);
    exe.root_module.addOptions("build_options", options);

    b.installArtifact(exe);

    const test_module = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    test_module.addOptions("build_options", options);

    const tests = b.addTest(.{
        .root_module = test_module,
    });
    tests.linkLibC();

    // Windows-specific linking for tests
    if (target.result.os.tag == .windows) {
        tests.linkSystemLibrary("kernel32");
        tests.linkSystemLibrary("user32");
        tests.linkSystemLibrary("shell32");
        tests.linkSystemLibrary("advapi32");
    }

    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run vt-fwd tests");
    test_step.dependOn(&run_tests.step);
}
