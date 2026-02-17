import type { NextConfig } from "next";

const isGhPages = process.env.GITHUB_ACTIONS === "true";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: "export",
  basePath: isGhPages ? "/lua_playground" : "",
  assetPrefix: isGhPages ? "/lua_playground/" : undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: isGhPages ? "/lua_playground" : "",
  },
};

export default nextConfig;
