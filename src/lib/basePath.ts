/**
 * Runtime base path for asset URLs.
 *
 * Next.js inlines `process.env.__NEXT_ROUTER_BASEPATH` at build time,
 * but that is only available on the main thread (not in Web Workers).
 * We also expose NEXT_PUBLIC_BASE_PATH so Workers can import it.
 */
const basePath: string =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  process.env.__NEXT_ROUTER_BASEPATH ??
  "";

export default basePath;
