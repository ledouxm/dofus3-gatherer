import { useEffect, useRef } from "react";

export const useDofusEvent = (eventName: string | null, callback: (data: any) => void) => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
        if (!eventName) return;
        const handler = (_event: Electron.IpcRendererEvent, data: any) => {
            callbackRef.current(data);
        };
        window.api.on("server-packet/" + eventName, handler);
        return () => {
            window.api.off("server-packet/" + eventName, handler);
        };
    }, [eventName]);
};
