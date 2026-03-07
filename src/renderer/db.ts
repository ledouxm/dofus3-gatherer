import {
    Driver,
    DatabaseConnection,
    CompiledQuery,
    QueryResult,
    Dialect,
    SqliteQueryCompiler,
    SqliteAdapter,
    Kysely,
    DatabaseIntrospector,
} from "kysely";
import { DB } from "src/main/dofus";

class RpcDriver implements Driver {
    async init() {}
    async acquireConnection(): Promise<DatabaseConnection> {
        return {
            async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
                return await window.api.sql<R>(compiledQuery);
            },
            async *streamQuery() {
                throw new Error("Streaming not supported");
            },
        };
    }
    async beginTransaction() {}
    async commitTransaction() {}
    async rollbackTransaction() {}
    async releaseConnection() {}
    async destroy() {}
}

class RpcDialect implements Dialect {
    createDriver() {
        return new RpcDriver();
    }

    createQueryCompiler() {
        // Use SqliteQueryCompiler or PostgresQueryCompiler
        return new SqliteQueryCompiler();
    }

    createAdapter() {
        return new SqliteAdapter();
    }

    createIntrospector(db: Kysely<any>): DatabaseIntrospector {
        throw new Error("Introspection not supported");
    }
}

export const db = new Kysely<DB>({ dialect: new RpcDialect() });
