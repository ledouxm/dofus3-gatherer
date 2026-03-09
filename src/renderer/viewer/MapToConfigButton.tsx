import { Badge, Box, Button, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { useRef, useState } from "react";
import { LuLink } from "react-icons/lu";
import {
    useMappings,
    useUpdateConfigMutation,
} from "../providers/ConfigProvider";

interface MapToConfigButtonProps {
    value: string;
}

export const MapToConfigButton = ({ value }: MapToConfigButtonProps) => {
    const mappings = useMappings();
    const updateConfig = useUpdateConfigMutation();
    const [open, setOpen] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string>("__new__");
    const [newKeyName, setNewKeyName] = useState("");
    const [saved, setSaved] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const existingKeys = Object.keys(mappings ?? {});

    const handleOpen = () => {
        setSelectedKey(existingKeys[0] ?? "__new__");
        setNewKeyName("");
        setSaved(false);
        setOpen(true);
    };

    const handleSave = async () => {
        const key = selectedKey === "__new__" ? newKeyName.trim() : selectedKey;
        if (!key) return;
        await updateConfig.mutateAsync({ mappings: { ...(mappings ?? {}), [key]: value } });
        setSaved(true);
        setTimeout(() => setOpen(false), 600);
    };

    if (!open) {
        return (
            <IconButton
                ref={triggerRef}
                aria-label="Link to config mapping"
                size="xs"
                variant="ghost"
                color="whiteAlpha.400"
                _hover={{ color: "#d4f000", bg: "whiteAlpha.100" }}
                h="18px"
                w="18px"
                minW="18px"
                flexShrink={0}
                onClick={handleOpen}
            >
                <LuLink size={10} />
            </IconButton>
        );
    }

    return (
        <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            zIndex={1000}
            onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
        >
            <Box
                position="absolute"
                bg="gray.800"
                border="1px solid"
                borderColor="whiteAlpha.200"
                borderRadius="md"
                p={3}
                boxShadow="dark-lg"
                minW="220px"
                zIndex={1001}
                style={{
                    top: (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: Math.min(
                        triggerRef.current?.getBoundingClientRect().left ?? 0,
                        window.innerWidth - 240,
                    ),
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <Text fontSize="10px" color="whiteAlpha.600" mb={2}>
                    Link to config mapping
                </Text>

                {/* Value preview */}
                <Badge
                    fontFamily="mono"
                    fontSize="10px"
                    colorScheme="green"
                    mb={3}
                    maxW="100%"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                    display="block"
                >
                    {value}
                </Badge>

                {/* Key selector */}
                <Text fontSize="10px" color="whiteAlpha.500" mb={1}>
                    Mapping key
                </Text>
                <select
                    value={selectedKey}
                    onChange={(e) => setSelectedKey(e.target.value)}
                    style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.05)",
                        color: "white",
                        border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: "6px",
                        padding: "4px 8px",
                        fontSize: "12px",
                        outline: "none",
                        marginBottom: "8px",
                    }}
                >
                    {existingKeys.map((k) => (
                        <option key={k} value={k} style={{ background: "#1a1a2e" }}>
                            {k}
                        </option>
                    ))}
                    <option value="__new__" style={{ background: "#1a1a2e" }}>
                        — New key...
                    </option>
                </select>

                {/* New key name input */}
                {selectedKey === "__new__" && (
                    <Input
                        size="xs"
                        placeholder="Key name (e.g. MyPacketMessage)"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        bg="whiteAlpha.50"
                        border="1px solid"
                        borderColor="whiteAlpha.200"
                        fontFamily="mono"
                        fontSize="xs"
                        mb={2}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave();
                            if (e.key === "Escape") setOpen(false);
                        }}
                    />
                )}

                <Flex gap={2} justify="flex-end" mt={1}>
                    <Button size="xs" variant="ghost" color="whiteAlpha.500" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="xs"
                        bg={saved ? "green.700" : "#d4f000"}
                        color="black"
                        _hover={{ bg: saved ? "green.600" : "#bfdb00" }}
                        onClick={handleSave}
                        disabled={selectedKey === "__new__" && !newKeyName.trim()}
                        loading={updateConfig.isPending}
                    >
                        {saved ? "Saved!" : "Save"}
                    </Button>
                </Flex>
            </Box>
        </Box>
    );
};
