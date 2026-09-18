const API = process.env.NEXT_PUBLIC_API_URL!

export type PromptCopy = {
  slug: string
  title: string
  body: string
  updated_at?: string
}

export async function getPromptContent(slug: string): Promise<PromptCopy | null> {
  const r = await fetch(`${API}/prompts/?slug=${encodeURIComponent(slug)}`, {
    cache: "no-store",
  })
  const data = await r.json().catch(() => ({}))
  return data?.items?.[0] || null
}

/** Fill in `{name}` where we have one, or drop the "{name}, " lead-in
 * gracefully (capitalizing what follows) where we don't. */
export function personalize(text: string, name: string) {
  if (!text.includes("{name}")) return text
  if (name) return text.replace("{name}", name)
  return text.replace(/\{name\}, /, "").replace(/^./, (c) => c.toUpperCase())
}
