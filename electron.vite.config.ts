import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    main: {
        // vite config options
    },
    preload: {
        // vite config options
    },
    renderer: {
        plugins: [react()],
    },
});
