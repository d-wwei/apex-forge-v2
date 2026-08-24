import { spawnSync } from "node:child_process";

export function createOpenAICompatibleProvider(options) {
  const {
    id,
    baseUrl,
    apiKey,
    model,
    transport = defaultTransport
  } = options;
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");

  return {
    id,
    inspect() {
      return {
        provider_id: id,
        available: Boolean(apiKey && normalizedBaseUrl && model),
        base_url: normalizedBaseUrl,
        model,
        protocol: "openai-compatible"
      };
    },
    complete(input) {
      if (!apiKey) throw new Error(`ModelProvider ${id} 缺少 API key`);
      return transport({
        url: `${normalizedBaseUrl}/chat/completions`,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: {
          model: input.model || model,
          messages: input.messages,
          ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
          ...(input.tools ? { tools: input.tools } : {}),
          ...(input.toolChoice ? { tool_choice: input.toolChoice } : {})
        },
        timeoutMs: input.timeoutMs || 120000
      });
    }
  };
}

function defaultTransport(request) {
  const source = `
    import { readFileSync } from "node:fs";
    const request = JSON.parse(readFileSync(0, "utf8"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        console.error(JSON.stringify({ status: response.status, body }));
        process.exit(2);
      }
      process.stdout.write(body);
    } finally {
      clearTimeout(timer);
    }
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: request.timeoutMs + 5000
  });
  if (result.status !== 0) {
    throw new Error(`OpenAI-compatible request failed: ${result.stderr || result.error?.message || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}
