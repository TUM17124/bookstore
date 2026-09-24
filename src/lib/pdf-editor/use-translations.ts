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

export function useTranslations(namespace: string): TFunction {
  const scope = resolve(messages as MessageTree, namespace)
  return (key: string, params?: Record<string, string | number>) => {
    const raw = resolve(scope, key)
    let str = typeof raw === "string" ? raw : key
    if (params) {
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
