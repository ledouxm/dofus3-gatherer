import { useStoreValue } from "@simplestack/store/react";
import { translationStore } from "./store";

export const TranslationsProvider = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
};

export const useTranslations = (ids: string[]) => {
    const translations = useStoreValue(translationStore.select("translations"));
    if (!translations) {
        return null;
    }

    const result: Record<string, string> = {};
    const uniqueIds = Array.from(new Set(ids));
    uniqueIds.forEach((id) => {
        result[id] = translations[id] || id;
    });
    return result;
};

export const useTranslate = (id: string) => {
    const translations = useStoreValue(translationStore.select("translations"));
    if (!translations) {
        return id;
    }
    return translations[id] || id;
};

export const getTranslation = (id: string | number) => {
    const translations = translationStore.get().translations;
    if (!translations) {
        return String(id);
    }

    return translations[id] || String(id);
};
