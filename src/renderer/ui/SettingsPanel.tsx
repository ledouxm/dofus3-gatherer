import {
    Box,
    Button,
    Field,
    Flex,
    Heading,
    HStack,
    IconButton,
    Input,
    Stack,
    Text,
    Tooltip,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
    LuClipboardPaste,
    LuDownload,
    LuInfo,
    LuNavigation2,
    LuRefreshCw,
    LuSettings,
    LuUpload,
} from "react-icons/lu";
import { useConfig, useMappings, useUpdateConfigMutation } from "../providers/ConfigProvider";
import type { ConfigStore } from "../providers/store";
import { mapStore } from "../providers/store";

type ClickMode = "copy" | "travel";
type WindowInfo = { handle: number; title: string };

const MAPPING_HELP: Record<keyof ConfigStore["mappings"], string> = {
    CurrentMapMessage:
        "The obfuscated packet type name emitted by the server when the character changes map. Example: \"isj\".",
    "CurrentMapMessage.mapId":
        "The field key inside that packet's JSON data that contains the map ID. Example: \"mapId\" or \"a\".",
    QuestFinishedMessage:
        "The obfuscated packet type name emitted by the server when a quest is completed. Used to auto-advance guide progress.",
    "QuestFinishedMessage.questId":
        "The field key inside that packet's JSON data that contains the quest ID.",
};

export const SettingsPanel = () => {
    const mappings = useMappings();
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();

    // --- Config state ---
    const [draft, setDraft] = useState<ConfigStore["mappings"]>({ ...mappings });
    const [cdnUrl, setCdnUrl] = useState(config?.cdnBaseUrl ?? "");
    const [editingCdn, setEditingCdn] = useState(false);

    useEffect(() => {
        if (!config) return;
        setDraft({ ...mappings });
        setCdnUrl(config.cdnBaseUrl ?? "");
    }, [config?.cdnBaseUrl]);

    const handleSave = async () => {
        await updateConfig.mutateAsync({ mappings: draft });
    };

    const handleSaveCdn = async () => {
        await updateConfig.mutateAsync({ cdnBaseUrl: cdnUrl });
        setEditingCdn(false);
    };

    const handleExport = () => {
        const filtered = Object.fromEntries(Object.entries(draft).filter(([, v]) => v != null));
        const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "dofus-mappings.json";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const parsed = JSON.parse(e.target?.result as string);
                    setDraft((d) => ({
                        ...d,
                        ...Object.fromEntries(Object.entries(parsed).filter(([k]) => k in d)),
                    }));
                } catch { /* ignore invalid JSON */ }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    // --- Travel state ---
    const [clickMode, setClickModeState] = useState<ClickMode>(
        config?.travel?.sendToProcess === true ? "travel" : "copy",
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
        window.api.saveConfig({ travel: { ...config?.travel, selectedWindowTitle: title } });
    };

    const setClickMode = (mode: ClickMode) => {
        setClickModeState(mode);
        updateConfig.mutate({
            copyCoordinatesOnClick: mode === "copy",
            travel: { ...config?.travel, sendToProcess: mode === "travel" },
        });
    };

    return (
        <Box p={6}>
            <Stack gap={8} maxW="640px" mx="auto">

                {/* ── Configuration ── */}
                <Box>
                    <Flex align="center" gap={2} mb={5}>
                        <LuSettings />
                        <Heading size="md">Configuration</Heading>
                    </Flex>

                    <Stack gap={6}>
                        {/* Packet Mappings */}
                        <Box>
                            <Flex align="center" justify="space-between" mb={4}>
                                <Heading size="sm" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider">
                                    Packet Mappings
                                </Heading>
                                <Flex gap={1}>
                                    <IconButton aria-label="Import mappings" size="xs" variant="ghost" onClick={handleImport}>
                                        <LuUpload />
                                    </IconButton>
                                    <IconButton aria-label="Export mappings" size="xs" variant="ghost" onClick={handleExport}>
                                        <LuDownload />
                                    </IconButton>
                                </Flex>
                            </Flex>
                            <Stack gap={4}>
                                {(Object.keys(draft) as Array<keyof ConfigStore["mappings"]>).map((key) => (
                                    <MappingField
                                        key={key}
                                        label={key}
                                        help={MAPPING_HELP[key]}
                                        value={draft[key] ?? ""}
                                        onChange={(v) => setDraft((d) => ({ ...d, [key]: v || null }))}
                                    />
                                ))}
                            </Stack>
                            <Flex justify="flex-end" mt={4}>
                                <Button
                                    size="sm"
                                    colorScheme="blue"
                                    loading={updateConfig.isPending}
                                    onClick={handleSave}
                                >
                                    Save
                                </Button>
                            </Flex>
                        </Box>

                        {/* CDN URL */}
                        <Box>
                            <Heading size="sm" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider" mb={4}>
                                CDN URL
                            </Heading>
                            <Flex gap={2} align="center">
                                <Input
                                    size="sm"
                                    value={cdnUrl}
                                    onChange={(e) => setCdnUrl(e.target.value)}
                                    disabled={!editingCdn}
                                    fontFamily="mono"
                                    bg="whiteAlpha.50"
                                    border="1px solid"
                                    borderColor="whiteAlpha.200"
                                    _focus={{ borderColor: "blue.400", bg: "whiteAlpha.100" }}
                                    flex={1}
                                />
                                {editingCdn ? (
                                    <Button size="sm" colorScheme="blue" onClick={handleSaveCdn} loading={updateConfig.isPending}>
                                        Save
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => setEditingCdn(true)}>
                                        Edit
                                    </Button>
                                )}
                            </Flex>
                        </Box>
                    </Stack>
                </Box>

                {/* ── Travel ── */}
                <Box borderTop="1px solid" borderColor="whiteAlpha.100" pt={8}>
                    <Flex align="center" gap={2} mb={5}>
                        <LuNavigation2 />
                        <Heading size="md">Travel</Heading>
                    </Flex>

                    <Stack gap={5}>
                        {/* Window selector */}
                        <Box>
                            <HStack justify="space-between" mb={2}>
                                <Heading size="sm" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider">
                                    Fenêtres
                                </Heading>
                                <IconButton
                                    size="xs"
                                    variant="ghost"
                                    aria-label="Rafraîchir"
                                    color="whiteAlpha.600"
                                    _hover={{ color: "whiteAlpha.900" }}
                                    onClick={() => refresh(windows.find((w) => w.handle === selectedHandle)?.title)}
                                >
                                    <LuRefreshCw />
                                </IconButton>
                            </HStack>
                            <select
                                value={selectedHandle ?? ""}
                                onChange={(e) => selectWindow(e.target.value ? Number(e.target.value) : null)}
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
                                    <option key={w.handle} value={w.handle} style={{ background: "rgb(15, 18, 28)" }}>
                                        {w.title.length > 40 ? w.title.slice(0, 40) + "…" : w.title}
                                    </option>
                                ))}
                            </select>
                        </Box>

                        {/* Travel button */}
                        <Box>
                            <Heading size="sm" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider" mb={2}>
                                Coller un voyage
                            </Heading>
                            <Button
                                w="100%"
                                h="40px"
                                disabled={selectedHandle === null}
                                onClick={() =>
                                    selectedHandle !== null &&
                                    window.api.focusWindowAndSend(selectedHandle, "travel")
                                }
                                bg="rgba(212,240,0,0.08)"
                                color={selectedHandle !== null ? "#d4f000" : "rgba(255,255,255,0.3)"}
                                border={`1px solid ${selectedHandle !== null ? "rgba(212,240,0,0.4)" : "rgba(255,255,255,0.1)"}`}
                                borderRadius="md"
                                fontSize="13px"
                                fontWeight="700"
                                gap={2}
                                _hover={{
                                    bg: selectedHandle !== null ? "rgba(212,240,0,0.15)" : "rgba(212,240,0,0.08)",
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
                            <Heading size="sm" color="whiteAlpha.600" textTransform="uppercase" letterSpacing="wider" mb={3}>
                                Comportement des clics
                            </Heading>
                            <HStack gap={2} mb={2}>
                                <Button
                                    size="sm"
                                    flex={1}
                                    onClick={() => setClickMode("copy")}
                                    bg={clickMode === "copy" ? "rgba(212,240,0,0.12)" : "transparent"}
                                    color={clickMode === "copy" ? "#d4f000" : "rgba(255,255,255,0.7)"}
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
                                    color={clickMode === "travel" ? "#d4f000" : "rgba(255,255,255,0.7)"}
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

            </Stack>
        </Box>
    );
};

const MappingField = ({
    label,
    help,
    value,
    onChange,
}: {
    label: string;
    help: string;
    value: string;
    onChange: (v: string) => void;
}) => (
    <Field.Root>
        <Flex align="center" gap={2} mb={1}>
            <Field.Label mb={0} fontSize="sm" color="whiteAlpha.800">
                {label}
            </Field.Label>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <Box color="whiteAlpha.500" cursor="help" display="flex" alignItems="center">
                        <LuInfo size={13} />
                    </Box>
                </Tooltip.Trigger>
                <Tooltip.Positioner>
                    <Tooltip.Content maxW="260px" fontSize="xs">
                        {help}
                    </Tooltip.Content>
                </Tooltip.Positioner>
            </Tooltip.Root>
        </Flex>
        <Input
            size="sm"
            placeholder="e.g. isj"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            fontFamily="mono"
            bg="whiteAlpha.50"
            border="1px solid"
            borderColor="whiteAlpha.200"
            _focus={{ borderColor: "blue.400", bg: "whiteAlpha.100" }}
        />
    </Field.Root>
);
