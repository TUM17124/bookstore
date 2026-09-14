import { getToken } from "@/lib/api"

const API = process.env.NEXT_PUBLIC_API_URL!
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i)
  }
  return out
}

export async function savePushSubscription(subscription: PushSubscription) {
  const raw = subscription.toJSON()
  if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
    throw new Error("Browser returned an invalid push subscription")
  }

  const token = getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${API}/push/subscribe/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      endpoint: raw.endpoint,
      keys: raw.keys,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error || "Could not save notification subscription",
    )
  }
  return raw.endpoint
}

export async function getPushSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null
  try {
    const registration = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Re-bind an existing granted subscription to the signed-in account. */
export async function bindPushToAccount() {
  if (typeof window === "undefined") return
  if (!("Notification" in window) || Notification.permission !== "granted") return
  const subscription = await getPushSubscription()
  if (subscription) {
    try {
      await savePushSubscription(subscription)
    } catch {
      // Binding must never block login or signup.
    }
  }
}

export async function enablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("This browser cannot receive push notifications")
  }
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications")
  }
  if (!VAPID) {
    throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("Notifications were blocked")
  }

  const registration = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID),
    })
  }

  await savePushSubscription(subscription)
}
