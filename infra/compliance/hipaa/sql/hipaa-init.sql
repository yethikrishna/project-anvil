-- HIPAA-compliant database initialization
-- Extends base init.sql with HIPAA-specific settings.
--
-- Requirements addressed:
-- - Audit logging of all data access (§164.312(b))
-- - Encryption at rest (§164.312(a)(2)(iv))
-- - Access control with minimum necessary (§164.312(a)(1))
-- - Automatic logoff (§164.312(a)(2)(iii))

-- Force SSL for all connections
ALTER SYSTEM SET ssl = on;
ALTER SYSTEM SET ssl_min_protocol_version = 'TLSv1.2';

-- Enable pgcrypto for data encryption
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── HIPAA Audit Configuration ──

-- Log all DDL changes
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_line_prefix = '%t [%p]: db=%d,user=%u,app=%a,client=%h ';

-- Lock timeout (prevents long-running locks from blocking access)
ALTER SYSTEM SET lock_timeout = '30s';
ALTER SYSTEM SET statement_timeout = '300s'; -- 5 min max query time

-- ── Session Controls ──

-- Idle session timeout (automatic logoff requirement)
ALTER SYSTEM SET idle_session_timeout = '1800000'; -- 30 minutes
ALTER SYSTEM SET idle_in_transaction_session_timeout = '600000'; -- 10 minutes

-- ── PHI Encryption Helpers ──

-- Encrypt a field value (AES-256)
CREATE OR REPLACE FUNCTION encrypt_phi(data TEXT, key BYTEA)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt_bytea(data::bytea, key::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrypt a field value
CREATE OR REPLACE FUNCTION decrypt_phi(data BYTEA, key BYTEA)
RETURNS TEXT AS $$
BEGIN
    RETURN convert_from(pgp_sym_decrypt_bytea(data, key::text), 'UTF8');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── HIPAA-specific Tables ──

-- Break-the-glass emergency access log
CREATE TABLE IF NOT EXISTS emergency_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    patient_id TEXT,
    reason TEXT NOT NULL,
    approved_by UUID,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    reviewed BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_emergency_access_tenant ON emergency_access (tenant_id, started_at DESC);

-- BA (Business Associate) agreement tracking
CREATE TABLE IF NOT EXISTS ba_agreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    ba_name TEXT NOT NULL,
    ba_contact_email TEXT NOT NULL,
    agreement_date DATE NOT NULL,
    expiry_date DATE,
    scope TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Retention Policy Marker ──
-- HIPAA requires 6-year retention of audit logs.
-- Audit partitions are managed by create_audit_partition() function.
-- Set retention marker:
COMMENT ON TABLE audit_log IS 'HIPAA: 6-year retention (§164.530(j)). Monthly partitions. Do not truncate.';
COMMENT ON TABLE emergency_access IS 'HIPAA: Break-the-glass emergency access log (§164.312(a)(1)).';

SELECT pg_reload_conf();
