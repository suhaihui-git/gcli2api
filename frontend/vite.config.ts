import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: "/front/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "../front",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("naive-ui")) {
            return "naive-ui";
          }
          if (id.includes("vue")) {
            return "vue-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://127.0.0.1:7861",
      "/config": "http://127.0.0.1:7861",
      "/creds": "http://127.0.0.1:7861",
      "/logs": {
        target: "http://127.0.0.1:7861",
        ws: true,
      },
      "/version": "http://127.0.0.1:7861",
    },
  },
});
