import { Box, HStack, IconButton } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import { LuMinus, LuPin, LuX } from "react-icons/lu";

export type AppTab = "map" | "viewer" | "donjons" | "admin" | "guides";

const BASE_TABS: { id: AppTab; label: string }[] = [
    { id: "map", label: "MAP" },
    { id: "viewer", label: "VIEWER" },
    { id: "donjons", label: "DONJONS" },
    { id: "guides", label: "GUIDES" },
];

const ACTIVE_COLOR = "#d4f000";
const INACTIVE_COLOR = "rgba(255,255,255,0.38)";

interface TitleBarProps {
    activeTab: AppTab;
    onTabChange: (tab: AppTab) => void;
    showAdminTab?: boolean;
}

export const TitleBar = ({ activeTab, onTabChange, showAdminTab }: TitleBarProps) => {
    const tabs = showAdminTab
        ? [...BASE_TABS, { id: "admin" as AppTab, label: "ADMIN" }]
        : BASE_TABS;
    const [isPinned, setIsPinned] = useState(false);

    useEffect(() => {
        window.api.getAlwaysOnTop().then(setIsPinned);
    }, []);

    const handlePin = async () => {
        const newState = await window.api.toggleAlwaysOnTop();
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
                {/* Left side: pin + DEV badge */}
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

                {/* Tab triggers */}
                <HStack
                    gap={0}
                    alignItems="stretch"
                    style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <Box
                                key={tab.id}
                                as="button"
                                onClick={() => onTabChange(tab.id)}
                                display="flex"
                                alignItems="center"
                                px="12px"
                                h="100%"
                                fontSize="10px"
                                fontWeight="600"
                                letterSpacing="0.12em"
                                color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR}
                                bg="transparent"
                                border="none"
                                borderBottom={isActive ? `2px solid ${ACTIVE_COLOR}` : "2px solid transparent"}
                                cursor="pointer"
                                userSelect="none"
                                transition="color 0.15s, border-color 0.15s"
                                _hover={{ color: isActive ? ACTIVE_COLOR : "rgba(255,255,255,0.7)" }}
                                style={{ outline: "none", boxSizing: "border-box" }}
                            >
                                {tab.label}
                            </Box>
                        );
                    })}
                </HStack>

                {/* Window controls */}
                <HStack gap={0} alignItems="center" flex={1} justifyContent="flex-end">
                    <HStack gap={0} style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <IconButton
                            aria-label="Minimize"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.600"
                            _hover={{ color: "white", bg: "whiteAlpha.100" }}
                            onClick={() => window.api.minimizeWindow()}
                        >
                            <LuMinus />
                        </IconButton>
                        <IconButton
                            aria-label="Close"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.600"
                            _hover={{ color: "white", bg: "red.600" }}
                            onClick={() => window.api.closeWindow()}
                        >
                            <LuX />
                        </IconButton>
                    </HStack>
                </HStack>
            </HStack>
        </Box>
    );
};
