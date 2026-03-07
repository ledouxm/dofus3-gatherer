import { getDofusSqlitePath } from "./init/dofus-proto";
import { existsSync, mkdirSync, promises as fs } from "fs";
import { createHash } from "crypto";
import { Kysely, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import { DB } from "./dofus";

const ensureDofusSqlite = async (onProgress?: (progress: number) => void) => {
    const releaseResponse = await fetch(
        "https://api.github.com/repos/ledouxm/dofus-sqlite/releases/latest",
        { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!releaseResponse.ok) {
        throw new Error(`Failed to fetch release info: ${releaseResponse.statusText}`);
    }

    const release = await releaseResponse.json();
    const sqliteAsset = release.assets.find((a: any) => a.name === "dofus.sqlite");
    if (!sqliteAsset) {
        throw new Error("dofus.sqlite asset not found in latest release");
    }

    const expectedHash = sqliteAsset.digest.replace("sha256:", "");

    if (existsSync(getDofusSqlitePath())) {
        const fileBuffer = await fs.readFile(getDofusSqlitePath());
        const hash = createHash("sha256").update(fileBuffer).digest("hex");
        if (hash === expectedHash) {
            console.log("dofus.sqlite is up to date.");
            return;
        }
        console.log("dofus.sqlite is outdated, downloading new version...");
    } else {
        console.log("dofus.sqlite not found, downloading...");
    }

    const downloadResponse = await fetch(sqliteAsset.browser_download_url);
    if (!downloadResponse.ok) {
        throw new Error(`Failed to download dofus.sqlite: ${downloadResponse.statusText}`);
    }

    const contentLength = Number(downloadResponse.headers.get("content-length")) || 0;
    const reader = downloadResponse.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (contentLength > 0) onProgress?.(received / contentLength);
    }

    await fs.writeFile(getDofusSqlitePath(), Buffer.concat(chunks));
    console.log("dofus.sqlite downloaded successfully.");
};

const ref = {
    db: null as any as Kysely<DB>,
};

export const makeDofusSqliteDb = async (onProgress?: (progress: number) => void) => {
    await ensureDofusSqlite(onProgress);

    const database = new Database(getDofusSqlitePath());
    const dialect = new SqliteDialect({ database });
    ref.db = new Kysely<DB>({ dialect });
};

export const getDb = () => {
    if (!ref.db) {
        throw new Error("Database not initialized yet");
    }
    return ref.db;
};
