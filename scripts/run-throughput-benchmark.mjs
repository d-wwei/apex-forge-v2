#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  evaluateThroughputBenchmark
} from "../src/benchmark/throughput-evaluator.mjs";

try {
  const options = parseArgs(process.argv.slice(2));
  const input = JSON.parse(
    options.input === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(resolve(options.input), "utf8")
  );
  const evaluation = evaluateThroughputBenchmark(input);
  const output = `${JSON.stringify(evaluation, null, 2)}\n`;
  if (options.output) {
    const outputPath = resolve(options.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output);
  }
  process.stdout.write(output);
  if (evaluation.gates.status !== "PASS") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`throughput benchmark failed: ${error.message}\n`);
  process.exitCode = 2;
}

function parseArgs(args) {
  const options = {
    input: null,
    output: null
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--input") {
      options.input = args[index + 1];
      index += 1;
    } else if (argument === "--output") {
      options.output = args[index + 1];
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!options.input) {
    throw new Error(
      "usage: run-throughput-benchmark.mjs --input <path|-> [--output <path>]"
    );
  }
  return options;
}
