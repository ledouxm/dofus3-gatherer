import { useEffect, useState } from "react";
import { configStore } from "./providers/store";

export function useMappingsSync(): boolean {
    const [updated, setUpdated] = useState(false);

    useEffect(() => {
        window.api.getMappingsSyncResult().then((result) => {
            if (!result?.updated || !result.mappings) return;
            configStore.set({
                ...configStore.get(),
                mappings: {
                    ...configStore.get().mappings,
                    ...result.mappings,
                },
                ...(result.timestamp ? { mappingsTimestamp: result.timestamp } : {}),
            });
            setUpdated(true);
        }).catch(() => {});
    }, []);

    return updated;
}
