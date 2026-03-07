import { Box, IconButton, type IconButtonProps } from "@chakra-ui/react";

interface OverlayIconButtonProps extends Omit<IconButtonProps, "aria-label"> {
    "aria-label": string;
    bottom?: string;
    left?: string;
    right?: string;
    top?: string;
    isActive?: boolean;
    activeColor?: string;
}

/**
 * Reusable absolutely-positioned icon button for map overlays.
 * All map corner buttons share the same dark glass styling — use this
 * component to avoid duplicating those styles.
 *
 * @example
 * <OverlayIconButton aria-label="Settings" bottom="96px" left="8px" onClick={open}>
 *   <LuSettings />
 * </OverlayIconButton>
 */
export const OverlayIconButton = ({
    bottom,
    left,
    right,
    top,
    isActive,
    activeColor = "blue.400",
    children,
    ...props
}: OverlayIconButtonProps) => {
    return (
        <Box position="absolute" bottom={bottom} left={left} right={right} top={top} zIndex={1000}>
            <IconButton
                size="sm"
                variant="solid"
                borderRadius="md"
                bg="rgba(10, 12, 18, 0.85)"
                _hover={{ bg: "rgba(30, 35, 50, 0.95)" }}
                border="1px solid rgba(255,255,255,0.1)"
                h="36px"
                w="36px"
                minW="36px"
                color={isActive ? activeColor : "whiteAlpha.700"}
                _active={{ color: "white" }}
                {...props}
            >
                {children}
            </IconButton>
        </Box>
    );
};
