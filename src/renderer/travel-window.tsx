import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "./providers/ConfigProvider";
import { Provider } from "./ui/provider";
import { TravelWindowApp } from "./ui/TravelWindowApp";
import { trpc, trpcClient } from "./trpc";

const queryClient = new QueryClient({});

const Root = () => (
    <StrictMode>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <Provider>
                    <ConfigProvider>
                        <TravelWindowApp />
                    </ConfigProvider>
                </Provider>
            </QueryClientProvider>
        </trpc.Provider>
    </StrictMode>
);

createRoot(document.getElementById("root")!).render(<Root />);
