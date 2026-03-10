import { Box, Button, Flex, Heading, Input, Stack, Switch, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuFolder, LuLeaf, LuUpload } from "react-icons/lu";
import { getBaseUrl, useMappings } from "../providers/ConfigProvider";
import { useHarvestMapper } from "../hooks/useHarvestMapper";
import { configStore } from "../providers/store";

interface LatestMappings {
    timestamp: string;
    mappings: {
        MapCurrentEvent: string;
        "MapCurrentEvent.mapId": string;
    };
}

export const AdminPanel = ({ token }: { token: string }) => {
    const [version, setVersion] = useState("");
    const [mapperEnabled, setMapperEnabled] = useState(false);
    const mappings = useMappings();
    const { sessionCount } = useHarvestMapper(mapperEnabled);

    useEffect(() => {
        window.api.getDofusVersion().then((v) => { if (v) setVersion(v); });
    }, []);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

    const handleUpload = async () => {
        const trimmedVersion = version.trim();
        if (!trimmedVersion) return;

        const cdnBaseUrl = getBaseUrl();
        if (!cdnBaseUrl) {
            setStatus({ ok: false, message: "CDN base URL is not configured." });
            return;
        }

        const { mappings, mappingsTimestamp } = configStore.get();
        const payload: LatestMappings = {
            timestamp: mappingsTimestamp ?? new Date().toISOString(),
            mappings,
        };

        setLoading(true);
        setStatus(null);
        try {
            const res = await fetch(`${cdnBaseUrl}/mappings/${encodeURIComponent(trimmedVersion)}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                setStatus({ ok: true, message: `Uploaded successfully (${res.status}).` });
            } else {
                const text = await res.text().catch(() => res.statusText);
                setStatus({ ok: false, message: `Error ${res.status}: ${text}` });
            }
        } catch (err) {
            setStatus({ ok: false, message: String(err) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Flex flex={1} align="center" justify="center" p={8}>
            <Stack gap={6} w="100%" maxW="480px">
                <Box
                    bg="gray.900"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    borderRadius="lg"
                    p={8}
                    w="100%"
                >
                    <Stack gap={6}>
                        <Heading size="md" color="whiteAlpha.900" display="flex" alignItems="center" gap={2}>
                            <LuUpload />
                            Upload Mappings
                        </Heading>

                        <Stack gap={2}>
                            <Text fontSize="sm" color="whiteAlpha.600">
                                Version
                            </Text>
                            <Input
                                placeholder="e.g. 1.0.5"
                                value={version}
                                onChange={(e) => setVersion(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleUpload()}
                                fontFamily="mono"
                                bg="whiteAlpha.50"
                                border="1px solid"
                                borderColor="whiteAlpha.200"
                                _focus={{ borderColor: "blue.400", bg: "whiteAlpha.100" }}
                            />
                            <Text fontSize="xs" color="whiteAlpha.400">
                                Current mappings from config will be uploaded to{" "}
                                <Text as="span" fontFamily="mono">
                                    {getBaseUrl()}/mappings/{version || "<version>"}
                                </Text>
                            </Text>
                        </Stack>

                        <Button
                            onClick={handleUpload}
                            loading={loading}
                            disabled={!version.trim()}
                            colorPalette="blue"
                            size="sm"
                            alignSelf="flex-start"
                        >
                            Upload to server
                        </Button>

                        {status && (
                            <Text
                                fontSize="sm"
                                color={status.ok ? "green.400" : "red.400"}
                                fontFamily="mono"
                            >
                                {status.message}
                            </Text>
                        )}
                    </Stack>
                </Box>

                <Box
                    bg="gray.900"
                    border="1px solid"
                    borderColor="whiteAlpha.200"
                    borderRadius="lg"
                    p={8}
                    w="100%"
                >
                    <Stack gap={4}>
                        <Flex align="center" justify="space-between">
                            <Heading size="md" color="whiteAlpha.900" display="flex" alignItems="center" gap={2}>
                                <LuLeaf />
                                Harvest Mapper
                            </Heading>
                            <Button
                                size="xs"
                                variant="ghost"
                                color="whiteAlpha.500"
                                onClick={() => window.api.openUserDataFolder()}
                                gap={1}
                            >
                                <LuFolder size={12} />
                                Open folder
                            </Button>
                        </Flex>

                        <Text fontSize="sm" color="whiteAlpha.600">
                            Automatically records <Text as="span" fontFamily="mono">elementId → resourceId</Text> by
                            correlating <Text as="span" fontFamily="mono">InteractiveUsedEvent</Text> with the next{" "}
                            <Text as="span" fontFamily="mono">ObjetHarvestedEvent</Text> within 5 seconds.
                            Saved to <Text as="span" fontFamily="mono">element-resource-mappings.json</Text>.
                        </Text>

                        <Flex align="center" gap={3}>
                            <Switch.Root
                                checked={mapperEnabled}
                                onCheckedChange={(e) => setMapperEnabled(e.checked)}
                                colorPalette="yellow"
                            >
                                <Switch.HiddenInput />
                                <Switch.Control />
                                <Switch.Label fontSize="sm" color="whiteAlpha.800">
                                    {mapperEnabled ? "Active" : "Inactive"}
                                </Switch.Label>
                            </Switch.Root>
                        </Flex>

                        {!mappings.ObjetHarvestedEvent && (
                            <Text fontSize="sm" color="orange.400">
                                ObjetHarvestedEvent is not configured — use the Mapping Assistant to set it up.
                            </Text>
                        )}

                        {sessionCount > 0 && (
                            <Text fontSize="sm" color="green.400" fontFamily="mono">
                                {sessionCount} {sessionCount === 1 ? "entry" : "entries"} saved this session.
                            </Text>
                        )}
                    </Stack>
                </Box>
            </Stack>
        </Flex>
    );
};
