import type { ReactNode } from "react";
import { useRef } from "react";
import { toaster } from "./toaster";

export function useClipboardToast() {
    const lastId = useRef<string | undefined>(undefined);
    return (text: string, label?: ReactNode) => {
        navigator.clipboard.writeText(text);
        // queueMicrotask escapes React's event-batching context, preventing
        // the "flushSync called inside a lifecycle" warning from Chakra's toaster.
        queueMicrotask(() => {
            if (lastId.current) toaster.dismiss(lastId.current);
            lastId.current = toaster.create({
                title: label ? <><b>{label}</b> copié</> : "Copié !",
                type: "success",
                duration: 2000,
            });
        });
    };
}
