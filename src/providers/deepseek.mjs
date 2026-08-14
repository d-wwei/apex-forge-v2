import { createOpenAICompatibleProvider } from "./openai-compatible.mjs";

export function createDeepSeekProvider(options = {}) {
  return createOpenAICompatibleProvider({
    id: "deepseek",
    baseUrl: options.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY || "",
    model: options.model || process.env.DEEPSEEK_MODEL || "deepseek-chat",
    transport: options.transport
  });
}
