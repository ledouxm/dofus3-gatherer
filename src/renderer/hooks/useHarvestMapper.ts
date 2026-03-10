import { useEffect, useRef, useState } from "react";
import { useMappings } from "../providers/ConfigProvider";
import { useDofusEvent } from "../useDofusEvent";

function getFieldValue(data: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((obj, key) => (obj as Record<string, unknown>)?.[key], data as unknown);
}

type Pending = { elementId: number; timerId: ReturnType<typeof setTimeout> };

export const useHarvestMapper = (enabled: boolean) => {
    const mappings = useMappings();
    const [sessionCount, setSessionCount] = useState(0);
    const pendingRef = useRef<Pending | null>(null);

    useDofusEvent(enabled ? mappings.InteractiveUsedEvent : null, (packet) => {
        const elementIdPath = mappings["InteractiveUsedEvent.elementId"];
        if (!elementIdPath) return;

        const elementId = Number(getFieldValue(packet.data, elementIdPath));
        if (!elementId) return;

        if (pendingRef.current) clearTimeout(pendingRef.current.timerId);
        const timerId = setTimeout(() => { pendingRef.current = null; }, 5000);
        pendingRef.current = { elementId, timerId };
    });

    useDofusEvent(enabled ? mappings.ObjetHarvestedEvent : null, async (packet) => {
        if (!pendingRef.current) return;

        const resourceIdPath = mappings["ObjetHarvestedEvent.resourceId"];
        if (!resourceIdPath) return;

        const resourceId = Number(getFieldValue(packet.data, resourceIdPath));
        if (!resourceId) return;

        const { elementId, timerId } = pendingRef.current;
        clearTimeout(timerId);
        pendingRef.current = null;

        await window.api.saveConfig(
            { [elementId]: resourceId },
            { filename: "element-resource-mappings.json" },
        );
        setSessionCount((c) => c + 1);
    });

    useEffect(() => () => { if (pendingRef.current) clearTimeout(pendingRef.current.timerId); }, []);

    return { sessionCount };
};
