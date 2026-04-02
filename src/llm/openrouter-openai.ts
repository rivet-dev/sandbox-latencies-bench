import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function openrouterOpenaiMiniInference(): Promise<void> {
  await client.chat.completions.create({
    model: "openai/gpt-5-mini",
    max_completion_tokens: 16,
    messages: [{ role: "user", content: "Hi" }],
  });
}

export async function openrouterOpenaiInference(): Promise<void> {
  await client.chat.completions.create({
    model: "openai/gpt-5",
    max_completion_tokens: 16,
    messages: [{ role: "user", content: "Hi" }],
  });
}
