import { useStoreValue } from "@simplestack/store/react";
import { updateStore } from "./providers/store";

export function useUpdateCheck() {
    return useStoreValue(updateStore);
}
