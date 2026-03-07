import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "./providers/ConfigProvider";
import { TranslationsProvider } from "./providers/TranslationsProvider";
import { InitProvider } from "./providers/InitProvider";
import { Provider } from "./ui/provider";
import App from "./App";
import type { AppApi } from "../preload/index";
import { ElectronAPI } from "@electron-toolkit/preload";

const queryClient = new QueryClient({});

const Root = () => (
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <Provider>
                <InitProvider>
                    <ConfigProvider>
                        <TranslationsProvider>
                            <App />
                        </TranslationsProvider>
                    </ConfigProvider>
                </InitProvider>
            </Provider>
        </QueryClientProvider>
    </StrictMode>
);

createRoot(document.getElementById("root")!).render(<Root />);

declare global {
    interface Window {
        electronAPI: ElectronAPI;
        api: AppApi;
    }
}
