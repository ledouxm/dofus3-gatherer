/**
 * Test script: validates the field-rename approach for clean proto decoding.
 *
 * Usage: node scripts/test-proto-decode.mjs
 *
 * Requires dofus.proto to exist at: %APPDATA%\dofus3-gatherer-dev\dofus.proto
 * (launch the app once to download it)
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname, isAbsolute } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import protobuf from "protobufjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameDir = join(__dirname, "../resources/proto/game");

const GOOGLE_ANY_PROTO = `
syntax="proto3";
package google.protobuf;
message Any { string type_url = 1; bytes value = 2; }
`;

// ── Load clean proto ──────────────────────────────────────────────────────────

function loadCleanProto() {
    const root = new protobuf.Root();
    const loaded = new Set();
    protobuf.parse(GOOGLE_ANY_PROTO, root, { keepCase: true });
    loaded.add("google/protobuf/any.proto");

    function loadFile(filePath) {
        if (!isAbsolute(filePath) && filePath.startsWith("google/")) return;
        const resolved = isAbsolute(filePath) ? filePath : join(gameDir, filePath);
        if (loaded.has(resolved)) return;
        loaded.add(resolved);
        const text = readFileSync(resolved, "utf-8");
        const parsed = protobuf.parse(text, root, { keepCase: true });
        for (const imp of parsed.imports ?? []) loadFile(imp);
    }

    for (const f of readdirSync(gameDir).filter((f) => f.endsWith(".proto")).map((f) => join(gameDir, f))) {
        loadFile(f);
    }
    root.resolveAll();
    return root;
}

// ── Load obfuscated proto ─────────────────────────────────────────────────────

const OBF_PROTO_PATHS = [
    join(homedir(), "AppData/Roaming/dofus3-gatherer-dev/dofus.proto"),
    join(homedir(), "AppData/Roaming/dofus3-gatherer/dofus.proto"),
];

function loadObfProto() {
    const dofusProtoPath = OBF_PROTO_PATHS.find(existsSync);
    if (!dofusProtoPath) {
        console.warn("⚠ Obfuscated proto not found at:\n  " + OBF_PROTO_PATHS.join("\n  "));
        console.warn("  Launch the app once to download it.");
        return null;
    }

    const anyProto = `syntax="proto3"; package google.protobuf; message Any{ string type_url=1; bytes value=2; }`;
    const baseProto = `
syntax = "proto3";
import "google/protobuf/any.proto";
message TemplateMessage { TemplateEvent event = 1; TemplatePayload payload = 2; }
message TemplateEvent { bool flag = 1; int32 code = 2; int32 extra = 3; google.protobuf.Any data = 4; }
message TemplatePayload { google.protobuf.Any data = 1; }
`;
    const proto = new protobuf.Root();
    protobuf.parse(anyProto, proto);
    protobuf.parse(baseProto, proto);
    protobuf.parse(readFileSync(dofusProtoPath, "utf-8"), proto);
    console.log(`✓ Loaded obfuscated proto from: ${dofusProtoPath}`);
    return proto;
}

// ── Field-order rename ────────────────────────────────────────────────────────

function buildFieldRenameMap(obfType, cleanType) {
    const obfFields = Object.values(obfType.fields).sort((a, b) => a.id - b.id);
    const cleanFields = Object.values(cleanType.fields).sort((a, b) => a.id - b.id);
    const map = new Map();
    for (let i = 0; i < Math.min(obfFields.length, cleanFields.length); i++) {
        map.set(obfFields[i].name, cleanFields[i].name);
    }
    return map;
}

function renameFields(obj, renameMap) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((item) => renameFields(item, renameMap));
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const cleanKey = renameMap.get(key) ?? key;
        result[cleanKey] = renameFields(value, renameMap);
    }
    return result;
}

// ── Test samples ──────────────────────────────────────────────────────────────

const SAMPLES = [
    {
        obfTypeName: "irj",
        cleanTypeName: "com.ankama.dofus.server.game.protocol.gamemap.MapCurrentEvent",
        hex: "108088e061",
    },
    {
        obfTypeName: "icl",
        cleanTypeName: "com.ankama.dofus.server.game.protocol.inventory.InventoryContentEvent",
        // Full hex provided by user:
        hex: "0a6c08031a6808c05a1801220510fc01287d22041026287e22041023287b22041019287c2205100c28b0012205100828a8032205100728aa032205100728d3012205100528f20122051005289e032205100428b2012205100428f0052204100128752205100128f30128f7d0ed32",
    },
];

// ── Main ──────────────────────────────────────────────────────────────────────

const cleanRoot = loadCleanProto();
console.log(`✓ Loaded clean proto (${readdirSync(gameDir).filter((f) => f.endsWith(".proto")).length} files)\n`);

const obfRoot = loadObfProto();
console.log();

for (const sample of SAMPLES) {
    console.log(`═══ ${sample.obfTypeName} → ${sample.cleanTypeName.split(".").pop()} ═══`);
    const rawBytes = Buffer.from(sample.hex, "hex");

    // 1. Try direct decode with clean proto (works only if field numbers match)
    try {
        const cleanType = cleanRoot.lookupType(sample.cleanTypeName);
        const directDecode = cleanType.decode(rawBytes).toJSON();
        const isEmpty = Object.keys(directDecode).length === 0;
        if (isEmpty) {
            console.log("  Direct re-decode: ✗ empty (field numbers differ)");
        } else {
            console.log("  Direct re-decode: ✓", JSON.stringify(directDecode));
        }
    } catch (e) {
        console.log("  Direct re-decode: ✗", e.message);
    }

    // 2. Field-order rename via obf proto
    if (obfRoot) {
        try {
            const obfType = obfRoot.lookupType(sample.obfTypeName);
            const cleanType = cleanRoot.lookupType(sample.cleanTypeName);
            const renameMap = buildFieldRenameMap(obfType, cleanType);

            console.log("  Field rename map:", Object.fromEntries(renameMap));

            const rawData = obfType.decode(rawBytes).toJSON();
            console.log("  Obf decoded:     ", JSON.stringify(rawData));

            const cleanData = renameFields(rawData, renameMap);
            console.log("  Clean renamed:   ", JSON.stringify(cleanData));
        } catch (e) {
            console.log("  Field-rename: ✗", e.message);
        }
    }

    console.log();
}
