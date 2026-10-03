/**
 * Perf Step 2: the home page's first API requests (sections + banners)
 * start from a small inline script in the HTML (layout.tsx), while the
 * JavaScript is still downloading. The app then takes each answer once -
 * only if it was asked for the same path with the same login - and
 * otherwise fetches as before. A failed preload (error, 401, not ok) gives
 * null and the normal request runs, refresh-on-401 included.
 */

/** `v`: the answer once it has arrived (null = failed), so a component can
 * use it in its very first render (no layout shift). */
type Entry = { at: number; auth: string; p: Promise<unknown>; used?: boolean; v?: unknown }

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

/** Like takePreloaded, but synchronous: the answer only if it has already
 * arrived (else undefined, and the entry stays for takePreloaded). */
export function peekPreloaded<T>(path: string, token: string | null): T | undefined {
  if (typeof window === "undefined") return undefined
  const entry = window.__pyPre?.[path]
  if (!entry || entry.used || entry.auth !== (token || "") || Date.now() - entry.at > MAX_AGE_MS) return undefined
  if (entry.v === undefined || entry.v === null) return undefined
  entry.used = true
  return entry.v as T
}

/** The inline script (plain ES5, no imports). Mirrors getHomeSections()
 * and getBanners() (home/category, an opened book, the dashboard): same
 * paths, same token lookup as getToken(), same
 * visitor id as lib/visitor.ts. An expired login is left to the app (it
 * refreshes the token first); banners then load as for a guest. */
export function preloadScript(api: string): string {
  return `(function(){try{var l=location;var home=l.pathname==="/"||l.pathname==="/index.html",dash=l.pathname==="/dashboard/"||l.pathname==="/dashboard";if(!home&&!dash)return;var s=new URLSearchParams(l.search);if(home&&(s.get("q")||"").trim())return;var c=(s.get("category")||"").trim(),q=c?"?category="+encodeURIComponent(c):"",t="";try{t=localStorage.getItem("access_token")||localStorage.getItem("access")||localStorage.getItem("token")||""}catch(e){}var x=0;if(t){try{x=JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).exp*1000}catch(e){}}var ok=t&&x>Date.now()+5000,v="";try{v=localStorage.getItem("plugyard_vid");if(!v){v=window.crypto&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now();localStorage.setItem("plugyard_vid",v)}}catch(e){}var P=window.__pyPre={};function go(p,k,vid){var h={};if(k)h.Authorization="Bearer "+k;if(vid)h["X-Visitor-Id"]=vid;var e=P[p]={at:Date.now(),auth:k};e.p=fetch(${JSON.stringify(api)}+p,{headers:h,cache:"no-store"}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(d){e.v=d;return d})}function bn(pl,cat){var b={placement:pl};if(cat)b.category=cat;go("/banners/?"+new URLSearchParams(b).toString(),ok?t:"",v)}if(dash){bn("dashboard","");return}if(!t||ok)go("/home/sections/"+q,t,v);bn(c?"category":"home",c);if(s.get("book"))bn("book","")}catch(e){}})();`
}
