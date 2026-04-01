import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function anthropicHaikuInference(): Promise<void> {
  await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1,
    messages: [{ role: "user", content: "Hi" }],
  });
}

export async function anthropicOpusInference(): Promise<void> {
  await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1,
    messages: [{ role: "user", content: "Hi" }],
  });
}
