/**
 * Perf Step 2: the home page's first API requests (sections + banners)
 * start from a small inline script in the HTML (layout.tsx), while the
 * JavaScript is still downloading. The app then takes each answer once -
 * only if it was asked for the same path with the same login - and
 * otherwise fetches as before. A failed preload (error, 401, not ok) gives
 * null and the normal request runs, refresh-on-401 included.
 */

type Entry = { at: number; auth: string; p: Promise<unknown>; used?: boolean }

declare global {
  interface Window {
    __pyPre?: Record<string, Entry>
  }
}

const MAX_AGE_MS = 60_000

/** The preloaded JSON for `path`, or null (none, other login, too old,
 * or already used). Callers that overlap share it; one cancelled meanwhile
 * (the page re-ran its request) gets null and leaves it for the other. */
export async function takePreloaded<T>(path: string, token: string | null, signal?: AbortSignal | null): Promise<T | null> {
  if (typeof window === "undefined") return null
  const entry = window.__pyPre?.[path]
  if (!entry || entry.used || entry.auth !== (token || "") || Date.now() - entry.at > MAX_AGE_MS) return null
  const data = ((await entry.p) as T | null) ?? null
  if (signal?.aborted || entry.used) return null
  entry.used = true
  return data
}

/** The inline script (plain ES5, no imports). Mirrors getHomeSections()
 * and getBanners(): same paths, same token lookup as getToken(). An
 * expired login is left to the app (it refreshes the token first). */
export function preloadScript(api: string): string {
  return `(function(){try{var l=location;if(l.pathname!=="/"&&l.pathname!=="/index.html")return;var s=new URLSearchParams(l.search);if((s.get("q")||"").trim())return;var c=(s.get("category")||"").trim(),q=c?"?category="+encodeURIComponent(c):"",t="";try{t=localStorage.getItem("access_token")||localStorage.getItem("access")||localStorage.getItem("token")||""}catch(e){}var x=0;if(t){try{x=JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).exp*1000}catch(e){}}var P=window.__pyPre={};function go(p,k){var h={};if(k)h.Authorization="Bearer "+k;P[p]={at:Date.now(),auth:k,p:fetch(${JSON.stringify(api)}+p,{headers:h,cache:"no-store"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}}if(!t||x>Date.now()+5000)go("/home/sections/"+q,t);go("/banners/"+q,"")}catch(e){}})();`
}
