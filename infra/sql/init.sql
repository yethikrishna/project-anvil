-- Project Anvil: Database Initialization
-- Creates separate databases for each service

CREATE DATABASE keycloak_db;
CREATE DATABASE drive_db;
CREATE DATABASE docs_db;
CREATE DATABASE search_db;
CREATE DATABASE gmail_db;

-- Drive: Materialized path directory schema
\c drive_db;

CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    path ltree NOT NULL,
    mime_type TEXT,
    size BIGINT DEFAULT 0,
    s3_key TEXT,
    is_directory BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_files_path ON files USING gist (path);
CREATE INDEX idx_files_user ON files (user_id);
CREATE INDEX idx_files_name ON files USING gin (name gin_trgm_ops);

-- Docs: Document metadata
\c docs_db;

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    yjs_state BYTEA,
    version INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE document_collaborators (
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT DEFAULT 'editor',
    PRIMARY KEY (document_id, user_id)
);

-- Search: Indexed documents
\c search_db;

CREATE TABLE indexed_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    content TEXT,
    embedding VECTOR(384),
    indexed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gmail: Message metadata
\c gmail_db;

CREATE TABLE mail_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    message_id TEXT UNIQUE NOT NULL,
    thread_id TEXT,
    from_addr TEXT,
    to_addrs TEXT[],
    subject TEXT,
    labels TEXT[],
    read BOOLEAN DEFAULT FALSE,
    starred BOOLEAN DEFAULT FALSE,
    date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mail_user ON mail_metadata (user_id);
CREATE INDEX idx_mail_thread ON mail_metadata (thread_id);
CREATE INDEX idx_mail_date ON mail_metadata (date DESC);
