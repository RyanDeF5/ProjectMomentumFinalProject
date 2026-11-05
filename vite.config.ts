import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // During `npm run dev`, forward API calls to the Express server
    proxy: Object.fromEntries(
      ["/analyze", "/legend", "/news", "/favicon", "/watchlist", "/screener", "/health", "/market-news", "/schedule", "/music", "/soundtrack"].map((route) => [route, "http://localhost:3000"]),
    ),
  },
});
