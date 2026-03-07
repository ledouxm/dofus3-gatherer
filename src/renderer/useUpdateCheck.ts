import { useEffect, useState } from "react";

interface UpdateInfo {
    latestVersion: string;
    releaseUrl: string;
    updateAvailable: boolean;
}

const GITHUB_REPO = "ledouxm/dofus3-gatherer";

export function useUpdateCheck(): UpdateInfo | null {
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

    useEffect(() => {
        async function check() {
            try {
                const currentVersion = await window.api.getAppVersion();
                const release = await fetch(
                    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
                    { headers: { Accept: "application/vnd.github+json" } },
                ).then((r) => r.json());

                const latestVersion: string = release.tag_name?.replace(/^v/, "") ?? "";
                if (!latestVersion) return;

                if (latestVersion !== currentVersion) {
                    setUpdateInfo({
                        latestVersion,
                        releaseUrl: release.html_url,
                        updateAvailable: true,
                    });
                }
            } catch {
                // silently ignore network errors
            }
        }

        check();
    }, []);

    return updateInfo;
}
