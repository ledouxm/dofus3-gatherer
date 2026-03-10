import protobuf from "protobufjs";
import { readdirSync, readFileSync } from "fs";
import path from "path";

const GOOGLE_ANY_PROTO = `
syntax="proto3";
package google.protobuf;
message Any { string type_url = 1; bytes value = 2; }
`;

export const initCleanProto = (protoDir: string): protobuf.Root => {
    const gameDir = path.join(protoDir, "game");
    const files = readdirSync(gameDir)
        .filter((f) => f.endsWith(".proto"))
        .map((f) => path.join(gameDir, f));

    const root = new protobuf.Root();
    const loaded = new Set<string>();

    // Pre-register google.protobuf.Any (not bundled in protobufjs)
    protobuf.parse(GOOGLE_ANY_PROTO, root, { keepCase: true });

    function loadFile(filePath: string) {
        // Skip google well-known types (already pre-registered inline)
        if (!path.isAbsolute(filePath) && filePath.startsWith("google/")) return;
        const resolved = path.isAbsolute(filePath) ? filePath : path.join(gameDir, filePath);
        if (loaded.has(resolved)) return;
        loaded.add(resolved);
        const text = readFileSync(resolved, "utf-8");
        const parsed = protobuf.parse(text, root, { keepCase: true });
        for (const imp of parsed.imports ?? []) {
            loadFile(imp);
        }
    }

    for (const f of files) loadFile(f);
    root.resolveAll();
    return root;
};
