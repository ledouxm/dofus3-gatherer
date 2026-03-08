import { Box, Checkbox, Flex, HStack, IconButton, Popover, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuNavigation2, LuRefreshCw } from "react-icons/lu";
import { useConfig, useUpdateConfigMutation } from "../providers/ConfigProvider";
import { mapStore } from "../providers/store";

type WindowInfo = { handle: number; title: string };

export const TravelButton = () => {
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();

    const [copyToClipboard, setCopyToClipboard] = useState(config.copyCoordinatesOnClick !== false);
    const [sendToProcess, setSendToProcess] = useState(config.travel?.sendToProcess === true);
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
        } else if (selectedHandle === null && wins.length > 0) {
            setSelectedHandle(wins[0].handle);
            mapStore.set((v) => ({ ...v, travelHandle: wins[0].handle }));
        }
    };

    useEffect(() => {
        window.api.getConfig().then((cfg) => {
            refresh(cfg?.travel?.selectedWindowTitle);
        });
    }, []);

    const selectWindow = (handle: number) => {
        setSelectedHandle(handle);
        mapStore.set((v) => ({ ...v, travelHandle: handle }));
        const title = windows.find((w) => w.handle === handle)?.title;
        if (title) window.api.saveConfig({ travel: { ...config.travel, selectedWindowTitle: title } });
    };

    const toggleCopyToClipboard = (checked: boolean) => {
        setCopyToClipboard(checked);
        updateConfig.mutate({ copyCoordinatesOnClick: checked });
    };

    const toggleSendToProcess = (checked: boolean) => {
        setSendToProcess(checked);
        updateConfig.mutate({ travel: { ...config.travel, sendToProcess: checked } });
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
                        <Text fontSize="10px" fontWeight="600" letterSpacing="0.12em" color="whiteAlpha.500" mb={3}>
                            TRAVEL OPTIONS
                        </Text>

                        <Flex direction="column" gap={2} mb={3}>
                            <Checkbox.Root
                                checked={copyToClipboard}
                                onCheckedChange={(e) => toggleCopyToClipboard(!!e.checked)}
                                size="sm"
                            >
                                <Checkbox.HiddenInput />
                                <Checkbox.Control />
                                <Checkbox.Label>
                                    <Text fontSize="sm" color="whiteAlpha.800">Copy /travel to clipboard</Text>
                                </Checkbox.Label>
                            </Checkbox.Root>

                            <Checkbox.Root
                                checked={sendToProcess}
                                onCheckedChange={(e) => toggleSendToProcess(!!e.checked)}
                                size="sm"
                            >
                                <Checkbox.HiddenInput />
                                <Checkbox.Control />
                                <Checkbox.Label>
                                    <Text fontSize="sm" color="whiteAlpha.800">Write to process</Text>
                                </Checkbox.Label>
                            </Checkbox.Root>
                        </Flex>

                        <Box borderTop="1px solid rgba(255,255,255,0.08)" pt={3}>
                            <HStack justify="space-between" mb={2}>
                                <Text fontSize="10px" fontWeight="600" letterSpacing="0.12em" color="whiteAlpha.500">
                                    FENÊTRES
                                </Text>
                                <IconButton
                                    size="xs"
                                    variant="ghost"
                                    aria-label="Rafraîchir"
                                    color="whiteAlpha.500"
                                    _hover={{ color: "whiteAlpha.900" }}
                                    onClick={() => refresh(windows.find((w) => w.handle === selectedHandle)?.title)}
                                >
                                    <LuRefreshCw />
                                </IconButton>
                            </HStack>

                            <select
                                value={selectedHandle ?? ""}
                                onChange={(e) => selectWindow(Number(e.target.value))}
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
                                {windows.map((w) => (
                                    <option key={w.handle} value={w.handle} style={{ background: "rgb(15, 18, 28)" }}>
                                        {w.title.length > 26 ? w.title.slice(0, 26) + "…" : w.title}
                                    </option>
                                ))}
                            </select>
                        </Box>
                    </Popover.Content>
                </Popover.Positioner>
            </Popover.Root>
        </Box>
    );
};
