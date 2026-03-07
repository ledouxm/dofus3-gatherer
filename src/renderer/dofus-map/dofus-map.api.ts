export interface Recoltable {
    _id: string;
    resources: number[];
    id: number;
    quantities: Quantity[];
    createdAt: string;
    updatedAt: string;
    __v: number;
    pos: Pos;
}

export interface Pos {
    _id: string;
    m_flags: number;
    id: number;
    posX: number;
    posY: number;
    subAreaId: number;
    worldMap: number;
    tacticalModeTemplateId: number;
    name: Name;
    capabilityAllowChallenge: boolean;
    capabilityAllowAggression: boolean;
    capabilityAllowTeleportTo: boolean;
    capabilityAllowTeleportFrom: boolean;
    capabilityAllowExchangesBetweenPlayers: boolean;
    capabilityAllowHumanVendor: boolean;
    capabilityAllowCollector: boolean;
    capabilityAllowSoulCapture: boolean;
    capabilityAllowSoulSummon: boolean;
    capabilityAllowTavernRegen: boolean;
    capabilityAllowTombMode: boolean;
    capabilityAllowTeleportEverywhere: boolean;
    capabilityAllowFightChallenges: boolean;
    capabilityAllowMonsterRespawn: boolean;
    capabilityAllowMonsterFight: boolean;
    capabilityAllowMount: boolean;
    capabilityAllowObjectDisposal: boolean;
    capabilityAllowUnderwater: boolean;
    capabilityAllowPvp1V1: boolean;
    capabilityAllowPvp3V3: boolean;
    capabilityAllowMonsterAggression: boolean;
    allCapabilitiesMask: boolean;
    outdoor: boolean;
    showNameOnFingerpost: boolean;
    hasPriorityOnWorldmap: boolean;
    allowPrism: boolean;
    isTransition: boolean;
    mapHasTemplate: boolean;
    hasPublicPaddock: boolean;
    className: string;
    m_id: number;
    createdAt: string;
    updatedAt: string;
    img: Img;
}

export interface Img {
    "1": string;
    "0.25": string;
    "0.5": string;
    "0.75": string;
}

export interface Name {
    id: string;
}

export interface Quantity {
    _id: string;
    item: number;
    quantity: number;
}
export const getRecoltables = (resources: string[]): Promise<Recoltable[]> =>
    Promise.all(resources.map((id) => window.api.getRecoltables(id))).then((results) =>
        results.flat(),
    );
