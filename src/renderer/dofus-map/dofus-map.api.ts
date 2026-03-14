export interface Recoltable {
    id: number;
    posX: number;
    posY: number;
    subAreaId: number;
    worldMap: number;
    resourceId: number;
    quantity: number;
}

import { trpcClient } from "../trpc";

export const getRecoltables = (resources: string[]): Promise<Recoltable[]> =>
    Promise.all(resources.map((id) => trpcClient.app.getRecoltables.query({ resourceId: id }))).then((results) =>
        (results as Recoltable[][]).flat(),
    );
