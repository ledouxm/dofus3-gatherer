export type FieldDef = {
    /** Config key suffix, e.g. "mapId" → written as "MapCurrentEvent.mapId" */
    configKey: string;
    /** camelCase field name in the decoded clean proto (used for value-based matching) */
    cleanFieldName: string;
    /** Expected JS value type in decoded packet JSON */
    type: "number" | "string" | "boolean";
};

export type MappingTarget = {
    /** Key used in config.mappings, e.g. "MapCurrentEvent" */
    id: string;
    /** Human-readable label */
    label: string;
    /** Action the user should perform in game to trigger this packet */
    action: string;
    /** Fully qualified proto type name in the clean (unobfuscated) schema */
    protoFullName: string;
    /** Expected fields — cleanFieldName must match the camelCase key in decoded clean JSON */
    fields: FieldDef[];
};

export const MAPPING_TARGETS: MappingTarget[] = [
    {
        id: "MapCurrentEvent",
        label: "Map Current Event",
        action: "Move to a different map in game",
        protoFullName: "com.ankama.dofus.server.game.protocol.gamemap.MapCurrentEvent",
        fields: [{ configKey: "mapId", cleanFieldName: "mapId", type: "number" }],
    },
    {
        id: "QuestValidatedEvent",
        label: "Quest Validated Event",
        action: "Complete a quest in game",
        protoFullName: "com.ankama.dofus.server.game.protocol.quest.QuestValidatedEvent",
        fields: [{ configKey: "questId", cleanFieldName: "questId", type: "number" }],
    },
    {
        id: "InteractiveUsedEvent",
        label: "Interactive Used Event",
        action: "Start harvesting a resource on the map",
        protoFullName: "com.ankama.dofus.server.game.protocol.interactive.element.InteractiveUsedEvent",
        fields: [
            // Clean proto field 1 is entity_id (decoded as entityId); the user maps this as resourceId
            { configKey: "resourceId", cleanFieldName: "entityId", type: "number" },
            { configKey: "skillId", cleanFieldName: "skillId", type: "number" },
            { configKey: "elementId", cleanFieldName: "elementId", type: "number" },
        ],
    },
    {
        id: "InteractiveUseEndedEvent",
        label: "Interactive Use Ended Event",
        action: "Wait for a harvest to finish (the resource disappears)",
        protoFullName: "com.ankama.dofus.server.game.protocol.interactive.element.InteractiveUseEndedEvent",
        fields: [
            { configKey: "elementId", cleanFieldName: "elementId", type: "number" },
            { configKey: "skillId", cleanFieldName: "skillId", type: "number" },
        ],
    },
    {
        id: "ObjetHarvestedEvent",
        label: "Objet Harvested Event",
        action: "Harvest a resource completely (wait for the item to appear in your bag)",
        protoFullName: "",
        fields: [
            { configKey: "resourceId", cleanFieldName: "objectGid", type: "number" },
            { configKey: "elementId", cleanFieldName: "elementId", type: "number" },
        ],
    },
];
