import {
    Box,
    Button,
    CloseButton,
    Dialog,
    Field,
    Flex,
    Heading,
    Input,
    Stack,
    Text,
    Tooltip,
} from "@chakra-ui/react";
import { useState } from "react";
import { LuExternalLink, LuInfo, LuSettings } from "react-icons/lu";
import { useMappings, useUpdateConfigMutation } from "../providers/ConfigProvider";
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
export const ConfigButton = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <OverlayIconButton aria-label="Configuration" bottom="96px" left="8px" onClick={() => setOpen(true)}>
                <LuSettings />
            </OverlayIconButton>
            <ConfigModal open={open} onClose={() => setOpen(false)} />
        </>
    );
};

const MAPPING_HELP: Record<keyof ConfigStore["mappings"], string> = {
    CurrentMapMessage:
        "The obfuscated packet type name emitted by the server when the character changes map. Example: \"isj\".",
    "CurrentMapMessage.mapId":
        "The field key inside that packet's JSON data that contains the map ID. Example: \"mapId\" or \"a\".",
};

const ConfigModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const mappings = useMappings();
    const updateConfig = useUpdateConfigMutation();

    const [draft, setDraft] = useState<ConfigStore["mappings"]>({ ...mappings });

    const handleOpen = () => {
        setDraft({ ...mappings });
    };

    const handleSave = async () => {
        await updateConfig.mutateAsync({ mappings: draft });
        onClose();
    };

    const openViewer = async () => {
        await window.api.openViewerWindow();
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
                                <Heading size="sm" color="whiteAlpha.600" mb={4} textTransform="uppercase" letterSpacing="wider">
                                    Packet Mappings
                                </Heading>
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
