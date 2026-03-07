import L from "leaflet";
import { useEffect, useRef } from "react";

export function useLeafletEventBlock<T extends HTMLElement = HTMLDivElement>() {
    const ref = useRef<T>(null);
    useEffect(() => {
        if (!ref.current) return;
        L.DomEvent.disableClickPropagation(ref.current);
        L.DomEvent.disableScrollPropagation(ref.current);
    }, []);
    return ref;
}
