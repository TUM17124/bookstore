/**
 * Fire the push-prompt-trigger event after an action that warrants asking the
 * user for notification permission (bookmark, follow author, campaign join,
 * "notify me" for a price drop / release, Settings "Turn on").
 *
 * PushPrompt listens for this event and runs its own eligibility check before
 * deciding whether to show the panel — so calling this is always safe.
 */
export function triggerPushPrompt(action: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent("push-prompt-trigger", { detail: { action } }),
  )
}
