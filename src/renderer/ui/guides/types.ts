export interface GuideStep {
    name: string | null;
    map?: string | null;
    pos_x?: number;
    pos_y?: number;
    web_text: string;
}

export interface GuideFile {
    id: number;
    name: string;
    description?: string | null;
    node_image?: string | null;
    steps: GuideStep[];
    status?: string;
    lang?: string;
}

export interface GuideEntry {
    filePath: string;
    id: number;
    name: string;
    description?: string | null;
    node_image?: string | null;
    stepCount: number;
    lang?: string;
}

export interface QuestDbStep {
    stepId: number;
    stepName: string | null;
    stepDescription: string | null;
}

export interface QuestDbData {
    questId: number;
    questName: string | null;
    steps: QuestDbStep[];
}

export type QuestDbMap = Record<number, QuestDbData>;

export interface GuideStepProgress {
    checkboxes: number[];
}

export interface GuideProgress {
    id: number;
    currentStep: number;
    steps: { [stepIndex: string]: GuideStepProgress };
    updatedAt: string;
}
