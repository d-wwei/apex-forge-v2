import { writeFileSync } from "node:fs";

export function createGenericAgentRunner(options) {
  const { id, provider } = options;
  return {
    id,
    inspect() {
      const providerInfo = provider.inspect();
      return {
        adapter: id,
        executor_id: id,
        available: providerInfo.available,
        version: `${providerInfo.provider_id}:${providerInfo.model}`,
        capabilities: ["structured_output"],
        error: providerInfo.available ? "" : `${providerInfo.provider_id} provider unavailable`
      };
    },
    execute(input) {
      const startedAt = Date.now();
      try {
        const response = provider.complete({
          messages: [
            {
              role: "system",
              content: "Return only a JSON object satisfying the requested Apex Forge worker result contract."
            },
            { role: "user", content: input.prompt }
          ],
          responseFormat: { type: "json_object" },
          timeoutMs: input.timeoutMs
        });
        const content = response?.choices?.[0]?.message?.content;
        const structured = typeof content === "string" ? JSON.parse(content) : content;
        if (!structured || typeof structured !== "object") {
          throw new Error("ModelProvider returned no structured result");
        }
        writeFileSync(input.outputPath, `${JSON.stringify(structured)}\n`);
        return {
          executable: id,
          executable_name: id,
          args: [],
          command: `${id} <structured-prompt>`,
          exit_code: 0,
          signal: "",
          timed_out: false,
          duration_ms: Date.now() - startedAt,
          stdout_tail: "",
          stderr_tail: "",
          session_id: null,
          usage: {
            input_tokens: response.usage?.prompt_tokens ?? null,
            output_tokens: response.usage?.completion_tokens ?? null,
            tool_calls: null
          }
        };
      } catch (error) {
        return {
          executable: id,
          executable_name: id,
          args: [],
          command: `${id} <structured-prompt>`,
          exit_code: 1,
          signal: "",
          timed_out: error.name === "AbortError",
          duration_ms: Date.now() - startedAt,
          stdout_tail: "",
          stderr_tail: error.message,
          session_id: null,
          usage: {
            input_tokens: null,
            output_tokens: null,
            tool_calls: null
          }
        };
      }
    }
  };
}
