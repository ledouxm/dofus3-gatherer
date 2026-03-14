import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { packetEmitter } from "../packetEmitter";

export type PacketPayload = { typeName: string; data: unknown };

export const packetsRouter = router({
    onPacketBroadcast: publicProcedure.subscription(() =>
        observable<PacketPayload>((emit) => {
            const handler = (payload: PacketPayload) => emit.next(payload);
            packetEmitter.on("packet", handler);
            return () => packetEmitter.off("packet", handler);
        }),
    ),

    onPacket: publicProcedure.input(z.object({ typeName: z.string() })).subscription(({ input }) =>
        observable<PacketPayload>((emit) => {
            const handler = (payload: PacketPayload) => emit.next(payload);
            packetEmitter.on("packet/" + input.typeName, handler);
            return () => packetEmitter.off("packet/" + input.typeName, handler);
        }),
    ),
});
