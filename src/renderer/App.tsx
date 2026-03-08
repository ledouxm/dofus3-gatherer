import { useEffect, useState } from "react";
import { DofusLeafletMap } from "./dofus-map/DofusLeafletMap";
import { RecoltablesLayer } from "./dofus-map/RecoltablesLayer";
import "./index.css";

import { useBaseUrl } from "./providers/ConfigProvider";
import { CenterOnCharacterButton, CharacterPosition } from "./game/character-position";
import { ConfigButton } from "./ui/ConfigButton";
import { HintCategoryButtons } from "./ui/HintCategoryButtons";
import { ResourcePickerButton } from "./ui/ResourcePickerButton";
import { type AppTab, TitleBar } from "./ui/TitleBar";
import { WorldMapPickerButton } from "./ui/WorldMapPickerButton";
import { HintsLayer } from "./dofus-map/HintsLayer";
import { TravelButton } from "./ui/TravelButton";
import { QuestsPanel } from "./ui/QuestsPanel";
import { ViewerApp } from "./viewer/ViewerApp";
import { Toaster, toaster } from "./ui/toaster";
import { useUpdateCheck } from "./useUpdateCheck";
import { useMappingsSync } from "./useMappingsSync";
import { CoordDisplay } from "./dofus-map/dofus-map.Grid";
import { AdminPanel } from "./ui/AdminPanel";

export function App() {
    const baseUrl = useBaseUrl();
    const [activeTab, setActiveTab] = useState<AppTab>("map");
    const [adminToken, setAdminToken] = useState<string | null>(null);
    const updateInfo = useUpdateCheck();
    const mappingsSynced = useMappingsSync();

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
            <TitleBar activeTab={activeTab} onTabChange={setActiveTab} showAdminTab={!!adminToken} />

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
                <ConfigButton />
                <WorldMapPickerButton />
                <ResourcePickerButton />
                <HintCategoryButtons />
                <CenterOnCharacterButton />
                <TravelButton />
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

            {/* Quests tab */}
            <div
                style={{
                    display: activeTab === "quests" ? "flex" : "none",
                    flex: 1,
                    overflow: "hidden",
                }}
            >
                <QuestsPanel />
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
