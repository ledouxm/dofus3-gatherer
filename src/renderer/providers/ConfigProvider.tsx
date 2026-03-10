import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { configStore, mapStore, type ConfigStore } from "./store";
import { gameStore } from "../game/game-store";

export const useBaseUrl = () => useConfig().cdnBaseUrl;
export const getBaseUrl = () => configStore.get().cdnBaseUrl;

export const ConfigProvider = ({ children }: PropsWithChildren) => {
    const configQuery = useQuery({
        queryKey: ["config"],
        queryFn: async () => {
            const response = (await window.api.getConfig()) as Partial<ConfigStore>;

            configStore.set({
                ...configStore.get(),
                ...response,
                cdnBaseUrl: response.cdnBaseUrl || import.meta.env.VITE_CDN_BASE_URL,
                mappings: { ...configStore.get().mappings, ...response.mappings },
            });

            if (response.selectedResourceIds?.length) {
                mapStore.set((v) => ({ ...v, selectedResourceIds: response.selectedResourceIds! }));
            }
            if (response.centerOnCharacter !== undefined) {
                mapStore.set((v) => ({ ...v, centerOnCharacter: response.centerOnCharacter! }));
            }
            if (response.highlightedResourceIds) {
                mapStore.set((v) => ({ ...v, highlightedResourceIds: response.highlightedResourceIds! }));
            }
            if (response.characterPosition) {
                gameStore.set((state) => ({ ...state, character: response.characterPosition }));
            }

            return response;
        },
        gcTime: 1000 * 60 * 60,
    });
    const appConfig = useConfig();

    if (configQuery.isLoading || !appConfig) {
        return <div>Loading config...</div>;
    }

    if (!configQuery.data) {
        return <div>Failed to load config</div>;
    }

    return <>{children}</>;
};

export const useConfig = () => {
    return useStoreValue(configStore);
};
export const useMappings = () => {
    return useStoreValue(configStore.select("mappings"));
};

export const useUpdateConfigMutation = () => {
    return useMutation({
        mutationFn: async (newConfig: Partial<ConfigStore>) => {
            const updatedConfig = {
                ...configStore.get(),
                ...newConfig,
            };

            await window.api.saveConfig(updatedConfig, {
                filename: "config.json",
            });

            configStore.set(updatedConfig);

            return updatedConfig;
        },
    });
};
