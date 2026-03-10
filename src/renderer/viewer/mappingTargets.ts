export type FieldDef = {
    /** Config key suffix, e.g. "mapId" → written as "MapCurrentEvent.mapId" */
    configKey: string;
    /** Proto field name for reference */
    protoField: string;
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
    /** Expected fields, in proto field-number order (used for positional auto-mapping) */
    fields: FieldDef[];
};

export const MAPPING_TARGETS: MappingTarget[] = [
    {
        id: "MapCurrentEvent",
        label: "Map Current Event",
        action: "Move to a different map in game",
        fields: [{ configKey: "mapId", protoField: "map_id", type: "number" }],
    },
    {
        id: "QuestValidatedEvent",
        label: "Quest Validated Event",
        action: "Complete a quest in game",
        fields: [{ configKey: "questId", protoField: "quest_id", type: "number" }],
    },
    {
        id: "InteractiveUsedEvent",
        label: "Interactive Used Event",
        action: "Start harvesting a resource on the map",
        fields: [
            { configKey: "resourceId", protoField: "resource_id", type: "number" },
            { configKey: "skillId", protoField: "skill_id", type: "number" },
            { configKey: "elementId", protoField: "element_id", type: "number" },
        ],
    },
    {
        id: "InteractiveUseEndedEvent",
        label: "Interactive Use Ended Event",
        action: "Wait for a harvest to finish (the resource disappears)",
        fields: [
            { configKey: "elementId", protoField: "element_id", type: "number" },
            { configKey: "skillId", protoField: "skill_id", type: "number" },
        ],
    },
];
