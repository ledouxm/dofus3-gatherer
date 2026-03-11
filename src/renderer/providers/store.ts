import { store } from "@simplestack/store";
import type { WorldmapMeta } from "../dofus-map/dofus-map.utils";
import type { GuideProgress } from "../ui/guides/types";

export const appStore = store<AppStore>({
    config: {
        mappings: {
            MapCurrentEvent: null,
            "MapCurrentEvent.mapId": null,
            ObjetHarvestedEvent: null,
            "ObjetHarvestedEvent.resourceId": null,
            "ObjetHarvestedEvent.quantity": null,
            ObjectHarvestedWithBonusEvent: null,
            "ObjectHarvestedWithBonusEvent.resourceId": null,
            "ObjectHarvestedWithBonusEvent.quantity": null,
            "ObjectHarvestedWithBonusEvent.bonusQuantity": null,
        },
        cdnBaseUrl: undefined,
    },
    i18n: {
        translations: null,
        locale: "fr",
    },
    map: {
        selectedResourceIds: [],
        selectedWorldmapId: null,
        worldmapIds: [],
        worldmapMetadata: null,
        centerOnCharacter: true,
        selectedHintCategoryIds: [] as number[],
        travelHandle: null,
        highlightedResourceIds: [] as number[],
        hoveredHintName: null,
    },
});

export const configStore = appStore.select("config");
export const translationStore = appStore.select("i18n");
export const mapStore = appStore.select("map");

export type ConfigStore = {
    mappings: {
        MapCurrentEvent: string | null;
        "MapCurrentEvent.mapId": string | null;
        ObjetHarvestedEvent: string | null;
        "ObjetHarvestedEvent.resourceId": string | null;
        "ObjetHarvestedEvent.quantity": string | null;
        ObjectHarvestedWithBonusEvent: string | null;
        "ObjectHarvestedWithBonusEvent.resourceId": string | null;
        "ObjectHarvestedWithBonusEvent.quantity": string | null;
        "ObjectHarvestedWithBonusEvent.bonusQuantity": string | null;
    };
    cdnBaseUrl?: string;
    selectedResourceIds?: number[];
    centerOnCharacter?: boolean;
    copyCoordinatesOnClick?: boolean;
    characterPosition?: {
        position: [number, number];
        mapId: number;
        worldMapId: number;
        subAreaId: number;
    };
    quests?: {
        history: Array<{ id: number; name: string; level: number; entranceMapId: number }>;
    };
    mappingsTimestamp?: string;
    travel?: {
        sendToProcess?: boolean;
        selectedWindowTitle?: string;
    };
    guides?: {
        ganymedePath?: string;
        progress: { [guideId: string]: GuideProgress };
        openedTabIds?: number[];
        activeTabId?: number | null;
    };
    resourcePresets?: Array<{
        id: string;
        name: string;
        iconItemId: number;
        resourceIds: number[];
    }>;
    highlightedResourceIds?: number[];
    activeTab?: string;
    harvests?: {
        autoUpdate?: boolean;
    };
    explorer?: {
        section?: string;
        questsHistory?: unknown[];
        itemsHistory?: unknown[];
        zonesHistory?: unknown[];
    };
};

export type TranslationStore = {
    translations: Record<string, string> | null;
    locale: "fr" | "en" | "es" | "de" | "it";
};

export type AppStore = {
    config: ConfigStore;
    i18n: TranslationStore;
    map: {
        selectedResourceIds: number[];
        selectedWorldmapId: string | null;
        worldmapIds: string[];
        worldmapMetadata: Record<string, WorldmapMeta> | null;
        centerOnCharacter: boolean;
        selectedHintCategoryIds: number[];
        travelHandle: number | null;
        highlightedResourceIds: number[];
        hoveredHintName: string | null;
    };
};
