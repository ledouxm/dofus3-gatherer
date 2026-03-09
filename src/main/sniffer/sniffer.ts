import { Cap } from "cap";
import { EventEmitter } from "stream";
import { ipcMain } from "electron";

export const makeSniffer = ({
    onClientPacket,
    onServerPacket,
}: {
    onClientPacket?: (data: string) => void;
    onServerPacket?: (data: string) => void;
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
        if (!result || !result.str.length) return;

        const { str, seqno, datalen } = result;
        const seqnoEnd = (seqno + datalen) >>> 0;

        if (serverNextSeqno !== null) {
            const delta = (seqnoEnd - serverNextSeqno) >>> 0;
            if (delta === 0 || delta > 0x80000000) return; // retransmission or no new data
        }
        serverNextSeqno = seqnoEnd;

        onServerPacket && onServerPacket(str);
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
}: any): { str: string; seqno: number; datalen: number } | undefined => {
    if (linkType === "ETHERNET") {
        var ret = decoders.Ethernet(buffer);

        if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
            ret = decoders.IPV4(buffer, ret.offset);

            if (ret.info.protocol === PROTOCOL.IP.TCP) {
                var datalen = ret.info.totallen - ret.hdrlen;

                ret = decoders.TCP(buffer, ret.offset);
                datalen -= ret.hdrlen;

                const str = buffer.toString("hex", ret.offset, datalen + ret.offset);

                return { str, seqno: ret.info.seqno, datalen };
            } else if (ret.info.protocol === PROTOCOL.IP.UDP) {
                ret = decoders.UDP(buffer, ret.offset);
            } else console.log("Unsupported IPv4 protocol: " + PROTOCOL.IP[ret.info.protocol]);
        } else console.log("Unsupported Ethertype: " + PROTOCOL.ETHERNET[ret.info.type]);
    }
};
