import { spawnSync } from "node:child_process";

export function runProjectAuditTests(projectDir, options = {}) {
  if (options.skip) {
    return {
      status: "SKIPPED",
      command: options.command || "npm test",
      exit_code: null,
      duration_ms: 0,
      tests: 0,
      pass: 0,
      fail: 0,
      test_names: [],
      stdout_tail: "",
      stderr_tail: "test execution explicitly skipped"
    };
  }

  const command = options.command || "npm test";
  const startedAt = Date.now();
  const execution = spawnSync(command, {
    cwd: projectDir,
    encoding: "utf8",
    shell: true,
    timeout: options.timeoutMs || 15 * 60 * 1000,
    env: process.env
  });
  const stdout = String(execution.stdout || "");
  const stderr = String(execution.stderr || execution.error?.message || "");
  const summary = parseNodeTestSummary(stdout);
  return {
    status: execution.status === 0 && summary.fail === 0 && summary.tests > 0 ? "PASS" : "FAIL",
    command,
    exit_code: execution.status ?? 1,
    duration_ms: Date.now() - startedAt,
    tests: summary.tests,
    pass: summary.pass,
    fail: summary.fail,
    test_names: summary.test_names,
    stdout_tail: tail(stdout),
    stderr_tail: tail(stderr)
  };
}

export function hasExecutedTest(testExecution, pattern) {
  if (testExecution?.status !== "PASS") return false;
  return testExecution.test_names.some((name) =>
    typeof pattern === "string" ? name.includes(pattern) : pattern.test(name)
  );
}

export function parseNodeTestSummary(output) {
  const text = String(output || "");
  const readCount = (label) => {
    const patterns = [
      new RegExp(`(?:ℹ|#)\\s*${label}\\s+(\\d+)`, "i"),
      new RegExp(`^${label}\\s*[:=]\\s*(\\d+)`, "im")
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
    return 0;
  };
  const testNames = text.split("\n")
    .map((line) => line.match(/^\s*[✔✓]\s+(.+?)(?:\s+\(\d+(?:\.\d+)?ms\))?\s*$/)?.[1])
    .filter(Boolean);
  return {
    tests: readCount("tests") || testNames.length,
    pass: readCount("pass") || testNames.length,
    fail: readCount("fail"),
    test_names: testNames
  };
}

function tail(value, max = 8000) {
  return value.length > max ? value.slice(-max) : value;
}
