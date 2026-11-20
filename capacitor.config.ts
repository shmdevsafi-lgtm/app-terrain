import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Application mobile (Android) — même SPA que le site terrain.
 * Le build Vite est copié dans `android/app/src/main/assets/public` par
 * `npm run build:mobile` (vite build + cap sync).
 */
const config: CapacitorConfig = {
  appId: "com.hsely.douches",
  appName: "Douches de sécurité",
  webDir: "dist",
  backgroundColor: "#ffffff",
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
