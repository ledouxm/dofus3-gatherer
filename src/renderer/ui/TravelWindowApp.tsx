import { Box, Button, HStack, Heading, IconButton, Stack, Text } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import {
    LuClipboardPaste,
    LuMinus,
    LuPin,
    LuRefreshCw,
    LuX,
} from "react-icons/lu";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { mapStore } from "../providers/store";
import { trpcClient } from "../trpc";

type ClickMode = "copy" | "travel";
type WindowInfo = { title: string };

const ACTIVE_COLOR = "#d4f000";
const INACTIVE_COLOR = "rgba(255,255,255,0.38)";

const TravelTitleBar = () => {
    const [isPinned, setIsPinned] = useState(false);

    useEffect(() => {
        trpcClient.app.getAlwaysOnTop.query().then(setIsPinned);
    }, []);

    const handlePin = async () => {
        const newState = await trpcClient.app.toggleAlwaysOnTop.mutate();
        setIsPinned(newState);
    };

    return (
        <Box
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            bg="rgba(10, 12, 18, 0.92)"
            h="32px"
            flexShrink={0}
            display="flex"
            alignItems="stretch"
            px={1}
            borderBottom="1px solid rgba(255,255,255,0.08)"
        >
            <HStack w="full" justifyContent="space-between" gap={0} alignItems="stretch">
                {/* Left: pin + DEV badge */}
                <HStack gap={0} alignItems="center" flex={1}>
                    <Box style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <IconButton
                            aria-label="Pin window"
                            size="xs"
                            variant={isPinned ? "solid" : "ghost"}
                            colorPalette={isPinned ? "blue" : "gray"}
                            onClick={handlePin}
                            color={isPinned ? undefined : "whiteAlpha.600"}
                            _hover={{ color: "white" }}
                        >
                            <LuPin />
                        </IconButton>
                    </Box>
                    {import.meta.env.DEV && (
                        <Box
                            display="flex"
                            alignItems="center"
                            px="6px"
                            fontSize="10px"
                            fontWeight="700"
                            letterSpacing="0.12em"
                            color={ACTIVE_COLOR}
                            userSelect="none"
                        >
                            DEV
                        </Box>
                    )}
                </HStack>

                {/* Center: title */}
                <Box
                    display="flex"
                    alignItems="center"
                    px="12px"
                    fontSize="10px"
                    fontWeight="600"
                    letterSpacing="0.12em"
                    color={ACTIVE_COLOR}
                    userSelect="none"
                    style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
                >
                    ACTIONS RAPIDES
                </Box>

                {/* Right: minimize + close */}
                <HStack gap={0} alignItems="center" flex={1} justifyContent="flex-end">
                    <HStack gap={0} style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <IconButton
                            aria-label="Minimize"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.600"
                            _hover={{ color: "white", bg: "whiteAlpha.100" }}
                            onClick={() => trpcClient.app.minimizeWindow.mutate()}
                        >
                            <LuMinus />
                        </IconButton>
                        <IconButton
                            aria-label="Close"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.600"
                            _hover={{ color: "white", bg: "red.600" }}
                            onClick={() => trpcClient.app.closeWindow.mutate()}
                        >
                            <LuX />
                        </IconButton>
                    </HStack>
                </HStack>
            </HStack>
        </Box>
    );
};

export const TravelWindowApp = () => {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();

    const [clickMode, setClickModeState] = useState<ClickMode>(
        config?.travel?.sendToProcess === true ? "travel" : "copy",
    );
    const [windows, setWindows] = useState<WindowInfo[]>([]);
    const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

    const refresh = async (savedTitle?: string) => {
        const wins = await trpcClient.windows.getOpenWindows.query();
        setWindows(wins);
        if (wins.length === 0) return;
        const target = savedTitle ? wins.find((w) => w.title === savedTitle) : null;
        if (target) {
            setSelectedTitle(target.title);
            mapStore.set((v) => ({ ...v, travelTitle: target.title }));
        } else {
            const dofus = wins.find((w) => w.title.endsWith("- Release"));
            if (dofus) {
                setSelectedTitle(dofus.title);
                mapStore.set((v) => ({ ...v, travelTitle: dofus.title }));
            }
        }
    };

    useEffect(() => {
        refresh(config?.travel?.selectedWindowTitle);
    }, []);

    const selectWindow = (title: string | null) => {
        setSelectedTitle(title);
        mapStore.set((v) => ({ ...v, travelTitle: title }));
        trpcClient.config.save.mutate({ config: { travel: { ...config?.travel, selectedWindowTitle: title ?? undefined } } });
    };

    const setClickMode = (mode: ClickMode) => {
        setClickModeState(mode);
        updateConfig.mutate({
            copyCoordinatesOnClick: mode === "copy",
            travel: { ...config?.travel, sendToProcess: mode === "travel" },
        });
    };

    return (
        <Box display="flex" flexDir="column" h="100vh" bg="#0a0a0a" color="white">
            <TravelTitleBar />

            <Stack gap={4} p={4} flex={1} overflow="auto">
                {/* Window selector */}
                <Box>
                    <HStack justify="space-between" mb={2}>
                        <Heading size="xs" color={INACTIVE_COLOR} textTransform="uppercase" letterSpacing="wider">
                            Fenêtres
                        </Heading>
                        <IconButton
                            size="xs"
                            variant="ghost"
                            aria-label="Rafraîchir"
                            color="whiteAlpha.600"
                            _hover={{ color: "whiteAlpha.900" }}
                            onClick={() => refresh(selectedTitle ?? undefined)}
                        >
                            <LuRefreshCw />
                        </IconButton>
                    </HStack>
                    <select
                        value={selectedTitle ?? ""}
                        onChange={(e) => selectWindow(e.target.value || null)}
                        style={{
                            background: "rgb(15, 18, 28)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "6px",
                            color: "rgba(255,255,255,0.85)",
                            fontSize: "11px",
                            padding: "4px 6px",
                            cursor: "pointer",
                            width: "100%",
                        }}
                    >
                        <option value="" style={{ background: "rgb(15, 18, 28)" }}>
                            — Sélectionner —
                        </option>
                        {windows.map((w) => (
                            <option key={w.title} value={w.title} style={{ background: "rgb(15, 18, 28)" }}>
                                {w.title.length > 40 ? w.title.slice(0, 40) + "…" : w.title}
                            </option>
                        ))}
                    </select>
                </Box>

                {/* Travel button */}
                <Box>
                    <Heading size="xs" color={INACTIVE_COLOR} textTransform="uppercase" letterSpacing="wider" mb={2}>
                        Coller un voyage
                    </Heading>
                    <Button
                        w="100%"
                        h="40px"
                        disabled={selectedTitle === null}
                        onClick={() =>
                            selectedTitle !== null &&
                            trpcClient.windows.focusWindowAndSend.mutate({ title: selectedTitle, action: "travel" })
                        }
                        bg="rgba(212,240,0,0.08)"
                        color={selectedTitle !== null ? ACTIVE_COLOR : "rgba(255,255,255,0.3)"}
                        border={`1px solid ${selectedTitle !== null ? "rgba(212,240,0,0.4)" : "rgba(255,255,255,0.1)"}`}
                        borderRadius="md"
                        fontSize="13px"
                        fontWeight="700"
                        gap={2}
                        _hover={{
                            bg: selectedTitle !== null ? "rgba(212,240,0,0.15)" : "rgba(212,240,0,0.08)",
                        }}
                        _disabled={{ opacity: 1, cursor: "not-allowed" }}
                    >
                        <LuClipboardPaste />
                        Voyager
                    </Button>
                    <Text fontSize="10px" color="whiteAlpha.600" lineHeight="1.4" mt={2}>
                        Colle la commande <b>/travel</b> du presse-papier dans le jeu
                    </Text>
                </Box>

                {/* Click behavior */}
                <Box>
                    <Heading size="xs" color={INACTIVE_COLOR} textTransform="uppercase" letterSpacing="wider" mb={2}>
                        Comportement des clics
                    </Heading>
                    <HStack gap={2} mb={2}>
                        <Button
                            size="sm"
                            flex={1}
                            onClick={() => setClickMode("copy")}
                            bg={clickMode === "copy" ? "rgba(212,240,0,0.12)" : "transparent"}
                            color={clickMode === "copy" ? ACTIVE_COLOR : "rgba(255,255,255,0.7)"}
                            border={`1px solid ${clickMode === "copy" ? "rgba(212,240,0,0.5)" : "rgba(255,255,255,0.2)"}`}
                            borderRadius="md"
                            fontWeight="600"
                            _hover={{
                                bg: clickMode === "copy" ? "rgba(212,240,0,0.18)" : "rgba(255,255,255,0.08)",
                            }}
                        >
                            Copier
                        </Button>
                        <Button
                            size="sm"
                            flex={1}
                            onClick={() => setClickMode("travel")}
                            bg={clickMode === "travel" ? "rgba(212,240,0,0.12)" : "transparent"}
                            color={clickMode === "travel" ? ACTIVE_COLOR : "rgba(255,255,255,0.7)"}
                            border={`1px solid ${clickMode === "travel" ? "rgba(212,240,0,0.5)" : "rgba(255,255,255,0.2)"}`}
                            borderRadius="md"
                            fontWeight="600"
                            _hover={{
                                bg: clickMode === "travel" ? "rgba(212,240,0,0.18)" : "rgba(255,255,255,0.08)",
                            }}
                        >
                            Voyage auto
                        </Button>
                    </HStack>
                    <Text fontSize="xs" color="whiteAlpha.600" lineHeight="1.4">
                        {clickMode === "copy"
                            ? "Cliquer sur la map pour copier la commande travel"
                            : "Double-cliquer sur la map pour voyager automatiquement"}
                    </Text>
                </Box>
            </Stack>
        </Box>
    );
};
