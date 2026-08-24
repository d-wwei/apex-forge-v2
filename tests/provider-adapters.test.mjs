import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOpenAICompatibleProvider
} from "../src/providers/openai-compatible.mjs";
import { createDeepSeekProvider } from "../src/providers/deepseek.mjs";
import {
  createGenericAgentRunner
} from "../src/executors/generic-agent-runner.mjs";

test("OpenAI-compatible provider keeps DeepSeek behind a ModelProvider boundary", () => {
  const requests = [];
  const provider = createOpenAICompatibleProvider({
    id: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "fixture-key",
    model: "deepseek-chat",
    transport: (request) => {
      requests.push(request);
      return {
        choices: [{
          message: {
            content: JSON.stringify({
              verdict: "pass",
              summary: "provider result",
              tests: [],
              risks: [],
              evidence_refs: []
            })
          }
        }]
      };
    }
  });

  const result = provider.complete({
    messages: [{ role: "user", content: "return JSON" }],
    responseFormat: { type: "json_object" }
  });

  assert.equal(provider.inspect().available, true);
  assert.equal(requests[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(requests[0].body.model, "deepseek-chat");
  assert.match(result.choices[0].message.content, /provider result/);
});

test("OpenAI-compatible provider accepts a per-call model override", () => {
  const requests = [];
  const provider = createOpenAICompatibleProvider({
    id: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "fixture-key",
    model: "deepseek-chat",
    transport: (request) => {
      requests.push(request);
      return {
        model: request.body.model,
        choices: [{ message: { content: "{}" } }]
      };
    }
  });

  provider.complete({
    model: "deepseek-reasoner",
    messages: [{ role: "user", content: "return JSON" }]
  });

  assert.equal(requests[0].body.model, "deepseek-reasoner");
  assert.equal(provider.inspect().model, "deepseek-chat");
});

test("DeepSeek provider defaults stay outside Kernel contracts", () => {
  const provider = createDeepSeekProvider({
    apiKey: "fixture",
    transport: () => ({ choices: [] })
  });
  const inspection = provider.inspect();
  assert.equal(inspection.provider_id, "deepseek");
  assert.equal(inspection.model, "deepseek-chat");
  assert.equal(inspection.base_url, "https://api.deepseek.com");
});

test("generic Agent runner turns a ModelProvider response into executor output", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-generic-runner-"));
  const outputPath = join(project, "agent-result.json");
  const provider = createOpenAICompatibleProvider({
    id: "deepseek",
    baseUrl: "https://api.deepseek.com",
    apiKey: "fixture",
    model: "deepseek-chat",
    transport: () => ({
      usage: {
        prompt_tokens: 12,
        completion_tokens: 7
      },
      choices: [{
        message: {
          content: JSON.stringify({
            verdict: "pass",
            summary: "deepseek cognitive result",
            tests: [],
            risks: [],
            evidence_refs: []
          })
        }
      }]
    })
  });
  const executor = createGenericAgentRunner({
    id: "deepseek-runner",
    provider
  });

  const execution = executor.execute({
    prompt: "analyze risk",
    outputPath,
    timeoutMs: 10000
  });

  assert.equal(execution.exit_code, 0);
  assert.equal(execution.executable_name, "deepseek-runner");
  assert.deepEqual(execution.usage, {
    input_tokens: 12,
    output_tokens: 7,
    tool_calls: null
  });
  assert.equal(JSON.parse(readFileSync(outputPath, "utf8")).verdict, "pass");
  assert.deepEqual(
    executor.inspect().capabilities,
    ["structured_output", "process_tree_cancel", "usage_reporting"]
  );
});

test("generic Agent runner forwards and reports the selected model", () => {
  const project = mkdtempSync(join(tmpdir(), "apex-generic-model-"));
  const outputPath = join(project, "agent-result.json");
  const calls = [];
  const executor = createGenericAgentRunner({
    id: "deepseek-runner",
    provider: {
      inspect: () => ({
        available: true,
        provider_id: "deepseek",
        model: "deepseek-chat"
      }),
      complete: (input) => {
        calls.push(input);
        return {
          model: input.model,
          choices: [{
            message: {
              content: JSON.stringify({
                verdict: "pass",
                summary: "override",
                tests: [],
                risks: [],
                evidence_refs: []
              })
            }
          }],
          usage: {}
        };
      }
    }
  });

  const execution = executor.execute({
    prompt: "analyze risk",
    outputPath,
    model: "deepseek-reasoner",
    timeoutMs: 10000
  });

  assert.equal(calls[0].model, "deepseek-reasoner");
  assert.equal(execution.reported_model, "deepseek-reasoner");
});
