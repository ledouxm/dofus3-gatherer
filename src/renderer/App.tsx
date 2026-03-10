import { useEffect, useRef, useState } from "react";
import { DofusLeafletMap } from "./dofus-map/DofusLeafletMap";
import { RecoltablesLayer } from "./dofus-map/RecoltablesLayer";
import "./index.css";

import { Box, CloseButton, Dialog, Flex, Text } from "@chakra-ui/react";
import { LuSettings } from "react-icons/lu";
import {
    useBaseUrl,
    useConfig,
    useMappings,
    useUpdateConfigMutation,
} from "./providers/ConfigProvider";
import { CenterOnCharacterButton, CharacterPosition, Test } from "./game/character-position";
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
import { CoordDisplay } from "./dofus-map/dofus-map.Grid";
import { AdminPanel } from "./ui/AdminPanel";
import { useInteractiveEvents } from "./game/useInteractiveEvents";
import { useDofusEvent } from "./useDofusEvent";

export function App() {
    const baseUrl = useBaseUrl();
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();
    const [activeTab, setActiveTab] = useState<AppTab>("map");
    const hasRestoredTab = useRef(false);
    const [adminToken, setAdminToken] = useState<string | null>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const updateInfo = useUpdateCheck();
    const mappingsSynced = useMappingsSync();
    useInteractiveEvents();

    useEffect(() => {
        if (!config || hasRestoredTab.current) return;
        hasRestoredTab.current = true;
        const saved = config.activeTab as AppTab | undefined;
        if (saved && saved !== "settings") setActiveTab(saved);
    }, [config]);

    const handleTabChange = (tab: AppTab) => {
        setActiveTab(tab);
        updateConfig.mutate({ activeTab: tab });
    };

    useEffect(() => {
        window.api.getAdminToken().then(setAdminToken);
    }, []);

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
        if (!updateInfo?.updateAvailable) return;
        toaster.create({
            id: "update-available",
            title: "Update available",
            description: `Version ${updateInfo.latestVersion} is ready to download.`,
            type: "info",
            action: {
                label: "Download",
                onClick: () => window.api.openExternal(updateInfo.releaseUrl),
            },
            duration: undefined,
            closable: true,
        });
    }, [updateInfo]);

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
                            <CoordDisplay meta={meta} />
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
