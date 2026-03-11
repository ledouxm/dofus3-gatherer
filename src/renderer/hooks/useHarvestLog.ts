import { useMappings } from "../providers/ConfigProvider";
import { useDofusEvent } from "../useDofusEvent";
import { gameStore } from "../game/game-store";

function getFieldValue(data: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((obj, key) => (obj as Record<string, unknown>)?.[key], data as unknown);
}

export const useHarvestLog = () => {
    const mappings = useMappings();

    useDofusEvent(mappings.ObjetHarvestedEvent, async (packet) => {
        const resourceIdPath = mappings["ObjetHarvestedEvent.resourceId"];
        if (!resourceIdPath) return;

        const resourceId = Number(getFieldValue(packet.data, resourceIdPath));
        if (!resourceId) return;

        const quantityPath = mappings["ObjetHarvestedEvent.quantity"];
        const quantity = quantityPath ? Number(getFieldValue(packet.data, quantityPath)) || 1 : 1;

        await window.api.appendHarvestEntry({
            resourceId,
            quantity,
            mapId: gameStore.get().character?.mapId ?? null,
            timestamp: new Date().toISOString(),
        });
    });

    useDofusEvent(mappings.ObjectHarvestedWithBonusEvent, async (packet) => {
        const resourceIdPath = mappings["ObjectHarvestedWithBonusEvent.resourceId"];
        if (!resourceIdPath) return;

        const resourceId = Number(getFieldValue(packet.data, resourceIdPath));
        if (!resourceId) return;

        const quantityPath = mappings["ObjectHarvestedWithBonusEvent.quantity"];
        const quantity = quantityPath ? Number(getFieldValue(packet.data, quantityPath)) || 0 : 0;

        const bonusPath = mappings["ObjectHarvestedWithBonusEvent.bonusQuantity"];
        const bonus = bonusPath ? Number(getFieldValue(packet.data, bonusPath)) || 0 : 0;

        await window.api.appendHarvestEntry({
            resourceId,
            quantity: quantity + bonus,
            mapId: gameStore.get().character?.mapId ?? null,
            timestamp: new Date().toISOString(),
        });
    });
};
