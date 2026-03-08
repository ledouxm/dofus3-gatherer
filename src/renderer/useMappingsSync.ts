import { useEffect, useState } from "react";
import { getBaseUrl } from "./providers/ConfigProvider";
import { configStore } from "./providers/store";

interface LatestMappings {
    timestamp: string;
    mappings: {
        CurrentMapMessage: string;
        "CurrentMapMessage.mapId": string;
    };
}

export function useMappingsSync(): boolean {
    const [updated, setUpdated] = useState(false);

    useEffect(() => {
        async function sync() {
            const cdnBaseUrl = getBaseUrl();
            if (!cdnBaseUrl) return;

            try {
                const remote: LatestMappings = await fetch(`${cdnBaseUrl}/latest-mappings.json`).then(
                    (r) => r.json(),
                );
                if (!remote?.timestamp || !remote?.mappings) return;

                const localTimestamp = configStore.get().mappingsTimestamp;
                if (localTimestamp && localTimestamp >= remote.timestamp) return;

                const updatedConfig = {
                    ...configStore.get(),
                    mappings: remote.mappings,
                    mappingsTimestamp: remote.timestamp,
                };

                await window.api.saveConfig(updatedConfig, { filename: "config.json" });
                configStore.set(updatedConfig);
                setUpdated(true);
            } catch {
                // silently ignore network errors
            }
        }

        sync();
    }, []);

    return updated;
}
