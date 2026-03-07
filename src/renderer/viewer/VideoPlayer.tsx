import { Box, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";

interface VideoPlayerProps {
    videoBuffer: ArrayBuffer | null;
    onTimeUpdate: (currentMs: number) => void;
}

/**
 * Video player fed from an ArrayBuffer (recorded screen capture).
 * Calls `onTimeUpdate` on every timeupdate event so the PacketTimeline
 * can highlight packets near the current playback position.
 */
export const VideoPlayer = ({ videoBuffer, onTimeUpdate }: VideoPlayerProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const urlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!videoBuffer) return;
        const blob = new Blob([videoBuffer], { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (videoRef.current) {
            videoRef.current.src = url;
        }
        return () => {
            URL.revokeObjectURL(url);
            urlRef.current = null;
        };
    }, [videoBuffer]);

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            onTimeUpdate(videoRef.current.currentTime * 1000);
        }
    };

    if (!videoBuffer) {
        return (
            <Box
                flex={1}
                display="flex"
                alignItems="center"
                justifyContent="center"
                bg="blackAlpha.400"
                borderRadius="md"
                border="1px dashed"
                borderColor="whiteAlpha.200"
                minH="300px"
            >
                <Text color="whiteAlpha.400" fontSize="sm">
                    No recording yet
                </Text>
            </Box>
        );
    }

    return (
        <Box flex={1} borderRadius="md" overflow="hidden" bg="black" minH="300px">
            <video
                ref={videoRef}
                controls
                style={{ width: "100%", height: "100%", display: "block" }}
                onTimeUpdate={handleTimeUpdate}
            />
        </Box>
    );
};
