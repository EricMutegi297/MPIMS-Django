import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["VITE_", "REACT_APP_"]);
  const apiUrl = env.VITE_API_URL ?? env.REACT_APP_API_URL ?? "";
  const websocketUrl =
    env.VITE_WS_URL ?? env.REACT_APP_WS_URL ?? "http://localhost:4000";

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl),
      "import.meta.env.VITE_WS_URL": JSON.stringify(websocketUrl),
      "import.meta.env.VITE_DASHBOARD_IDLE_TIMEOUT_MINUTES": JSON.stringify(
        env.VITE_DASHBOARD_IDLE_TIMEOUT_MINUTES
          ?? env.REACT_APP_DASHBOARD_IDLE_TIMEOUT_MINUTES
          ?? "",
      ),
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api": {
          target: apiUrl || "http://localhost:8000",
          changeOrigin: true,
        },
        "/media": {
          target: apiUrl || "http://localhost:8000",
          changeOrigin: true,
        },
        "/socket.io": {
          target: websocketUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  };
});
