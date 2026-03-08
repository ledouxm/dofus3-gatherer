import { Box, HStack, Input, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronRight, LuFolderOpen, LuFileJson } from "react-icons/lu";
import type { GuideEntry, GuideProgress } from "./types";

const BORDER = "1px solid rgba(255,255,255,0.08)";
const BG = "rgba(10, 12, 18, 0.92)";

interface Props {
    entries: GuideEntry[];
    progresses: GuideProgress[];
    profileName: string | null;
    onSelectGuide: (entry: GuideEntry) => void;
    onChangeFolder: () => void;
    onLoadConf: () => void;
}

export function GuideList({ entries, progresses, profileName, onSelectGuide, onChangeFolder, onLoadConf }: Props) {
    const [search, setSearch] = useState("");

    const filtered =
        search.trim() === ""
            ? entries
            : entries.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <Box w="100%" h="100%" bg={BG} display="flex" flexDirection="column" overflow="hidden">
            {/* Header */}
            <HStack px={3} py={2} borderBottom={BORDER} flexShrink={0} justify="space-between">
                <HStack gap={2}>
                    <Text fontSize="10px" color="whiteAlpha.500" fontWeight="600" letterSpacing="wider">
                        GUIDES ({entries.length})
                    </Text>
                    {profileName && (
                        <Text fontSize="10px" color="#d4f000" fontWeight="500">
                            · {profileName}
                        </Text>
                    )}
                </HStack>
                <HStack gap={1}>
                    <Box
                        as="button"
                        display="flex"
                        alignItems="center"
                        gap={1}
                        fontSize="11px"
                        color={profileName ? "#d4f000" : "whiteAlpha.500"}
                        bg="transparent"
                        border="none"
                        cursor="pointer"
                        px={2}
                        py={1}
                        borderRadius="md"
                        title="Charger un conf.json Ganymede"
                        _hover={{ color: "whiteAlpha.700", bg: "rgba(255,255,255,0.04)" }}
                        onClick={onLoadConf}
                    >
                        <LuFileJson size={12} />
                        conf.json
                    </Box>
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
                        _hover={{ color: "whiteAlpha.700", bg: "rgba(255,255,255,0.04)" }}
                        onClick={onChangeFolder}
                    >
                        <LuFolderOpen size={12} />
                        Changer
                    </Box>
                </HStack>
            </HStack>

            {/* Search */}
            <Box px={3} py={2} borderBottom={BORDER} flexShrink={0}>
                <Input
                    placeholder="Rechercher un guide..."
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

            {/* Guide list */}
            <Box
                flex={1}
                overflow="auto"
                css={{
                    "&::-webkit-scrollbar": { width: "4px" },
                    "&::-webkit-scrollbar-track": { background: "transparent" },
                    "&::-webkit-scrollbar-thumb": { background: "rgba(255,255,255,0.15)", borderRadius: "4px" },
                }}
            >
                {filtered.length === 0 && (
                    <Box px={4} py={6} textAlign="center">
                        <Text fontSize="sm" color="whiteAlpha.400">
                            {search ? "Aucun guide trouvé" : "Aucun guide dans ce dossier"}
                        </Text>
                    </Box>
                )}

                {filtered.map((entry) => {
                    const progress = progresses.find((p) => p.id === entry.id);
                    const currentStep = progress?.currentStep ?? 0;
                    const pct =
                        entry.stepCount > 0
                            ? Math.round(((currentStep + 1) / entry.stepCount) * 100)
                            : 0;
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
                                <HStack gap={1} flexShrink={0}>
                                    <Text fontSize="10px" color={isDone ? "#d4f000" : "whiteAlpha.500"}>
                                        {currentStep + 1}/{entry.stepCount}
                                    </Text>
                                    <LuChevronRight size={12} color="rgba(255,255,255,0.35)" />
                                </HStack>
                            </HStack>

                            {/* Progress bar */}
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
            </Box>
        </Box>
    );
}
