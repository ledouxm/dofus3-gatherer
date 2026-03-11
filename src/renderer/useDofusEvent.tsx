import { useEffect, useRef } from "react";

export const useDofusEvent = (eventName: string | null, callback: (data: any) => void) => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!eventName) return;
        const id = window.api.addListener(
            "server-packet/" + eventName,
            (_event: Electron.IpcRendererEvent, data: any) => {
                callbackRef.current(data);
            },
        );
        return () => {
            window.api.removeListener(id);
        };
    }, [eventName]);
};
