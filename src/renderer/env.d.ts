/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_CDN_BASE_URL?: string;
    readonly VITE_TRPC_PORT?: string;
    readonly DEV: boolean;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
