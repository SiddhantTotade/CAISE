import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The dev server proxies /api to the backend so the session cookie stays same-origin.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_BACKEND_URL;
  if (!backend) throw new Error("VITE_BACKEND_URL is not set (see .env.example)");
  const proxy = { "/api": { target: backend, changeOrigin: false } };
  return {
    plugins: [react(), tailwindcss()],
    server: { port: Number(env.VITE_DEV_PORT), strictPort: true, proxy },
    preview: { port: Number(env.VITE_DEV_PORT), proxy },
  };
});
