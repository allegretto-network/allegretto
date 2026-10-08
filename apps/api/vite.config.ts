import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

// The Cloudflare plugin rejects vitest's worker-environment options, so tests
// run without it: the handler and lib code under test is plain TypeScript.
export default defineConfig(({ mode }) => ({
  plugins: mode === "test" ? [] : [cloudflare()],
}));
