import { useQuery } from "@tanstack/react-query";
import { db } from "../db";
import { getTranslation } from "../providers/TranslationsProvider";

export type ResourceWithJob = {
    jobId: number;
    jobNameId: number;
    itemId: number;
    itemNameId: number;
    itemIconId: number;
    itemName: string;
    jobName: string;
};

const removeDuplicates = <T>(items: T[], getKey: (item: T) => string): T[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = getKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const useResourcesQuery = () => {
    return useQuery({
        queryKey: ["resources"],
        queryFn: async () => {
            const resources = await db
                .selectFrom("SkillData")
                .leftJoin("JobData", "JobData.id", "SkillData.parentJobId")
                .leftJoin("ItemData", "ItemData.id", "SkillData.gatheredRessourceItem")
                .where("SkillData.gatheredRessourceItem", "is not", -1)
                .where("SkillData.parentJobId", "is not", -1)
                .where("SkillData.parentJobId", "is not", 1)
                .orderBy("SkillData.levelMin", "asc")
                .select([
                    "JobData.id as jobId",
                    "JobData.nameId as jobNameId",
                    "SkillData.gatheredRessourceItem as itemId",
                    "ItemData.nameId as itemNameId",
                    "ItemData.iconId as itemIconId",
                ])
                .execute();

            return removeDuplicates(resources, (r) => `${r.jobId}-${r.itemId}`).map((r) => ({
                ...r,
                itemName: getTranslation(r.itemNameId!) ?? String(r.itemNameId),
                jobName: getTranslation(r.jobNameId!) ?? String(r.jobNameId),
            })) as ResourceWithJob[];
        },
    });
};

export const groupResourcesByJob = (
    resources: ResourceWithJob[],
): [string, ResourceWithJob[]][] => {
    const map = new Map<string, ResourceWithJob[]>();
    for (const r of resources) {
        const group = map.get(r.jobName) ?? [];
        group.push(r);
        map.set(r.jobName, group);
    }
    return Array.from(map.entries());
};
