import type { ConfigStore } from "../../providers/store";
import type { GuideProgress } from "./types";

export function getGuideProgress(config: ConfigStore, guideId: number): GuideProgress {
    return (
        config.guides?.progress?.[String(guideId)] ?? {
            id: guideId,
            currentStep: 0,
            steps: {},
            updatedAt: new Date().toISOString(),
        }
    );
}

export function buildProgressPatch(
    config: ConfigStore,
    guideId: number,
    patch: Partial<GuideProgress>,
): Partial<ConfigStore> {
    const existing = getGuideProgress(config, guideId);
    return {
        guides: {
            ...(config.guides ?? { progress: {} }),
            progress: {
                ...(config.guides?.progress ?? {}),
                [String(guideId)]: {
                    ...existing,
                    ...patch,
                    updatedAt: new Date().toISOString(),
                },
            },
        },
    };
}
