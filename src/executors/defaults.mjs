export const BUILTIN_EXECUTOR_IDS = [
  "codex",
  "claude",
  "gemini",
  "deepseek-runner"
];

export const DEFAULT_EXECUTOR_FALLBACK_ORDER = [
  "codex",
  "claude",
  "gemini"
];

export const DEFAULT_SMOKE_EXECUTOR_IDS = [
  "codex",
  "claude",
  "gemini"
];

export function defaultAllowedExecutionAdapters() {
  return ["host", "shell", "human", ...BUILTIN_EXECUTOR_IDS];
}

export function defaultRetryAttempts() {
  return {
    host: 1,
    shell: 2,
    human: 1,
    ...Object.fromEntries(BUILTIN_EXECUTOR_IDS.map((id) => [id, 3]))
  };
}
