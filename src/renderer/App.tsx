import { useEffect, useState } from "react";
import { DofusLeafletMap } from "./dofus-map/DofusLeafletMap";
import { RecoltablesLayer } from "./dofus-map/RecoltablesLayer";
import "./index.css";

import { Box, CloseButton, Dialog, Flex, Text } from "@chakra-ui/react";
import { LuSettings } from "react-icons/lu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    useBaseUrl,
    useConfig,
    useUpdateConfigMutation,
    getBaseUrl,
} from "./providers/ConfigProvider";
import { configStore } from "./providers/store";
import { CenterOnCharacterButton, CharacterPosition } from "./game/character-position";
import { HintFilterButton } from "./ui/HintCategoryButtons";
import { ResourcePickerButton } from "./ui/ResourcePickerButton";
import { type AppTab, TitleBar } from "./ui/TitleBar";
import { WorldMapPickerButton } from "./ui/WorldMapPickerButton";
import { HintsLayer } from "./dofus-map/HintsLayer";
import { GuidesPanel } from "./ui/GuidesPanel";
import { ExplorerPanel } from "./ui/ExplorerPanel";
import { SettingsPanel } from "./ui/SettingsPanel";
import { ViewerApp } from "./viewer/ViewerApp";
import { Toaster, toaster } from "./ui/toaster";
import { useUpdateCheck } from "./useUpdateCheck";
import { useMappingsSync } from "./useMappingsSync";
import { AdminPanel } from "./ui/AdminPanel";
import { useInteractiveEvents } from "./game/useInteractiveEvents";
import { useHarvestLog } from "./hooks/useHarvestLog";
import { HarvestPanel } from "./ui/HarvestPanel";

export function App() {
    const baseUrl = useBaseUrl();
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const validTabs: AppTab[] = ["map", "viewer", "guides", "explorer", "harvests", "admin"];
    const [activeTab, setActiveTab] = useState<AppTab>(() => {
        const saved = configStore.get().activeTab;
        if (saved && (validTabs as string[]).includes(saved)) return saved as AppTab;
        return "map";
    });
    const [configOpen, setConfigOpen] = useState(false);
    const updateInfo = useUpdateCheck();
    const mappingsSynced = useMappingsSync();
    useInteractiveEvents();
    const queryClient = useQueryClient();
    const harvestAutoUpdate = config?.harvests?.autoUpdate ?? true;
    useHarvestLog(harvestAutoUpdate ? () => queryClient.invalidateQueries({ queryKey: ["harvest-log"] }) : undefined);

    const { data: adminToken = null } = useQuery({
        queryKey: ["admin-token"],
        queryFn: async () => {
            const token = await window.api.getAdminToken();
            if (!token) return null;
            const cdnBaseUrl = getBaseUrl();
            if (!cdnBaseUrl) return null;
            try {
                const res = await fetch(`${cdnBaseUrl}/verify-token`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                });
                return res.ok ? token : null;
            } catch {
                return null;
            }
        },
    });

    const handleTabChange = (tab: AppTab) => {
        setActiveTab(tab);
        updateConfig.mutate({ activeTab: tab });
    };

    useEffect(() => {
        if (!mappingsSynced) return;
        toaster.create({
            id: "mappings-updated",
            title: "Mappings updated",
            description: "Packet mappings have been updated from the server.",
            type: "success",
            duration: 5000,
            closable: true,
        });
    }, [mappingsSynced]);

    useEffect(() => {
        if (updateInfo.status !== "ready") return;
        toaster.create({
            id: "update-ready",
            title: "Update ready to install",
            description: `Version ${updateInfo.version} has been downloaded.`,
            type: "success",
            action: {
                label: "Restart & Install",
                onClick: () => window.api.quitAndInstall(),
            },
            duration: undefined,
            closable: true,
        });
    }, [updateInfo.status]);

    return (
        <div className="app">
            <Toaster />
            <TitleBar
                activeTab={activeTab}
                onTabChange={handleTabChange}
                showAdminTab={!!adminToken}
                onOpenConfig={() => setConfigOpen(true)}
                onOpenTravelWindow={() => window.api.openTravelWindow()}
            />

            {/* Config modal */}
            <Dialog.Root open={configOpen} onOpenChange={(d) => setConfigOpen(d.open)} size="lg">
                <Dialog.Backdrop />
                <Dialog.Positioner>
                    <Dialog.Content
                        bg="gray.900"
                        border="1px solid"
                        borderColor="whiteAlpha.200"
                        maxW="640px"
                        maxH="80vh"
                        display="flex"
                        flexDirection="column"
                    >
                        <Dialog.Header pb={2} flexShrink={0}>
                            <Dialog.Title>
                                <Flex align="center" gap={2}>
                                    <LuSettings />
                                    <Text>CONFIG</Text>
                                </Flex>
                            </Dialog.Title>
                            <Dialog.CloseTrigger asChild>
                                <CloseButton size="sm" position="absolute" top={3} right={3} />
                            </Dialog.CloseTrigger>
                        </Dialog.Header>
                        <Box flex={1} overflowY="auto">
                            <SettingsPanel />
                        </Box>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Dialog.Root>

            {/* Map tab */}
            <div className="app-map" style={{ display: activeTab === "map" ? undefined : "none" }}>
                <DofusLeafletMap baseUrl={baseUrl}>
                    {({ meta }) => (
                        <>
                            <CharacterPosition meta={meta} />
                            <RecoltablesLayer meta={meta} />
                            <HintsLayer meta={meta} />
                        </>
                    )}
                </DofusLeafletMap>
                <div
                    style={{
                        position: "absolute",
                        bottom: "8px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        display: "flex",
                        gap: "4px",
                        zIndex: 1000,
                    }}
                >
                    <ResourcePickerButton />
                    <WorldMapPickerButton />
                    <HintFilterButton />
                    <CenterOnCharacterButton />
                </div>
            </div>

            {/* Viewer tab */}
            <div
                style={{
                    display: activeTab === "viewer" ? "flex" : "none",
                    flex: 1,
                    overflow: "hidden",
                }}
            >
                <ViewerApp />
            </div>

            {/* Guides tab */}
            <div
                style={{
                    display: activeTab === "guides" ? "flex" : "none",
                    flex: 1,
                    overflow: "hidden",
                    flexDirection: "column",
                }}
            >
                <GuidesPanel />
            </div>

            {/* Explorer tab */}
            <div
                style={{
                    display: activeTab === "explorer" ? "flex" : "none",
                    flex: 1,
                    overflow: "hidden",
                    flexDirection: "column",
                }}
            >
                <ExplorerPanel />
            </div>

            {/* Harvests tab */}
            <div
                style={{
                    display: activeTab === "harvests" ? "flex" : "none",
                    flex: 1,
                    overflow: "hidden",
                    flexDirection: "column",
                }}
            >
                <HarvestPanel />
            </div>

            {/* Admin tab */}
            {adminToken && (
                <div
                    style={{
                        display: activeTab === "admin" ? "flex" : "none",
                        flex: 1,
                        overflow: "hidden",
                    }}
                >
                    <AdminPanel token={adminToken} />
                </div>
            )}
        </div>
    );
}

export default App;
