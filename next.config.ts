import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // The managed build runner denies Next's embedded TypeScript worker (EPERM).
  // `npm run build` runs the full standalone tsc check first; this skips only
  // Next's duplicate in-process build check, not TypeScript validation overall.
  typescript: { ignoreBuildErrors: true },
  experimental: { workerThreads: true, cpus: 1 },
}

export default nextConfig
