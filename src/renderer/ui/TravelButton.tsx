import { Box, Button, Flex, HStack, IconButton, Popover, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuClipboardPaste, LuNavigation2, LuRefreshCw } from "react-icons/lu";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { mapStore } from "../providers/store";

type WindowInfo = { handle: number; title: string };
type ClickMode = "copy" | "travel";

export const TravelButton = () => {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();

    const [clickMode, setClickModeState] = useState<ClickMode>(
        config.travel?.sendToProcess === true ? "travel" : "copy",
    );
    const [windows, setWindows] = useState<WindowInfo[]>([]);
    const [selectedHandle, setSelectedHandle] = useState<number | null>(null);

    const refresh = async (savedTitle?: string) => {
        const wins = await window.api.getOpenWindows();
        setWindows(wins);
        if (wins.length === 0) return;
        const target = savedTitle ? wins.find((w) => w.title === savedTitle) : null;
        if (target) {
            setSelectedHandle(target.handle);
            mapStore.set((v) => ({ ...v, travelHandle: target.handle }));
        } else {
            const dofus = wins.find((w) => w.title.endsWith("- Release"));
            if (dofus) {
                setSelectedHandle(dofus.handle);
                mapStore.set((v) => ({ ...v, travelHandle: dofus.handle }));
            }
        }
    };

    useEffect(() => {
        window.api.getConfig().then((cfg) => {
            refresh(cfg?.travel?.selectedWindowTitle);
        });
    }, []);

    const selectWindow = (handle: number | null) => {
        setSelectedHandle(handle);
        mapStore.set((v) => ({ ...v, travelHandle: handle }));
        const title = handle ? windows.find((w) => w.handle === handle)?.title : undefined;
        window.api.saveConfig({ travel: { ...config.travel, selectedWindowTitle: title } });
    };

    const setClickMode = (mode: ClickMode) => {
        setClickModeState(mode);
        updateConfig.mutate({
            copyCoordinatesOnClick: mode === "copy",
            travel: { ...config.travel, sendToProcess: mode === "travel" },
        });
    };

    return (
        <Box position="absolute" top="8px" right="8px" zIndex={1000}>
            <Popover.Root>
                <Popover.Trigger asChild>
                    <IconButton
                        aria-label="Travel options"
                        size="sm"
                        variant="solid"
                        borderRadius="md"
                        bg="rgba(10, 12, 18, 0.85)"
                        _hover={{ bg: "rgba(30, 35, 50, 0.95)" }}
                        border="1px solid rgba(255,255,255,0.1)"
                        h="36px"
                        w="36px"
                        minW="36px"
                        color="whiteAlpha.700"
                    >
                        <LuNavigation2 />
                    </IconButton>
                </Popover.Trigger>
                <Popover.Positioner>
                    <Popover.Content
                        w="220px"
                        bg="rgba(10, 12, 18, 0.97)"
                        border="1px solid rgba(255,255,255,0.12)"
                        borderRadius="md"
                        p={3}
                    >
                        {/* Window selector — always visible */}
                        <HStack justify="space-between" mb={2}>
                            <Text
                                fontSize="10px"
                                fontWeight="600"
                                letterSpacing="0.12em"
                                color="whiteAlpha.700"
                            >
                                FENÊTRES
                            </Text>
                            <IconButton
                                size="xs"
                                variant="ghost"
                                aria-label="Rafraîchir"
                                color="whiteAlpha.600"
                                _hover={{ color: "whiteAlpha.900" }}
                                onClick={() =>
                                    refresh(windows.find((w) => w.handle === selectedHandle)?.title)
                                }
                            >
                                <LuRefreshCw />
                            </IconButton>
                        </HStack>

                        <select
                            value={selectedHandle ?? ""}
                            onChange={(e) =>
                                selectWindow(e.target.value ? Number(e.target.value) : null)
                            }
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
                                <option
                                    key={w.handle}
                                    value={w.handle}
                                    style={{ background: "rgb(15, 18, 28)" }}
                                >
                                    {w.title.length > 26 ? w.title.slice(0, 26) + "…" : w.title}
                                </option>
                            ))}
                        </select>

                        {/* Big paste & travel button */}
                        <Box mt={4} pt={3} borderTop="1px solid rgba(255,255,255,0.08)">
                            <Text
                                fontSize="10px"
                                fontWeight="600"
                                letterSpacing="0.12em"
                                color="whiteAlpha.700"
                                mb={1}
                            >
                                COLLER UN VOYAGE
                            </Text>
                            <Button
                                mt={2}
                                w="100%"
                                h="40px"
                                disabled={selectedHandle === null}
                                onClick={() =>
                                    selectedHandle !== null &&
                                    window.api.focusWindowAndSend(selectedHandle, "travel")
                                }
                                bg="rgba(212,240,0,0.08)"
                                color={
                                    selectedHandle !== null ? "#d4f000" : "rgba(255,255,255,0.3)"
                                }
                                border={`1px solid ${selectedHandle !== null ? "rgba(212,240,0,0.4)" : "rgba(255,255,255,0.1)"}`}
                                borderRadius="md"
                                fontSize="13px"
                                fontWeight="700"
                                gap={2}
                                _hover={{
                                    bg:
                                        selectedHandle !== null
                                            ? "rgba(212,240,0,0.15)"
                                            : "rgba(212,240,0,0.08)",
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

                        {/* Comportement des clics */}
                        <Flex
                            direction="column"
                            mt={3}
                            pt={3}
                            borderTop="1px solid rgba(255,255,255,0.08)"
                        >
                            <Text
                                fontSize="10px"
                                fontWeight="600"
                                letterSpacing="0.12em"
                                color="whiteAlpha.600"
                                mb={2}
                            >
                                COMPORTEMENT DES CLICS
                            </Text>
                            <HStack gap={1} mb={2}>
                                <Button
                                    size="xs"
                                    flex={1}
                                    onClick={() => setClickMode("copy")}
                                    bg={
                                        clickMode === "copy"
                                            ? "rgba(212,240,0,0.12)"
                                            : "transparent"
                                    }
                                    color={
                                        clickMode === "copy" ? "#d4f000" : "rgba(255,255,255,0.7)"
                                    }
                                    border={`1px solid ${clickMode === "copy" ? "rgba(212,240,0,0.5)" : "rgba(255,255,255,0.2)"}`}
                                    borderRadius="md"
                                    fontSize="10px"
                                    fontWeight="600"
                                    _hover={{
                                        bg:
                                            clickMode === "copy"
                                                ? "rgba(212,240,0,0.18)"
                                                : "rgba(255,255,255,0.08)",
                                    }}
                                >
                                    Copier
                                </Button>
                                <Button
                                    size="xs"
                                    flex={1}
                                    onClick={() => setClickMode("travel")}
                                    bg={
                                        clickMode === "travel"
                                            ? "rgba(212,240,0,0.12)"
                                            : "transparent"
                                    }
                                    color={
                                        clickMode === "travel" ? "#d4f000" : "rgba(255,255,255,0.7)"
                                    }
                                    border={`1px solid ${clickMode === "travel" ? "rgba(212,240,0,0.5)" : "rgba(255,255,255,0.2)"}`}
                                    borderRadius="md"
                                    fontSize="10px"
                                    fontWeight="600"
                                    _hover={{
                                        bg:
                                            clickMode === "travel"
                                                ? "rgba(212,240,0,0.18)"
                                                : "rgba(255,255,255,0.08)",
                                    }}
                                >
                                    Voyage auto
                                </Button>
                            </HStack>
                            <Text fontSize="10px" color="whiteAlpha.600" lineHeight="1.4">
                                {clickMode === "copy"
                                    ? "Cliquer sur la map pour copier la commande travel"
                                    : "Double-cliquer sur la map pour voyager automatiquement"}
                            </Text>
                        </Flex>
                    </Popover.Content>
                </Popover.Positioner>
            </Popover.Root>
        </Box>
    );
};
