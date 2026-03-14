import { Box, HStack, Input, Spinner, Text } from "@chakra-ui/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc";
import { useCallback, useState } from "react";
import { LuChevronRight, LuDownload, LuFolderOpen, LuRefreshCw } from "react-icons/lu";
import type { GuideEntry, GuideProgress } from "./types";

const BORDER = "1px solid rgba(255,255,255,0.08)";
const BG = "rgba(10, 12, 18, 0.92)";

const DOWNLOAD_STATUSES = [
    { key: "gp", label: "GP" },
    { key: "certified", label: "Certifiés" },
    { key: "public", label: "Publics" },
] as const;

type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number]["key"];

interface ServerGuide {
    id: number;
    name: string;
    node_image?: string | null;
    description?: string | null;
}

interface Props {
    entries: GuideEntry[];
    progresses: GuideProgress[];
    profileName: string | null;
    folderPath: string | null;
    onSelectGuide: (entry: GuideEntry) => void;
    onChangeFolder: () => void;
    onEntriesChange: () => Promise<void>;
}

function GuideNodeImage({ src }: { src: string | null | undefined }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) return null;
    return (
        <Box
            as="img"
            src={src}
            w="22px"
            h="22px"
            borderRadius="sm"
            flexShrink={0}
            objectFit="cover"
            onError={() => setFailed(true)}
        />
    );
}

export function GuideList({ entries, progresses, profileName, folderPath, onSelectGuide, onChangeFolder, onEntriesChange }: Props) {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<"local" | "download">("local");
    const [search, setSearch] = useState("");
    const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("gp");
    const [downloaded, setDownloaded] = useState<Set<number>>(new Set());

    const serverGuidesQuery = useQuery<ServerGuide[], Error>({
        queryKey: ["ganymede-guides", downloadStatus],
        queryFn: async () => {
            const result = await trpcClient.guides.fetchFromServer.query({ status: downloadStatus });
            if (!Array.isArray(result)) throw new Error("Réponse inattendue du serveur");
            return result;
        },
        enabled: tab === "download",
        staleTime: 1000 * 60,
        retry: 1,
    });

    const downloadMutation = useMutation({
        mutationFn: async (guide: ServerGuide) => {
            if (!folderPath) throw new Error("Aucun dossier sélectionné");
            const guidesDir = folderPath.replace(/[\\/]$/, "") + "/guides";
            await trpcClient.guides.downloadFromServer.mutate({ guideId: guide.id, folderPath: guidesDir });
            return guide.id;
        },
        onSuccess: async (guideId) => {
            setDownloaded((prev) => new Set(prev).add(guideId));
            await onEntriesChange();
        },
    });

    const localIds = new Set(entries.map((e) => e.id));

    const filteredLocal =
        search.trim() === ""
            ? entries
            : entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

    const filteredServer =
        search.trim() === ""
            ? (serverGuidesQuery.data ?? [])
            : (serverGuidesQuery.data ?? []).filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <Box w="100%" h="100%" bg={BG} display="flex" flexDirection="column" overflow="hidden">
            {/* Header */}
            <HStack px={3} py={2} borderBottom={BORDER} flexShrink={0} justify="space-between">
                <HStack gap={2}>
                    <Text fontSize="10px" color="whiteAlpha.500" fontWeight="600" letterSpacing="wider">
                        GUIDES {tab === "local" ? `(${entries.length})` : ""}
                    </Text>
                    {profileName && tab === "local" && (
                        <Text fontSize="10px" color="#d4f000" fontWeight="500">
                            · {profileName}
                        </Text>
                    )}
                </HStack>
                <HStack gap={1}>
                    {tab === "local" && (
                        <>
                            <Box
                                as="button"
                                display="flex"
                                alignItems="center"
                                gap={1}
                                fontSize="11px"
                                color="whiteAlpha.500"
                                bg="transparent"
                                border="none"
                                cursor="pointer"
                                px={2}
                                py={1}
                                borderRadius="md"
                                title="Changer le dossier Ganymede"
                                _hover={{ color: "whiteAlpha.700", bg: "rgba(255,255,255,0.04)" }}
                                onClick={onChangeFolder}
                            >
                                <LuFolderOpen size={12} />
                                Changer
                            </Box>
                        </>
                    )}
                    {tab === "download" && (
                        <Box
                            as="button"
                            display="flex"
                            alignItems="center"
                            gap={1}
                            fontSize="11px"
                            color="whiteAlpha.500"
                            bg="transparent"
                            border="none"
                            cursor="pointer"
                            px={2}
                            py={1}
                            borderRadius="md"
                            title="Rafraîchir"
                            _hover={{ color: "whiteAlpha.700", bg: "rgba(255,255,255,0.04)" }}
                            onClick={() => queryClient.invalidateQueries({ queryKey: ["ganymede-guides", downloadStatus] })}
                        >
                            <LuRefreshCw size={12} />
                        </Box>
                    )}
                </HStack>
            </HStack>

            {/* Tabs */}
            <HStack px={3} pt={2} pb={0} gap={0} flexShrink={0}>
                {(["local", "download"] as const).map((t) => (
                    <Box
                        key={t}
                        as="button"
                        display="flex"
                        alignItems="center"
                        gap={1}
                        px={3}
                        py={1}
                        fontSize="11px"
                        fontWeight="600"
                        borderBottomWidth="2px"
                        borderBottomStyle="solid"
                        borderBottomColor={tab === t ? "#d4f000" : "transparent"}
                        color={tab === t ? "#d4f000" : "whiteAlpha.500"}
                        bg="transparent"
                        border="none"
                        cursor="pointer"
                        letterSpacing="wider"
                        _hover={{ color: tab === t ? "#d4f000" : "whiteAlpha.700" }}
                        onClick={() => { setTab(t); setSearch(""); }}
                    >
                        {t === "download" && <LuDownload size={11} />}
                        {t === "local" ? "MES GUIDES" : "TÉLÉCHARGER"}
                    </Box>
                ))}
            </HStack>

            {/* Search */}
            <Box px={3} py={2} borderBottom={BORDER} flexShrink={0}>
                <Input
                    placeholder={tab === "local" ? "Rechercher un guide..." : "Rechercher sur Ganymede..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    size="sm"
                    bg="rgba(255,255,255,0.04)"
                    border="1px solid rgba(255,255,255,0.1)"
                    color="whiteAlpha.800"
                    _placeholder={{ color: "whiteAlpha.400" }}
                    _focus={{ borderColor: "rgba(212,240,0,0.4)", boxShadow: "none" }}
                    borderRadius="md"
                />
            </Box>

            {/* Download status pills */}
            {tab === "download" && (
                <HStack px={3} py={2} gap={1} flexShrink={0} borderBottom={BORDER}>
                    {DOWNLOAD_STATUSES.map(({ key, label }) => (
                        <Box
                            key={key}
                            as="button"
                            px={3}
                            py={1}
                            fontSize="10px"
                            fontWeight="700"
                            letterSpacing="wider"
                            borderRadius="full"
                            border={downloadStatus === key ? "1px solid rgba(212,240,0,0.5)" : "1px solid rgba(255,255,255,0.1)"}
                            color={downloadStatus === key ? "#d4f000" : "whiteAlpha.500"}
                            bg={downloadStatus === key ? "rgba(212,240,0,0.06)" : "transparent"}
                            cursor="pointer"
                            _hover={{ color: downloadStatus === key ? "#d4f000" : "whiteAlpha.700" }}
                            onClick={() => setDownloadStatus(key)}
                        >
                            {label}
                        </Box>
                    ))}
                </HStack>
            )}

            {/* Scrollable list */}
            <Box
                flex={1}
                overflow="auto"
                css={{
                    "&::-webkit-scrollbar": { width: "4px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "4px" },
                }}
            >
                {/* Local tab */}
                {tab === "local" && (
                    <>
                        {filteredLocal.length === 0 && (
                            <Box px={4} py={6} textAlign="center">
                                <Text fontSize="sm" color="whiteAlpha.400">
                                    {search ? "Aucun guide trouvé" : "Aucun guide dans ce dossier"}
                                </Text>
                            </Box>
                        )}
                        {filteredLocal.map((entry) => {
                            const progress = progresses.find((p) => p.id === entry.id);
                            const currentStep = progress?.currentStep ?? 0;
                            const pct = entry.stepCount > 0 ? Math.round(((currentStep + 1) / entry.stepCount) * 100) : 0;
                            const isDone = currentStep >= entry.stepCount - 1 && entry.stepCount > 0;

                            return (
                                <Box
                                    key={entry.filePath}
                                    as="button"
                                    textAlign="left"
                                    w="100%"
                                    px={4}
                                    py={3}
                                    borderBottom={BORDER}
                                    bg="transparent"
                                    cursor="pointer"
                                    _hover={{ bg: "rgba(255,255,255,0.04)" }}
                                    onClick={() => onSelectGuide(entry)}
                                >
                                    <HStack justify="space-between" mb={1}>
                                        <HStack gap={2} flex={1} minW={0}>
                                            <GuideNodeImage src={entry.node_image} />
                                            <Text
                                                fontSize="sm"
                                                color="whiteAlpha.900"
                                                fontWeight="500"
                                                flex={1}
                                                textAlign="left"
                                                lineClamp={2}
                                            >
                                                {entry.name}
                                            </Text>
                                        </HStack>
                                        <HStack gap={1} flexShrink={0}>
                                            <Text fontSize="10px" color={isDone ? "#d4f000" : "whiteAlpha.500"}>
                                                {currentStep + 1}/{entry.stepCount}
                                            </Text>
                                            <LuChevronRight size={12} color="rgba(255,255,255,0.35)" />
                                        </HStack>
                                    </HStack>
                                    <Box h="2px" bg="rgba(255,255,255,0.07)" borderRadius="full">
                                        <Box
                                            h="2px"
                                            w={`${pct}%`}
                                            bg={isDone ? "#d4f000" : "rgba(212,240,0,0.6)"}
                                            borderRadius="full"
                                            transition="width 0.2s"
                                        />
                                    </Box>
                                </Box>
                            );
                        })}
                    </>
                )}

                {/* Download tab */}
                {tab === "download" && (
                    <>
                        {serverGuidesQuery.isLoading && (
                            <Box px={4} py={6} display="flex" justifyContent="center">
                                <Spinner size="sm" color="whiteAlpha.400" />
                            </Box>
                        )}
                        {serverGuidesQuery.isError && (
                            <Box px={4} py={4} textAlign="center">
                                <Text fontSize="xs" color="red.400" mb={1}>
                                    Erreur de chargement
                                </Text>
                                <Text fontSize="10px" color="whiteAlpha.400" fontFamily="mono">
                                    {serverGuidesQuery.error.message}
                                </Text>
                            </Box>
                        )}
                        {serverGuidesQuery.isSuccess && filteredServer.length === 0 && (
                            <Box px={4} py={6} textAlign="center">
                                <Text fontSize="sm" color="whiteAlpha.400">
                                    {search ? "Aucun guide trouvé" : "Aucun guide disponible"}
                                </Text>
                            </Box>
                        )}
                        {!folderPath && serverGuidesQuery.isSuccess && (
                            <Box px={4} py={3} textAlign="center">
                                <Text fontSize="xs" color="whiteAlpha.400">
                                    Sélectionnez d'abord un dossier de guides
                                </Text>
                            </Box>
                        )}
                        {serverGuidesQuery.isSuccess &&
                            filteredServer.map((guide) => {
                                const isLocal = localIds.has(guide.id);
                                const isDownloading = downloadMutation.isPending && downloadMutation.variables?.id === guide.id;
                                const isJustDownloaded = downloaded.has(guide.id);
                                const canDownload = !!folderPath && !isDownloading;

                                return (
                                    <Box
                                        key={guide.id}
                                        w="100%"
                                        px={4}
                                        py={3}
                                        borderBottom={BORDER}
                                        display="flex"
                                        alignItems="center"
                                        gap={2}
                                    >
                                        <GuideNodeImage src={guide.node_image} />
                                        <Text
                                            fontSize="sm"
                                            color="whiteAlpha.900"
                                            fontWeight="500"
                                            flex={1}
                                            textAlign="left"
                                            lineClamp={2}
                                        >
                                            {guide.name}
                                        </Text>
                                        <Box
                                            as="button"
                                            display="flex"
                                            alignItems="center"
                                            gap={1}
                                            px={2}
                                            py={1}
                                            fontSize="10px"
                                            fontWeight="600"
                                            letterSpacing="wider"
                                            borderRadius="md"
                                            flexShrink={0}
                                            border={isJustDownloaded ? "1px solid rgba(212,240,0,0.4)" : "1px solid rgba(255,255,255,0.12)"}
                                            color={isJustDownloaded ? "#d4f000" : isLocal ? "whiteAlpha.600" : "whiteAlpha.700"}
                                            bg="transparent"
                                            cursor={canDownload ? "pointer" : "not-allowed"}
                                            opacity={canDownload ? 1 : 0.5}
                                            _hover={canDownload ? { bg: "rgba(255,255,255,0.06)" } : {}}
                                            onClick={() => canDownload && downloadMutation.mutate(guide)}
                                            title={!folderPath ? "Sélectionnez un dossier de guides d'abord" : undefined}
                                        >
                                            {isDownloading ? (
                                                <Spinner size="xs" />
                                            ) : isJustDownloaded ? (
                                                "✓"
                                            ) : (
                                                <>
                                                    <LuDownload size={10} />
                                                    {isLocal ? "MÀJ" : "DL"}
                                                </>
                                            )}
                                        </Box>
                                    </Box>
                                );
                            })}
                    </>
                )}
            </Box>
        </Box>
    );
}
