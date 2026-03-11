export interface Recoltable {
    id: number;
    posX: number;
    posY: number;
    subAreaId: number;
    worldMap: number;
    resourceId: number;
    quantity: number;
}

export const getRecoltables = (resources: string[]): Promise<Recoltable[]> =>
    Promise.all(resources.map((id) => window.api.getRecoltables(id))).then((results) =>
        results.flat(),
    );
