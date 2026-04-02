import { computeStats, type Stats } from "./stats.js";
import {
  setupE2b,
  teardownE2b,
  e2bNativeExec,
  getE2bContext,
  e2bColdstart,
} from "./sandboxes/e2b.js";
import {
  setupDaytona,
  teardownDaytona,
  daytonaNativeExec,
  getDaytonaContext,
  daytonaColdstart,
} from "./sandboxes/daytona.js";
import { agentExec, agentHealth } from "./sandboxes/shared.js";
import {
  anthropicHaikuInference,
  anthropicOpusInference,
} from "./llm/anthropic.js";
import { openaiMiniInference, openaiInference } from "./llm/openai.js";
import {
  openrouterHaikuInference,
  openrouterOpusInference,
} from "./llm/openrouter.js";
import {
  openrouterOpenaiMiniInference,
  openrouterOpenaiInference,
} from "./llm/openrouter-openai.js";

export const ALL_TESTS = [
  "e2b:coldstart",
  "e2b:native-exec",
  "e2b:agent-exec",
  "e2b:agent-health",
  "daytona:coldstart",
  "daytona:native-exec",
  "daytona:agent-exec",
  "daytona:agent-health",
  "llm:anthropic-haiku",
  "llm:anthropic-opus",
  "llm:openai-mini",
  "llm:openai",
  "llm:openrouter-haiku",
  "llm:openrouter-opus",
  "llm:openrouter-openai-mini",
  "llm:openrouter-openai",
] as const;

export type TestId = (typeof ALL_TESTS)[number];

export interface TestResult {
  stats: Stats;
  error?: string;
}

export interface RunResult {
  region: string;
  timestamp: string;
  sandboxIds: { e2b?: string; daytona?: string };
  results: Record<string, TestResult>;
}

function resolveTests(input: string): TestId[] {
  if (input === "*") return [...ALL_TESTS];

  const ids: TestId[] = [];
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (trimmed.endsWith(":*")) {
      const prefix = trimmed.slice(0, -1);
      ids.push(...ALL_TESTS.filter((t) => t.startsWith(prefix)));
    } else if (ALL_TESTS.includes(trimmed as TestId)) {
      ids.push(trimmed as TestId);
    }
  }
  return ids;
}

function getTestFn(testId: TestId): () => Promise<void> {
  switch (testId) {
    case "e2b:coldstart":
      return e2bColdstart;
    case "e2b:native-exec":
      return e2bNativeExec;
    case "e2b:agent-exec":
      return () => agentExec(getE2bContext()!.agentSdk);
    case "e2b:agent-health":
      return () => agentHealth(getE2bContext()!.agentSdk);
    case "daytona:coldstart":
      return daytonaColdstart;
    case "daytona:native-exec":
      return daytonaNativeExec;
    case "daytona:agent-exec":
      return () => agentExec(getDaytonaContext()!.agentSdk);
    case "daytona:agent-health":
      return () => agentHealth(getDaytonaContext()!.agentSdk);
    case "llm:anthropic-haiku":
      return anthropicHaikuInference;
    case "llm:anthropic-opus":
      return anthropicOpusInference;
    case "llm:openai-mini":
      return openaiMiniInference;
    case "llm:openai":
      return openaiInference;
    case "llm:openrouter-haiku":
      return openrouterHaikuInference;
    case "llm:openrouter-opus":
      return openrouterOpusInference;
    case "llm:openrouter-openai-mini":
      return openrouterOpenaiMiniInference;
    case "llm:openrouter-openai":
      return openrouterOpenaiInference;
  }
}

export async function runTests(
  testsInput: string,
  samples: number,
  opts?: { e2bSandboxId?: string; daytonaSandboxId?: string }
): Promise<RunResult> {
  const testIds = resolveTests(testsInput);

  // Coldstart tests don't need pre-setup, but exec/health tests do
  const needE2bSetup = testIds.some(
    (t) => t.startsWith("e2b:") && t !== "e2b:coldstart"
  );
  const needDaytonaSetup = testIds.some(
    (t) => t.startsWith("daytona:") && t !== "daytona:coldstart"
  );

  const setupPromises: Promise<void>[] = [];
  if (needE2bSetup)
    setupPromises.push(setupE2b(opts?.e2bSandboxId).then(() => {}));
  if (needDaytonaSetup)
    setupPromises.push(setupDaytona(opts?.daytonaSandboxId).then(() => {}));
  await Promise.all(setupPromises);

  const results: Record<string, TestResult> = {};

  for (const testId of testIds) {
    const fn = getTestFn(testId);
    const timings: number[] = [];
    let error: string | undefined;

    for (let i = 0; i < samples; i++) {
      try {
        const start = performance.now();
        await fn();
        timings.push(performance.now() - start);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    results[testId] = {
      stats: timings.length > 0 ? computeStats(timings) : computeStats([0]),
      ...(error ? { error } : {}),
    };
  }

  return {
    region: process.env.AWS_REGION ?? "local",
    timestamp: new Date().toISOString(),
    sandboxIds: {
      e2b: getE2bContext()?.sandboxId,
      daytona: getDaytonaContext()?.sandboxId,
    },
    results,
  };
}

export function toCSV(result: RunResult): string {
  const testIds = Object.keys(result.results);
  // Find max sample count
  const maxSamples = Math.max(
    ...testIds.map((t) => result.results[t].stats.samples.length)
  );

  // Header row
  const lines = ["sample," + testIds.join(",")];

  // Data rows — one per sample
  for (let i = 0; i < maxSamples; i++) {
    const row = [String(i + 1)];
    for (const testId of testIds) {
      const s = result.results[testId].stats.samples[i];
      row.push(s !== undefined ? String(s) : "");
    }
    lines.push(row.join(","));
  }

  return lines.join("\n") + "\n";
}

export async function teardownAll(): Promise<void> {
  await Promise.all([teardownE2b(), teardownDaytona()]);
}
