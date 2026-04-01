import { computeStats, type Stats } from "./stats.js";
import {
  setupE2b,
  teardownE2b,
  e2bNativeExec,
  getE2bContext,
} from "./sandboxes/e2b.js";
import {
  setupDaytona,
  teardownDaytona,
  daytonaNativeExec,
  getDaytonaContext,
} from "./sandboxes/daytona.js";
import { agentExec, agentHealth } from "./sandboxes/shared.js";
import {
  setupAgentOs,
  teardownAgentOs,
  agentOsNativeExec,
} from "./sandboxes/agentos.js";
import { anthropicInference } from "./llm/anthropic.js";
import { openaiInference } from "./llm/openai.js";
import { openrouterInference } from "./llm/openrouter.js";

export const ALL_TESTS = [
  "e2b:native-exec",
  "e2b:agent-exec",
  "e2b:agent-health",
  "daytona:native-exec",
  "daytona:agent-exec",
  "daytona:agent-health",
  "agentos:native-exec",
  "llm:anthropic",
  "llm:openai",
  "llm:openrouter",
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
    case "e2b:native-exec":
      return e2bNativeExec;
    case "e2b:agent-exec":
      return () => agentExec(getE2bContext()!.agentSdk);
    case "e2b:agent-health":
      return () => agentHealth(getE2bContext()!.agentSdk);
    case "daytona:native-exec":
      return daytonaNativeExec;
    case "daytona:agent-exec":
      return () => agentExec(getDaytonaContext()!.agentSdk);
    case "daytona:agent-health":
      return () => agentHealth(getDaytonaContext()!.agentSdk);
    case "agentos:native-exec":
      return agentOsNativeExec;
    case "llm:anthropic":
      return anthropicInference;
    case "llm:openai":
      return openaiInference;
    case "llm:openrouter":
      return openrouterInference;
  }
}

export async function runTests(
  testsInput: string,
  samples: number,
  opts?: { e2bSandboxId?: string; daytonaSandboxId?: string }
): Promise<RunResult> {
  const testIds = resolveTests(testsInput);

  const needE2b = testIds.some((t) => t.startsWith("e2b:"));
  const needDaytona = testIds.some((t) => t.startsWith("daytona:"));
  const needAgentOs = testIds.some((t) => t.startsWith("agentos:"));

  // Setup sandboxes if needed (not timed)
  const setupPromises: Promise<void>[] = [];
  if (needE2b)
    setupPromises.push(setupE2b(opts?.e2bSandboxId).then(() => {}));
  if (needDaytona)
    setupPromises.push(setupDaytona(opts?.daytonaSandboxId).then(() => {}));
  if (needAgentOs) setupPromises.push(setupAgentOs().then(() => {}));
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

export async function teardownAll(): Promise<void> {
  await Promise.all([teardownE2b(), teardownDaytona(), teardownAgentOs()]);
}
