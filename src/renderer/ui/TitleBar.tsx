import { Box, HStack, IconButton, Tooltip } from "@chakra-ui/react";
import React, { useEffect, useState } from "react";
import {
    LuBookOpen,
    LuMap,
    LuMinus,
    LuMonitor,
    LuNavigation2,
    LuPin,
    LuSearch,
    LuSettings,
    LuShield,
    LuSprout,
    LuX,
} from "react-icons/lu";

export type AppTab = "map" | "viewer" | "admin" | "guides" | "explorer" | "harvests";

const BASE_TABS: { id: AppTab; label: string; icon: React.ReactNode }[] = [
    { id: "map", label: "MAP", icon: <LuMap /> },
    { id: "viewer", label: "VIEWER", icon: <LuMonitor /> },
    { id: "guides", label: "GUIDES", icon: <LuBookOpen /> },
    { id: "explorer", label: "EXPLORER", icon: <LuSearch /> },
    { id: "harvests", label: "RÉCOLTES", icon: <LuSprout /> },
];

const ADMIN_TAB: { id: AppTab; label: string; icon: React.ReactNode } = {
    id: "admin",
    label: "ADMIN",
    icon: <LuShield />,
};

const ACTIVE_COLOR = "#d4f000";
const INACTIVE_COLOR = "rgba(255,255,255,0.38)";

interface TitleBarProps {
    activeTab: AppTab;
    onTabChange: (tab: AppTab) => void;
    showAdminTab?: boolean;
    onOpenConfig?: () => void;
    onOpenTravelWindow?: () => void;
}

export const TitleBar = ({
    activeTab,
    onTabChange,
    showAdminTab,
    onOpenConfig,
    onOpenTravelWindow,
}: TitleBarProps) => {
    const tabs = showAdminTab ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;
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
                {/* Left side: pin + gear + DEV badge */}
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
                    <Box style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <IconButton
                            aria-label="Config"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.600"
                            _hover={{ color: "white" }}
                            onClick={onOpenConfig}
                        >
                            <LuSettings />
                        </IconButton>
                    </Box>
                    <Box style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                        <IconButton
                            aria-label="Actions rapides"
                            size="xs"
                            variant="ghost"
                            color="whiteAlpha.600"
                            _hover={{ color: "white" }}
                            onClick={onOpenTravelWindow}
                        >
                            <LuNavigation2 />
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
                            <Tooltip.Root key={tab.id} openDelay={300}>
                                <Tooltip.Trigger asChild>
                                    <Box
                                        as="button"
                                        onClick={() => onTabChange(tab.id)}
                                        display="flex"
                                        alignItems="center"
                                        gap="5px"
                                        px={{ base: "8px", md: "12px" }}
                                        h="100%"
                                        fontSize="10px"
                                        fontWeight="600"
                                        letterSpacing="0.12em"
                                        color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR}
                                        bg="transparent"
                                        border="none"
                                        borderBottom={
                                            isActive
                                                ? `2px solid ${ACTIVE_COLOR}`
                                                : "2px solid transparent"
                                        }
                                        cursor="pointer"
                                        userSelect="none"
                                        transition="color 0.15s, border-color 0.15s"
                                        _hover={{
                                            color: isActive
                                                ? ACTIVE_COLOR
                                                : "rgba(255,255,255,0.7)",
                                        }}
                                        style={{ outline: "none", boxSizing: "border-box" }}
                                    >
                                        <Box fontSize="12px" flexShrink={0}>
                                            {tab.icon}
                                        </Box>
                                        <Box display={{ base: "none", md: "block" }}>
                                            {tab.label}
                                        </Box>
                                    </Box>
                                </Tooltip.Trigger>
                                <Tooltip.Positioner>
                                    <Tooltip.Content fontSize="xs">{tab.label}</Tooltip.Content>
                                </Tooltip.Positioner>
                            </Tooltip.Root>
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
