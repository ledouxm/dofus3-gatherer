import { EventEmitter } from "node:events";

export type InitStepStatus = "pending" | "running" | "done" | "error";
export type InitStep = { id: string; label: string; status: InitStepStatus; progress?: number };

export const steps: InitStep[] = [
    { id: "sqlite", label: "Downloading database", status: "running" },
    { id: "proto", label: "Downloading proto definitions", status: "running" },
];

export const initEmitter = new EventEmitter();

export function updateStep(id: string, update: Partial<InitStep>) {
    const step = steps.find((s) => s.id === id)!;
    Object.assign(step, update);
    initEmitter.emit("init-status", [...steps]);
}
