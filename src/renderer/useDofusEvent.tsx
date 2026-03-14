import { useRef } from "react";
import { trpc } from "./trpc";

export const useDofusEvent = (eventName: string | null, callback: (data: any) => void) => {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    trpc.packets.onPacket.useSubscription(
        { typeName: eventName ?? "" },
        {
            enabled: !!eventName,
            onData: (payload) => callbackRef.current(payload.data),
        },
    );
};
