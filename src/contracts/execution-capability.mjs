const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function normalizeExecutionCapabilities(values = []) {
  const normalized = Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean))).sort();
  for (const capability of normalized) {
    if (!CAPABILITY_PATTERN.test(capability)) {
      throw new Error(`无效 execution capability：${capability}`);
    }
  }
  return normalized;
}

export function hasExecutionCapabilities(actual = [], required = []) {
  const available = new Set(normalizeExecutionCapabilities(actual));
  return normalizeExecutionCapabilities(required).every((capability) => available.has(capability));
}
