const TAVILY_URL = "https://api.tavily.com/search";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

export function isTavilyConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function search(query: string, maxResults = 4): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  const response = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Tavily API error ${response.status}: ${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map((r: { title?: string; url?: string; content?: string }) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: r.content ?? "",
  }));
}
