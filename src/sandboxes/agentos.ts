import { createClient } from "rivetkit/client";

export interface AgentOsContext {
  agent: any;
}

let cached: AgentOsContext | null = null;

export function getAgentOsContext(): AgentOsContext | null {
  return cached;
}

export async function setupAgentOs(): Promise<AgentOsContext> {
  if (cached) return cached;

  const endpoint = process.env.AGENTOS_ENDPOINT;
  if (!endpoint) throw new Error("AGENTOS_ENDPOINT env var required");

  const client = createClient<any>(endpoint);
  const agent = client.vm.getOrCreate(["latency-test"]);

  // Warm up: first exec may involve VM creation (not measured)
  await agent.exec("echo warmup");

  cached = { agent };
  return cached;
}

export async function teardownAgentOs(): Promise<void> {
  cached = null;
}

export async function agentOsNativeExec(): Promise<void> {
  if (!cached) throw new Error("AgentOS not set up");
  await cached.agent.exec("echo ok");
}
