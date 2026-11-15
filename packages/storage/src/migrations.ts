export interface Migration {
  readonly version: number;
  readonly sql: string;
}

/** Ordered schema migrations. Never edit an applied migration; append a new version instead. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE revisions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        document TEXT NOT NULL,
        view_document TEXT NOT NULL
      );
      CREATE INDEX revisions_by_workspace ON revisions(workspace_id, created_at);
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        base_revision_id TEXT NOT NULL REFERENCES revisions(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        label TEXT NOT NULL,
        sandbox_document TEXT NOT NULL
      );
      CREATE INDEX sessions_by_workspace ON sessions(workspace_id, updated_at);
    `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;
