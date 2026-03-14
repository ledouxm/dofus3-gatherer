import { Box, Text } from "@chakra-ui/react";
import parse, { type DOMNode, domToReact } from "html-react-parser";
import type { Element } from "html-react-parser";
import { useMemo } from "react";
import { LuBookOpen, LuCheck } from "react-icons/lu";
import { resolveTravelHandle } from "../../resolveTravelHandle";
import { useClipboardToast } from "../useClipboardToast";
import { trpcClient } from "../../trpc";

const COORD_RE = /\[(-?\d+),\s*(-?\d+)\]/g;

function InlineCoordButton({ x, y, onCopy }: { x: number; y: number; onCopy: (text: string, label: string) => void }) {
    const travel = async () => {
        onCopy(`/travel ${x} ${y}`, `[${x},${y}]`);
        const handle = await resolveTravelHandle();
        if (handle) trpcClient.windows.focusWindowAndSend.mutate({ title: handle, action: "travel" });
    };
    return (
        <Box
            as="button"
            display="inline"
            bg="rgba(212,240,0,0.08)"
            border="1px solid rgba(212,240,0,0.25)"
            borderRadius="sm"
            px="4px"
            py="1px"
            fontSize="xs"
            fontWeight="bold"
            color="#d4f000"
            cursor="pointer"
            mx="2px"
            _hover={{ bg: "rgba(212,240,0,0.18)" }}
            onClick={() => onCopy(`/travel ${x} ${y}`, `[${x},${y}]`)}
            onDoubleClick={travel}
        >
            [{x},{y}]
        </Box>
    );
}

function GuideStepLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <Box
            as="button"
            display="inline-flex"
            alignItems="center"
            gap="3px"
            bg="rgba(170,71,188,0.10)"
            border="1px solid rgba(170,71,188,0.30)"
            borderRadius="sm"
            px="5px"
            py="1px"
            fontSize="xs"
            fontWeight="bold"
            color="rgba(210,130,230,0.95)"
            cursor="pointer"
            mx="2px"
            _hover={{ bg: "rgba(170,71,188,0.20)", color: "rgb(230,160,245)" }}
            onClick={onClick}
        >
            <LuBookOpen size={11} />
            {label}
        </Box>
    );
}

function CopyTag({ name, onCopy }: { name: string; onCopy: (text: string, label: string) => void }) {
    return (
        <Box
            as="button"
            display="inline-flex"
            alignItems="center"
            bg="rgba(255,255,255,0.06)"
            border="1px solid rgba(255,255,255,0.12)"
            borderRadius="sm"
            px="6px"
            py="2px"
            fontSize="xs"
            color="whiteAlpha.700"
            cursor="pointer"
            mx="1px"
            _hover={{ bg: "rgba(255,255,255,0.1)", color: "white" }}
            onClick={() => onCopy(name, name)}
        >
            {name}
        </Box>
    );
}

interface Props {
    html: string;
    checkedBoxes: number[];
    onCheckboxToggle: (index: number) => void;
    onNavigateToGuide?: (guideId: number, stepIndex: number) => void;
    knownQuestIds?: Set<number>;
}

export function GuideHtmlContent({ html, checkedBoxes, onCheckboxToggle, onNavigateToGuide, knownQuestIds }: Props) {
    const copy = useClipboardToast();

    const options = useMemo(() => {
        let checkboxCount = 0;

        const opts: Parameters<typeof parse>[1] = {
            replace(domNode: DOMNode) {
                // Text nodes — detect [x,y] coordinate patterns
                if (domNode.type === "text") {
                    const text = (domNode as unknown as { data: string }).data;
                    COORD_RE.lastIndex = 0;
                    if (!COORD_RE.test(text)) return;
                    COORD_RE.lastIndex = 0;

                    const parts: React.ReactNode[] = [];
                    let lastIndex = 0;
                    let match: RegExpExecArray | null;
                    while ((match = COORD_RE.exec(text)) !== null) {
                        if (match.index > lastIndex) {
                            parts.push(text.slice(lastIndex, match.index));
                        }
                        const x = parseInt(match[1], 10);
                        const y = parseInt(match[2], 10);
                        parts.push(<InlineCoordButton key={`${x},${y},${match.index}`} x={x} y={y} onCopy={copy} />);
                        lastIndex = match.index + match[0].length;
                    }
                    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
                    return <>{parts}</>;
                }

                if (domNode.type !== "tag") return;
                const el = domNode as Element;

                // Empty <p> deduplication — multiple consecutive empties → single <br>
                if (el.name === "p" && el.children.length === 0) {
                    const countNext = (node: DOMNode | null): number => {
                        if (!node) return 0;
                        const n = node as Element;
                        if (n.type === "tag" && n.name === "p" && n.children.length === 0) {
                            return 1 + countNext((n as any).next as DOMNode | null);
                        }
                        return 0;
                    };
                    if (countNext(domNode) > 1) return <></>;
                    return <br />;
                }

                // <input type="checkbox"> — controlled
                if (el.name === "input" && el.attribs?.type === "checkbox") {
                    const idx = checkboxCount++;
                    return (
                        <input
                            type="checkbox"
                            checked={checkedBoxes.includes(idx)}
                            onChange={() => onCheckboxToggle(idx)}
                            style={{ cursor: "pointer", accentColor: "#d4f000", marginRight: "6px" }}
                        />
                    );
                }

                // <a> — open in browser
                if (el.name === "a") {
                    const href = el.attribs?.href ?? "";
                    const isExternal = href.startsWith("http");
                    return (
                        <Box
                            as="span"
                            color="#d4f000"
                            textDecoration="underline"
                            cursor={isExternal ? "pointer" : "default"}
                            onClick={() => {
                                if (isExternal) trpcClient.app.openExternal.mutate({ url: href });
                            }}
                        >
                            {domToReact(el.children as DOMNode[], opts)}
                        </Box>
                    );
                }

                // <img> — render, click to open external
                if (el.name === "img") {
                    const src = el.attribs?.src ?? "";
                    if (src.includes("ganymede-dofus.com/images/texteditor/guides.png")) return <></>;

                    const isExternal = src.startsWith("http");
                    return (
                        <Box
                            as="img"
                            src={src}
                            maxW="100%"
                            borderRadius="md"
                            my={2}
                            display="block"
                            cursor={isExternal ? "pointer" : "default"}
                            onClick={() => isExternal && trpcClient.app.openExternal.mutate({ url: src })}
                        />
                    );
                }

                // data-type="guide-step" — navigate to another guide at a specific step
                if (el.attribs?.["data-type"] === "guide-step") {
                    const guideId = parseInt(el.attribs["guideid"] ?? "0", 10);
                    const stepNumber = parseInt(el.attribs["stepnumber"] ?? "1", 10);
                    const stepId = parseInt(el.attribs["stepid"] ?? "0", 10);
                    const label = el.attribs["label"] || el.attribs["guidename"] || "Guide";
                    // stepId === 0 means "go to user's current step" → sentinel -1
                    const stepIndex = stepId === 0 ? -1 : stepNumber - 1;
                    const childContent = domToReact(el.children as DOMNode[], opts);
                    return (
                        <Box as="span" key={`guide-step-${guideId}-${stepNumber}`}>
                            {childContent}
                            <GuideStepLink
                                label={label}
                                onClick={() => onNavigateToGuide?.(guideId, stepIndex)}
                            />
                        </Box>
                    );
                }

                // data-type="custom-tag" — copy name on click
                if (el.attribs?.["data-type"] === "custom-tag") {
                    const name = el.attribs?.["name"] ?? "";
                    return <CopyTag name={name} onCopy={copy} />;
                }

                // data-type="quest-block" — colored block
                if (el.attribs?.["data-type"] === "quest-block") {
                    const status = el.attribs?.["status"] ?? "";
                    const questName = el.attribs?.["questname"] ?? "";
                    const questId = parseInt(el.attribs?.["questid"] ?? "0", 10);
                    const isKnown = questId > 0 && knownQuestIds?.has(questId);
                    const borderColor =
                        status === "start"
                            ? "rgba(239,68,68,0.6)"
                            : status === "end"
                              ? "rgba(34,197,94,0.6)"
                              : status === "setup"
                                ? "rgba(249,115,22,0.6)"
                                : "rgba(255,255,255,0.2)";
                    return (
                        <Box
                            px={3}
                            py={2}
                            my={2}
                            borderRadius="md"
                            bg="rgba(255,255,255,0.04)"
                            borderLeft={`3px solid ${borderColor}`}
                        >
                            {domToReact(el.children as DOMNode[], opts)}
                            {questName && (
                                <Box display="inline-flex" alignItems="center" gap="4px" mt={1}>
                                    {isKnown && <LuCheck size={11} color="rgba(255,255,255,0.35)" />}
                                    <Text fontSize="xs" color="whiteAlpha.500" fontStyle="italic">
                                        {questName}
                                    </Text>
                                </Box>
                            )}
                        </Box>
                    );
                }
            },
        };
        return opts;
    }, [checkedBoxes, onCheckboxToggle, copy, onNavigateToGuide, knownQuestIds]);

    return (
        <Box
            fontSize="sm"
            color="whiteAlpha.800"
            lineHeight="1.7"
            css={{
                "& p": { marginBottom: "0.6em" },
                "& ul, & ol": { padding: "0 1rem", margin: "0.5rem 0.5rem 0.5rem 0.4rem" },
                "& ul li p, & ol li p": { marginTop: "0.25em", marginBottom: "0.25em" },
                "& li": { marginBottom: "0.2em" },
                "& strong, & b": { color: "white", fontWeight: 600 },
                "& h2, & h3, & h4": { color: "rgba(255,255,255,0.9)", fontWeight: 700, marginBottom: "0.5em", marginTop: "0.75em" },
                "& table": { borderCollapse: "collapse", width: "100%", marginBottom: "0.6em" },
                "& th, & td": { border: "1px solid rgba(255,255,255,0.1)", padding: "4px 8px" },
                // Task list (TipTap / ganymede structure)
                "& ul[data-type='taskList']": { listStyle: "none", marginLeft: 0, padding: 0 },
                "& ul[data-type='taskList'] li": { display: "flex", alignItems: "flex-start" },
                "& ul[data-type='taskList'] li > label": { flex: "0 0 auto", marginRight: "0.5rem", userSelect: "none", marginTop: "3px" },
                "& ul[data-type='taskList'] li > div": { flex: "1 1 auto" },
                "& ul[data-type='taskList'] ul[data-type='taskList']": { margin: 0 },
            }}
        >
            {parse(html, options)}
        </Box>
    );
}
