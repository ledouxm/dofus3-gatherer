import { Cap } from "cap";
import { EventEmitter } from "stream";
import { ipcMain } from "electron";

export const makeSniffer = ({
    onClientPacket,
    onServerPacket,
    onServerReset,
}: {
    onClientPacket?: (data: string) => void;
    onServerPacket?: (data: string) => void;
    onServerReset?: () => void;
}) => {
    const serverC = new Cap();
    const clientC = new Cap();

    const devices = Cap.deviceList();
    const localDevice = devices.find((d) =>
        d.addresses.some((a) => a.addr.startsWith("192.168.1.")),
    );
    if (!localDevice) {
        console.error("No suitable network device found");
        return;
    }

    const device = localDevice.name,
        decoders = require("cap").decoders,
        PROTOCOL = decoders.PROTOCOL;

    const serverFilter = "tcp and src port 5555";
    const clientFilter = "tcp and dst port 5555";

    const bufSize = 10 * 1024 * 1024;
    const serverBuffer = Buffer.alloc(65535);
    const clientBuffer = Buffer.alloc(65535);

    const serverLinkType = serverC.open(device, serverFilter, bufSize, serverBuffer);
    const clientLinkType = clientC.open(device, clientFilter, bufSize, clientBuffer);

    serverC.setMinBytes && serverC.setMinBytes(0);
    clientC.setMinBytes && clientC.setMinBytes(0);

    let serverNextSeqno: number | null = null;

    serverC.on("packet", () => {
        const result = getTcpPayload({
            linkType: serverLinkType,
            decoders,
            buffer: serverBuffer,
            PROTOCOL,
        });
        if (!result) return;

        const { str, seqno, datalen, flags } = result;

        if (flags.syn || flags.rst) {
            serverNextSeqno = null;
            onServerReset && onServerReset();
            return;
        }

        if (!str.length) return;

        let payloadStr = str;
        const seqnoEnd = (seqno + datalen) >>> 0;

        if (serverNextSeqno !== null) {
            const seqDelta = (seqno - serverNextSeqno) >>> 0;
            if (seqDelta > 0x80000000) {
                // seqno < serverNextSeqno: retransmission or partial overlap
                const skipBytes = (serverNextSeqno - seqno) >>> 0;
                if (skipBytes >= datalen) return; // pure retransmission, no new data
                // Partial overlap: trim already-seen bytes from the hex string
                payloadStr = str.slice(skipBytes * 2); // hex: 2 chars per byte
            }
            // seqDelta === 0: normal in-order packet
            // 0 < seqDelta < 0x80000000: gap/out-of-order, accept as-is
        }
        serverNextSeqno = seqnoEnd;

        onServerPacket && onServerPacket(payloadStr);
    });

    clientC.on("packet", () => {
        const str = getTcpPayload({
            linkType: clientLinkType,
            decoders,
            buffer: clientBuffer,
            PROTOCOL,
        })?.str;
        if (!str?.length) return;

        onClientPacket && onClientPacket(str);
    });
};

const getTcpPayload = ({
    linkType,
    decoders,
    buffer,
    PROTOCOL,
}: any):
    | { str: string; seqno: number; datalen: number; flags: Record<string, boolean> }
    | undefined => {
    if (linkType === "ETHERNET") {
        var ret = decoders.Ethernet(buffer);

        if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
            ret = decoders.IPV4(buffer, ret.offset);

            if (ret.info.protocol === PROTOCOL.IP.TCP) {
                var datalen = ret.info.totallen - ret.hdrlen;

                ret = decoders.TCP(buffer, ret.offset);
                datalen -= ret.hdrlen;

                const str = buffer.toString("hex", ret.offset, datalen + ret.offset);

                return { str, seqno: ret.info.seqno, datalen, flags: ret.info.flags ?? {} };
            } else if (ret.info.protocol === PROTOCOL.IP.UDP) {
                ret = decoders.UDP(buffer, ret.offset);
            } else console.log("Unsupported IPv4 protocol: " + PROTOCOL.IP[ret.info.protocol]);
        } else console.log("Unsupported Ethertype: " + PROTOCOL.ETHERNET[ret.info.type]);
    }
    return undefined;
};
