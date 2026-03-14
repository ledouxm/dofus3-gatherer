declare global {
    interface Window {
        __IS_ELECTRON__: boolean;
    }
}
