import { useStoreValue } from "@simplestack/store/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { configStore, mapStore, type ConfigStore } from "./store";
import { gameStore } from "../game/game-store";

export const useBaseUrl = () => useConfig().cdnBaseUrl;
export const getBaseUrl = () => configStore.get().cdnBaseUrl;

/** Migrate legacy mapping keys to current names, preserving values. */
function migrateMappings(raw: Record<string, unknown>): Record<string, unknown> {
    const migrations: Array<[string, string]> = [
        ["CurrentMapMessage", "MapCurrentEvent"],
        ["CurrentMapMessage.mapId", "MapCurrentEvent.mapId"],
        ["QuestFinishedMessage", "QuestValidatedEvent"],
        ["QuestFinishedMessage.questId", "QuestValidatedEvent.questId"],
    ];
    const result = { ...raw };
    for (const [oldKey, newKey] of migrations) {
        if (result[oldKey] != null && result[newKey] == null) {
            result[newKey] = result[oldKey];
        }
        delete result[oldKey];
    }
    return result;
}

export const ConfigProvider = ({ children }: PropsWithChildren) => {
    const configQuery = useQuery({
        queryKey: ["config"],
        queryFn: async () => {
            const response = (await window.api.getConfig()) as Partial<ConfigStore>;

            const migratedMappings = migrateMappings(
                (response.mappings ?? {}) as Record<string, unknown>,
            );

            configStore.set({
                ...configStore.get(),
                ...response,
                cdnBaseUrl: response.cdnBaseUrl || import.meta.env.VITE_CDN_BASE_URL,
                mappings: { ...configStore.get().mappings, ...migratedMappings },
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
            if (response.harvestMapper?.showHarvested !== undefined) {
                mapStore.set((v) => ({ ...v, showHarvestedResources: response.harvestMapper!.showHarvested }));
            }
            const harvestData = await window.api.getConfig({ filename: "element-resource-mappings.json" });
            if (harvestData && typeof harvestData === "object") {
                const ids = [...new Set(Object.values(harvestData as Record<string, number>).map(Number))];
                mapStore.set((v) => ({ ...v, harvestedResourceIds: ids }));
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
