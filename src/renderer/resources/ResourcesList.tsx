import { configStore } from "../providers/store";

export const getItemIconUrl = (iconId: number) => {
    const baseUrl = configStore.get().cdnBaseUrl;
    return `${baseUrl}/items/${iconId}.png`;
};

export const getHintIconUrl = (gfx: number) => {
    const baseUrl = configStore.get().cdnBaseUrl;
    return `${baseUrl}/uidarkstone_assets/${gfx}.png`;
};
