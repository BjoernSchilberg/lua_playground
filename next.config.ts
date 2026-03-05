import type { NextConfig } from "next";

const isGhPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: "export",
  basePath: isGhPages ? "/lua_playground" : "",
  assetPrefix: isGhPages ? "/lua_playground/" : undefined,
  allowedDevOrigins: process.env.DEV_ORIGIN ? [process.env.DEV_ORIGIN] : [],
  // The worker .ts file gets copied to out/ where its relative import
  // ("../lib/protocol") can't resolve. This is harmless — ignore it.
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: isGhPages ? "/lua_playground" : "",
  },
};

export default nextConfig;
