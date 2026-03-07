import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, type ReactNode } from "react";
import { useStoreValue } from "@simplestack/store/react";
import { MapContainer } from "react-leaflet/MapContainer";
import { TileLayer } from "react-leaflet/TileLayer";
import { mapStore } from "../providers/store";
import { type WorldmapMeta } from "./dofus-map.utils";

interface Metadata {
    [id: string]: WorldmapMeta;
}

interface Props {
    baseUrl?: string;
    children?: (props: { meta: WorldmapMeta }) => ReactNode;
}

export const DofusLeafletMap = ({ baseUrl = "", children }: Props) => {
    const selectedId = useStoreValue(mapStore, (s) => s.selectedWorldmapId);

    const metadataQuery = useQuery({
        queryKey: ["metadata"],
        queryFn: async () => {
            const response = await fetch(`${baseUrl}/tiles/metadata.json`).then((res) =>
                res.json(),
            );
            return response as Metadata;
        },
    });

    useEffect(() => {
        const metadata = metadataQuery.data;
        if (!metadata) return;
        const ids = Object.keys(metadata).sort((a, b) => parseInt(a) - parseInt(b));
        mapStore.set((v) => ({
            ...v,
            worldmapIds: ids,
            worldmapMetadata: metadata,
            selectedWorldmapId: v.selectedWorldmapId ?? ids[0] ?? null,
        }));
    }, [metadataQuery.data]);

    if (metadataQuery.isError) {
        return (
            <div style={{ color: "#eee", padding: 20 }}>
                {metadataQuery.error?.message}
            </div>
        );
    }

    const metadata = metadataQuery.data;
    if (!metadata || !selectedId) return null;

    const { width: W, height: H, z_max, startScale } = metadata[selectedId]!;

    const crs = L.extend({}, L.CRS.Simple, {
        transformation: new L.Transformation(256 / W, 0, -256 / H, 0),
    });

    const bounds = L.latLngBounds([
        [0, 0],
        [-H, W],
    ]);
    const z_start = z_max + Math.log2(startScale || 1.0);
    const center: L.LatLngExpression = [-(H / 2), W / 2];
    const meta = metadata[selectedId]!;

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: "#1a1a2e",
                fontFamily: "sans-serif",
            }}
        >
            <MapContainer
                key={selectedId}
                crs={crs}
                center={center}
                zoom={z_start}
                minZoom={0}
                maxZoom={z_max + 2}
                zoomSnap={0.25}
                attributionControl={false}
                zoomControl={false}
                inertia={false}
                style={{ width: "100%", height: "100%", background: "#111" }}
            >
                <TileLayer
                    url={`${baseUrl}/tiles/${selectedId}/{z}/{x}/{y}.png`}
                    tileSize={256}
                    maxNativeZoom={z_max}
                    noWrap={true}
                    bounds={bounds}
                    keepBuffer={2}
                />
                {children?.({ meta })}
            </MapContainer>
        </div>
    );
};
