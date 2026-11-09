import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dashboard data is dynamic (SQLite reads on every request), so we stay on the
  // classic dynamic-by-default model instead of Cache Components for now.
  cacheComponents: false,
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
