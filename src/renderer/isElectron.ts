export const isElectron = (): boolean =>
    typeof window !== "undefined" && !!(window as any).__IS_ELECTRON__;
