import { Box, Button, Flex, Heading, Input, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuUpload } from "react-icons/lu";
import { getBaseUrl } from "../providers/ConfigProvider";
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
            </Stack>
        </Flex>
    );
};
