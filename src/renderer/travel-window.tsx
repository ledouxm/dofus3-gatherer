import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "./providers/ConfigProvider";
import { Provider } from "./ui/provider";
import { TravelWindowApp } from "./ui/TravelWindowApp";
import type { AppApi } from "../preload/index";
import { ElectronAPI } from "@electron-toolkit/preload";

const queryClient = new QueryClient({});

const Root = () => (
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <Provider>
                <ConfigProvider>
                    <TravelWindowApp />
                </ConfigProvider>
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
