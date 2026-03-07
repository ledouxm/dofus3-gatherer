import { store } from "@simplestack/store";

export const gameStore = store<GameStore>({});

export type GameStore = {
    character?: {
        position: [number, number];
        mapId: number;
        worldMapId: number;
        subAreaId: number;
    };
};
