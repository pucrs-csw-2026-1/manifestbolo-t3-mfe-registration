import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

// The registration microservice (manifestbolo-t2-registration) has no CORS
// headers, so browser requests made directly to it are blocked. Routing them
// through this app's own dev/preview server (cors: true) makes the actual call
// happen server-to-server, which isn't subject to CORS — same pattern
// mfe-auth uses for ms-auth. Unused for now (the demo page calls no backend),
// wired up ahead of the T2 integration.
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const registrationApiProxy = {
  "/api": {
    target: env.REGISTRATION_SERVICE_URL || "http://localhost:8000",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "mfeRegistration",
      filename: "remoteEntry.js",
      exposes: {
        "./EventsListPage": "./src/pages/EventsListPage.tsx",
        "./EventActivitiesPage": "./src/pages/EventActivitiesPage.tsx",
      },
      shared: ["react", "react-dom", "react-router-dom", "@mui/material", "@emotion/react", "@emotion/styled"],
    }),
  ],
  build: {
    target: "esnext",
    modulePreload: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5177,
    strictPort: true,
    cors: true,
    proxy: registrationApiProxy,
  },
  preview: {
    port: 5176,
    strictPort: true,
    cors: true,
    proxy: registrationApiProxy,
  },
});
