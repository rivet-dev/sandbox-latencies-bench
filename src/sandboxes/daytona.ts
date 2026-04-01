import { Daytona } from "@daytonaio/sdk";
import { SandboxAgent } from "sandbox-agent";
import { connectAgent } from "./shared.js";

const AGENT_PORT = 8080; // Daytona preview URLs require ports 3000-9999

export interface DaytonaContext {
  daytona: Daytona;
  sandbox: Awaited<ReturnType<Daytona["create"]>>;
  sandboxId: string;
  agentSdk: SandboxAgent;
  agentBaseUrl: string;
}

let cached: DaytonaContext | null = null;

export function getDaytonaContext(): DaytonaContext | null {
  return cached;
}

export async function setupDaytona(
  existingSandboxId?: string
): Promise<DaytonaContext> {
  if (cached) return cached;

  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    target: process.env.DAYTONA_TARGET ?? "us",
  });
  let sandbox: Awaited<ReturnType<Daytona["create"]>>;
  let sandboxId: string;

  if (existingSandboxId) {
    sandbox = await daytona.get(existingSandboxId);
    sandboxId = existingSandboxId;
  } else {
    sandbox = await daytona.create({
      image: "ubuntu:22.04",
      resources: { cpu: 1, memory: 2, disk: 5 },
      envVars: {},
    });
    sandboxId = sandbox.id;

    // Install curl + sandbox-agent
    await sandbox.process.executeCommand(
      "apt-get update -qq && apt-get install -y -qq curl ca-certificates > /dev/null 2>&1",
      undefined,
      undefined,
      60
    );
    await sandbox.process.executeCommand(
      "curl -fsSL https://releases.rivet.dev/sandbox-agent/0.4.x/install.sh | sh",
      undefined,
      undefined,
      120
    );

    // Start sandbox-agent in background
    await sandbox.process.executeCommand(
      `bash -c 'sandbox-agent server --no-token --host 0.0.0.0 --port ${AGENT_PORT} </dev/null >/tmp/sa.log 2>&1 &'`,
      undefined,
      undefined,
      5
    );
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Get preview URL for the agent port
  const signed = await sandbox.getSignedPreviewUrl(AGENT_PORT, 7200);
  const agentBaseUrl = signed.url;

  const agentSdk = await connectAgent(agentBaseUrl);

  cached = { daytona, sandbox, sandboxId, agentSdk, agentBaseUrl };
  return cached;
}

export async function teardownDaytona(): Promise<void> {
  if (!cached) return;
  await cached.agentSdk.dispose();
  await cached.sandbox.delete();
  cached = null;
}

export async function daytonaNativeExec(): Promise<void> {
  if (!cached) throw new Error("Daytona not set up");
  await cached.sandbox.process.executeCommand("echo ok");
}
