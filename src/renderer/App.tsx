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
import { QuickActionsPanel } from "./ui/QuickActionsPanel";
import { QuestsPanel } from "./ui/QuestsPanel";
import { ViewerApp } from "./viewer/ViewerApp";
import { Toaster, toaster } from "./ui/toaster";
import { useUpdateCheck } from "./useUpdateCheck";
import { CoordDisplay } from "./dofus-map/dofus-map.Grid";

export function App() {
    const baseUrl = useBaseUrl();
    const [activeTab, setActiveTab] = useState<AppTab>("map");
    const updateInfo = useUpdateCheck();

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
            <TitleBar activeTab={activeTab} onTabChange={setActiveTab} />

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
                <ConfigButton onOpenViewer={() => setActiveTab("viewer")} />
                <WorldMapPickerButton />
                <ResourcePickerButton />
                <HintCategoryButtons />
                <CenterOnCharacterButton />
            </div>

            {/* Actions tab */}
            <div
                style={{
                    display: activeTab === "actions" ? "flex" : "none",
                    flex: 1,
                    overflow: "hidden",
                }}
            >
                <QuickActionsPanel />
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
        </div>
    );
}

export default App;
