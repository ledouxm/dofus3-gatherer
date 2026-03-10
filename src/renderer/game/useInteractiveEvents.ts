import { useMappings } from "../providers/ConfigProvider";
import { useDofusEvent } from "../useDofusEvent";

/**
 * Resolve a dot-separated path inside a packet data object.
 * e.g. getFieldValue({ fexe: { fnjq: 276 } }, "fexe.fnjq") === 276
 * Also handles flat keys: getFieldValue({ a: 123 }, "a") === 123
 */
function getFieldValue(data: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((obj, key) => (obj as Record<string, unknown>)?.[key], data as unknown);
}

export const useInteractiveEvents = () => {
    const mappings = useMappings();

    useDofusEvent(mappings.InteractiveUsedEvent, async (packet) => {
        const resourceIdPath = mappings["InteractiveUsedEvent.resourceId"];
        const elementIdPath = mappings["InteractiveUsedEvent.elementId"];
        const skillIdPath = mappings["InteractiveUsedEvent.skillId"];

        if (!resourceIdPath) return;

        const resourceId = Number(getFieldValue(packet.data, resourceIdPath));
        const elementId = elementIdPath ? Number(getFieldValue(packet.data, elementIdPath)) : null;
        const skillId = skillIdPath ? Number(getFieldValue(packet.data, skillIdPath)) : null;

        if (!resourceId) return;

        const recoltables = await window.api.getRecoltables(resourceId);
        console.log(
            `[InteractiveUsedEvent] resourceId=${resourceId} elementId=${elementId} skillId=${skillId}`,
            recoltables,
        );
    });
};
