/** Split a single "full name" input into (first, last) — first word is the
 * first name, everything after is the last name, so the UI only needs one
 * name field instead of separate First/Last boxes. */
export function splitName(full: string): [string, string] {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ["", ""]
  const [first, ...rest] = parts
  return [first, rest.join(" ")]
}
