import {
    Box,
    Button,
    CloseButton,
    Dialog,
    Field,
    Flex,
    Heading,
    IconButton,
    Input,
    Stack,
    Switch,
    Text,
    Tooltip,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuDownload, LuExternalLink, LuInfo, LuSettings, LuUpload } from "react-icons/lu";
import { useConfig, useMappings, useUpdateConfigMutation } from "../providers/ConfigProvider";
import type { ConfigStore } from "../providers/store";
import { OverlayIconButton } from "./OverlayIconButton";

/**
 * Config button + modal for editing `config.mappings`.
 * Positioned above the WorldMapPickerButton (bottom: 96px).
 *
 * Also provides an entry point to open the Packet Viewer window,
 * which helps users find correct obfuscated packet names by recording
 * live Dofus traffic and replaying it synchronized with a screen capture.
 */
export const ConfigButton = ({ onOpenViewer }: { onOpenViewer?: () => void }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <OverlayIconButton aria-label="Configuration" bottom="96px" left="8px" onClick={() => setOpen(true)}>
                <LuSettings />
            </OverlayIconButton>
            <ConfigModal open={open} onClose={() => setOpen(false)} onOpenViewer={onOpenViewer} />
        </>
    );
};

const MAPPING_HELP: Record<keyof ConfigStore["mappings"], string> = {
    CurrentMapMessage:
        "The obfuscated packet type name emitted by the server when the character changes map. Example: \"isj\".",
    "CurrentMapMessage.mapId":
        "The field key inside that packet's JSON data that contains the map ID. Example: \"mapId\" or \"a\".",
};

const ConfigModal = ({ open, onClose, onOpenViewer }: { open: boolean; onClose: () => void; onOpenViewer?: () => void }) => {
    const mappings = useMappings();
    const config = useConfig();
    const updateConfig = useUpdateConfigMutation();

    const [draft, setDraft] = useState<ConfigStore["mappings"]>({ ...mappings });
    const [copyOnClick, setCopyOnClick] = useState(config.copyCoordinatesOnClick !== false);

    const handleOpen = () => {
        setDraft({ ...mappings });
        setCopyOnClick(config.copyCoordinatesOnClick !== false);
    };

    const handleSave = async () => {
        await updateConfig.mutateAsync({ mappings: draft, copyCoordinatesOnClick: copyOnClick });
        onClose();
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
                    setDraft((d) => ({ ...d, ...Object.fromEntries(
                        Object.entries(parsed).filter(([k]) => k in d)
                    ) }));
                } catch { /* ignore invalid JSON */ }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const openViewer = () => {
        onClose();
        onOpenViewer?.();
    };

    return (
        <Dialog.Root
            open={open}
            onOpenChange={(d) => {
                if (d.open) handleOpen();
                else onClose();
            }}
            size="lg"
        >
            <Dialog.Backdrop />
            <Dialog.Positioner>
                <Dialog.Content bg="gray.900" border="1px solid" borderColor="whiteAlpha.200" maxW="640px">
                    <Dialog.Header pb={2}>
                        <Dialog.Title>
                            <Flex align="center" gap={2}>
                                <LuSettings />
                                <Text>Configuration</Text>
                            </Flex>
                        </Dialog.Title>
                        <Dialog.CloseTrigger asChild>
                            <CloseButton size="sm" position="absolute" top={3} right={3} />
                        </Dialog.CloseTrigger>
                    </Dialog.Header>

                    <Dialog.Body>
                        <Stack gap={6}>
                            {/* Mappings section */}
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
                                            onChange={(v) =>
                                                setDraft((d) => ({ ...d, [key]: v || null }))
                                            }
                                        />
                                    ))}
                                </Stack>
                            </Box>

                            {/* Map interaction */}
                            <Box>
                                <Heading size="sm" color="whiteAlpha.600" mb={4} textTransform="uppercase" letterSpacing="wider">
                                    Map
                                </Heading>
                                <Flex align="center" justify="space-between">
                                    <Text fontSize="sm" color="whiteAlpha.800">Copy /travel on cell click</Text>
                                    <Switch.Root
                                        checked={copyOnClick}
                                        onCheckedChange={(e) => setCopyOnClick(e.checked)}
                                        size="sm"
                                    >
                                        <Switch.HiddenInput />
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                    </Switch.Root>
                                </Flex>
                            </Box>

                            {/* Viewer hint */}
                            <Box
                                bg="whiteAlpha.50"
                                borderRadius="md"
                                border="1px solid"
                                borderColor="whiteAlpha.100"
                                p={4}
                            >
                                <Text fontSize="sm" color="whiteAlpha.700" mb={3}>
                                    Not sure what the obfuscated names are? Use the Packet Viewer to record live
                                    traffic and replay it frame-by-frame alongside a screen capture of Dofus.
                                </Text>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    colorScheme="blue"
                                    onClick={openViewer}
                                    gap={2}
                                >
                                    <LuExternalLink />
                                    Open Packet Viewer
                                </Button>
                            </Box>
                        </Stack>
                    </Dialog.Body>

                    <Dialog.Footer gap={3}>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            colorScheme="blue"
                            loading={updateConfig.isPending}
                            onClick={handleSave}
                        >
                            Save
                        </Button>
                    </Dialog.Footer>
                </Dialog.Content>
            </Dialog.Positioner>
        </Dialog.Root>
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
