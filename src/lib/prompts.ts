/** Fill in `{name}` where we have one, or drop the "{name}, " lead-in
 * gracefully (capitalizing what follows) where we don't. */
export function personalize(text: string, name: string) {
  if (!text.includes("{name}")) return text
  if (name) return text.replace("{name}", name)
  return text.replace(/\{name\}, /, "").replace(/^./, (c) => c.toUpperCase())
}
