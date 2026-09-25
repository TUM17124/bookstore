// Drop-in replacement for next-intl's `useTranslations`, scoped to the
// editor's own English message bundle (messages-en.json, extracted from
// GigaPDF's real strings). The editor is single-locale here, so this reads
// the bundle directly instead of pulling in the next-intl package/provider.
import messages from "./messages-en.json"

type MessageTree = { [key: string]: string | MessageTree }

function resolve(tree: MessageTree | string | undefined, path: string): MessageTree | string | undefined {
  return path.split(".").reduce<MessageTree | string | undefined>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as MessageTree)[key]
    return undefined
  }, tree)
}

export type TFunction = (key: string, params?: Record<string, string | number>) => string

/** Index of the `}` matching the `{` at `openIndex`, or -1 if unbalanced. */
function findMatchingBrace(str: string, openIndex: number): number {
  let depth = 1
  for (let i = openIndex + 1; i < str.length; i++) {
    if (str[i] === "{") depth++
    else if (str[i] === "}") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Parse `=0 {No collaborators} one {1 collaborator} other {{count} collaborators}` into a selector -> body map, respecting nested braces inside each body. */
function parsePluralClauses(str: string): Record<string, string> {
  const clauses: Record<string, string> = {}
  let i = 0
  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++
    if (i >= str.length) break
    const selectorStart = i
    while (i < str.length && str[i] !== "{" && !/\s/.test(str[i])) i++
    const selector = str.slice(selectorStart, i)
    while (i < str.length && /\s/.test(str[i])) i++
    if (str[i] !== "{") break
    const openIdx = i
    const closeIdx = findMatchingBrace(str, openIdx)
    if (closeIdx === -1) break
    clauses[selector] = str.slice(openIdx + 1, closeIdx)
    i = closeIdx + 1
  }
  return clauses
}

/**
 * Resolves ICU-style `{var, plural, =0 {...} one {...} other {...}}`
 * constructs against `params`, picking the `=N` exact match when present,
 * else `one` for a count of 1, else `other`. A `#` inside the chosen branch
 * is replaced with the count. Leaves the string untouched when it contains
 * no plural construct.
 */
function resolvePlurals(str: string, params: Record<string, string | number>): string {
  let result = str
  let searchFrom = 0
  for (;;) {
    const pluralIdx = result.indexOf(", plural,", searchFrom)
    if (pluralIdx === -1) break
    const openBraceIdx = result.lastIndexOf("{", pluralIdx)
    if (openBraceIdx === -1) {
      searchFrom = pluralIdx + 1
      continue
    }
    const varName = result.slice(openBraceIdx + 1, pluralIdx).trim()
    const closeBraceIdx = findMatchingBrace(result, openBraceIdx)
    if (closeBraceIdx === -1) {
      searchFrom = pluralIdx + 1
      continue
    }
    const clausesStr = result.slice(pluralIdx + ", plural,".length, closeBraceIdx)
    const clauses = parsePluralClauses(clausesStr)
    const rawValue = params[varName]
    const numValue = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0)
    const branch =
      clauses[`=${numValue}`] ?? (numValue === 1 ? clauses.one : undefined) ?? clauses.other ?? ""
    const resolved = branch.replace(/#/g, String(numValue))
    result = result.slice(0, openBraceIdx) + resolved + result.slice(closeBraceIdx + 1)
    searchFrom = openBraceIdx + resolved.length
  }
  return result
}

export function useTranslations(namespace: string): TFunction {
  const scope = resolve(messages as MessageTree, namespace)
  return (key: string, params?: Record<string, string | number>) => {
    const raw = resolve(scope, key)
    let str = typeof raw === "string" ? raw : key
    if (params) {
      str = resolvePlurals(str, params)
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
      }
    }
    return str
  }
}

// This editor build is English-only (see file header) - no locale switcher.
export function useLocale(): string {
  return "en"
}
