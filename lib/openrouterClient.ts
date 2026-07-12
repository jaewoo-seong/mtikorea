const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string | null;
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { maxTokens?: number; temperature?: number; model?: string },
): Promise<ChatCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const model = opts?.model || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "MTI AI Platform",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts?.maxTokens ?? 1000,
      temperature: opts?.temperature ?? 0.4,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter API error ${response.status}: ${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error(`OpenRouter returned no content: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return {
    content: choice.message.content,
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: data.usage?.total_tokens ?? 0,
    finishReason: choice.finish_reason ?? null,
  };
}
