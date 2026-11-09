import { defineConfig } from "vitest/config";
import path from "node:path";

// No @vitejs/plugin-react: it pins Babel 8 while shadcn pins Babel 7. Vite's built-in
// transform handles TSX with the automatic runtime (tsconfig "jsx": "react-jsx").
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
