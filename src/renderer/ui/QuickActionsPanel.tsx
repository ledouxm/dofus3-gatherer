import { Box, Button, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";

type WindowInfo = { title: string };

const panelBg = "rgba(10, 12, 18, 0.85)";
const border = "1px solid rgba(255,255,255,0.1)";

export function QuickActionsPanel() {
    const [windows, setWindows] = useState<WindowInfo[]>([]);
    const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

    const refresh = async (savedTitle?: string) => {
        const wins = await window.api.getOpenWindows();
        setWindows(wins);
        if (wins.length === 0) return;
        const target = savedTitle ? wins.find((w) => w.title === savedTitle) : null;
        if (target) {
            setSelectedTitle(target.title);
        } else if (selectedTitle === null) {
            setSelectedTitle(wins[0].title);
        }
    };

    useEffect(() => {
        window.api.getConfig().then((cfg) => {
            refresh(cfg?.quickActions?.selectedWindowTitle);
        });
    }, []);

    const selectWindow = (title: string) => {
        setSelectedTitle(title);
        window.api.saveConfig({ quickActions: { selectedWindowTitle: title } });
    };

    const send = (action: "H" | "travel") => {
        if (selectedTitle === null) return;
        window.api.focusWindowAndSend(selectedTitle, action);
    };

    return (
        <Box
            w="100%"
            h="100%"
            bg={panelBg}
            p={4}
            display="flex"
            flexDirection="column"
            gap={3}
            overflow="hidden"
        >
            <HStack justify="space-between" flexShrink={0}>
                <Text fontSize="xs" color="whiteAlpha.600" fontWeight="semibold" letterSpacing="wider">
                    FENÊTRES
                </Text>
                <IconButton
                    size="xs"
                    variant="ghost"
                    aria-label="Rafraîchir"
                    color="whiteAlpha.500"
                    _hover={{ color: "whiteAlpha.900" }}
                    onClick={() => refresh()}
                >
                    <LuRefreshCw />
                </IconButton>
            </HStack>

            <select
                value={selectedTitle ?? ""}
                onChange={(e) => selectWindow(e.target.value)}
                style={{
                    background: "rgb(15, 18, 28)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "6px",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: "11px",
                    padding: "4px 6px",
                    cursor: "pointer",
                    flexShrink: 0,
                    width: "100%",
                }}
            >
                {windows.map((w) => (
                    <option key={w.title} value={w.title} style={{ background: "rgb(15, 18, 28)" }}>
                        {w.title.length > 22 ? w.title.slice(0, 22) + "…" : w.title}
                    </option>
                ))}
            </select>

            <Box borderTop={border} flexShrink={0} />

            <VStack gap={2} flex={1} alignItems="stretch">
                <Button
                    size="sm"
                    variant="solid"
                    bg="rgba(255,255,255,0.07)"
                    border={border}
                    color="whiteAlpha.800"
                    _hover={{ bg: "rgba(255,255,255,0.12)" }}
                    _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
                    disabled={selectedTitle === null}
                    onClick={() => send("H")}
                    fontFamily="mono"
                    fontWeight="bold"
                    letterSpacing="wider"
                >
                    H
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    bg="rgba(255,255,255,0.07)"
                    border={border}
                    color="whiteAlpha.800"
                    _hover={{ bg: "rgba(255,255,255,0.12)" }}
                    _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
                    disabled={selectedTitle === null}
                    onClick={() => send("travel")}
                    fontSize="xs"
                >
                    Voyage
                </Button>
            </VStack>
        </Box>
    );
}
