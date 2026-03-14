import { useEffect, useState } from "react";
import { configStore } from "./providers/store";
import { trpcClient } from "./trpc";

export function useMappingsSync(): boolean {
    const [updated, setUpdated] = useState(false);

    useEffect(() => {
        trpcClient.app.getMappingsSyncResult.query().then((result) => {
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
