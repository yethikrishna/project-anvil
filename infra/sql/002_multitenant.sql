-- ═══════════════════════════════════════════════════════════════
-- Anvil Multi-Tenant Database Schema
-- Migration 002: SaaS multi-tenancy with RLS
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ──

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tenants (Organizations) ──

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'provisioning'
                        CHECK (status IN ('provisioning','active','suspended','deprovisioning','deleted')),
    plan_id         TEXT NOT NULL DEFAULT 'free',
    isolation_mode  TEXT NOT NULL DEFAULT 'rls'
                        CHECK (isolation_mode IN ('schema-per-tenant','rls','database-per-tenant')),
    schema_name     TEXT,
    region          TEXT NOT NULL DEFAULT 'us-east-1',
    custom_domains  TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_tenants_slug ON tenants (slug);
CREATE INDEX idx_tenants_status ON tenants (status);

-- ── Tenant Config ──

CREATE TABLE tenant_config (
    tenant_id       UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    branding        JSONB DEFAULT '{}',
    features        JSONB DEFAULT '{
        "sso": false,
        "mfa": "disabled",
        "auditLog": false,
        "e2ee": false,
        "customDomain": false,
        "api": false,
        "ai": false,
        "marketplace": false
    }',
    limits          JSONB DEFAULT '{
        "maxUsers": 5,
        "maxStorageGB": 5,
        "maxApiCallsPerMin": 10
    }',
    auth            JSONB DEFAULT '{}',
    data_residency  JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ──

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    email           TEXT NOT NULL,
    password_hash   TEXT,
    name            TEXT NOT NULL,
    display_name    TEXT,
    avatar_url      TEXT,
    role            TEXT NOT NULL DEFAULT 'member'
                        CHECK (role IN ('owner','admin','member','viewer','guest')),
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','invited','deactivated')),
    last_login_at   TIMESTAMPTZ,
    last_active_at  TIMESTAMPTZ,
    locale          TEXT DEFAULT 'en',
    timezone        TEXT DEFAULT 'UTC',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users (tenant_id);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_status ON users (tenant_id, status);

-- ── MFA ──

CREATE TABLE user_mfa (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method          TEXT NOT NULL CHECK (method IN ('totp','webauthn')),
    secret          TEXT,           -- TOTP base32 secret (encrypted at rest)
    verified        BOOLEAN DEFAULT FALSE,
    webauthn_cred   JSONB,          -- WebAuthn credential data
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, method)
);

-- ── Recovery Codes ──

CREATE TABLE recovery_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash       TEXT NOT NULL,  -- bcrypt hash of the code
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recovery_codes_user ON recovery_codes (user_id) WHERE used_at IS NULL;

-- ── MFA Policy (org-level) ──

CREATE TABLE mfa_policies (
    tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    policy              TEXT NOT NULL DEFAULT 'disabled'
                            CHECK (policy IN ('disabled','optional','required','required_with_grace')),
    allowed_methods     TEXT[] DEFAULT '{totp,webauthn}',
    grace_period_days   INT DEFAULT 14,
    enforcement_started TIMESTAMPTZ,
    excluded_roles      TEXT[] DEFAULT '{}',
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SSO (SAML IdP configs per tenant) ──

CREATE TABLE saml_idps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    sso_url         TEXT NOT NULL,
    slo_url         TEXT,
    certificate     TEXT NOT NULL,
    attribute_map   JSONB DEFAULT '{}',
    jit_provision   BOOLEAN DEFAULT TRUE,
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saml_idps_tenant ON saml_idps (tenant_id);

-- ── LDAP Connections ──

CREATE TABLE ldap_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    bind_dn         TEXT NOT NULL,
    bind_password   TEXT NOT NULL,   -- encrypted at rest
    search_base     TEXT NOT NULL,
    search_filter   TEXT DEFAULT '(mail={{username}})',
    group_base      TEXT,
    use_tls         BOOLEAN DEFAULT TRUE,
    active_directory BOOLEAN DEFAULT FALSE,
    role_mappings   JSONB DEFAULT '[]',
    sync_interval   INT DEFAULT 3600, -- seconds
    last_sync_at    TIMESTAMPTZ,
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── API Keys ──

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    key_prefix      TEXT NOT NULL,
    key_hash        TEXT NOT NULL,   -- SHA-256 hash of the full key
    permissions     TEXT[] DEFAULT '{}',
    status          TEXT DEFAULT 'active' CHECK (status IN ('active','revoked')),
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_tenant ON api_keys (tenant_id);

-- ── Audit Log (append-only, partitioned by month) ──

CREATE TABLE audit_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT,
    details         JSONB DEFAULT '{}',
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for current + next 3 months
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_log_2026_06 PARTITION OF audit_log
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_07 PARTITION OF audit_log
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_log_2026_08 PARTITION OF audit_log
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE INDEX idx_audit_tenant_time ON audit_log (tenant_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log (tenant_id, action);

-- ── Billing ──

CREATE TABLE billing_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL UNIQUE REFERENCES tenants(id),
    stripe_customer_id  TEXT,
    stripe_subscription_id TEXT,
    plan_id             TEXT NOT NULL DEFAULT 'free',
    seats               INT NOT NULL DEFAULT 1,
    current_period_start TIMESTAMPTZ,
    current_period_end  TIMESTAMPTZ,
    status              TEXT DEFAULT 'active'
                            CHECK (status IN ('active','past_due','canceled','trialing','paused')),
    trial_ends_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Usage Metering (monthly rollups) ──

CREATE TABLE usage_monthly (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    period          TEXT NOT NULL,   -- YYYY-MM
    api_calls       BIGINT DEFAULT 0,
    ai_calls        BIGINT DEFAULT 0,
    storage_gb      DECIMAL(10,2) DEFAULT 0,
    active_users    INT DEFAULT 0,
    total_users     INT DEFAULT 0,
    docs_created    INT DEFAULT 0,
    emails_sent     INT DEFAULT 0,
    files_uploaded  INT DEFAULT 0,
    searches        INT DEFAULT 0,
    bandwidth_gb    DECIMAL(10,2) DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (tenant_id, period)
);

CREATE INDEX idx_usage_tenant_period ON usage_monthly (tenant_id, period DESC);

-- ── Real-time usage counters (incremented per-request) ──

CREATE TABLE usage_events (
    id              BIGINT GENERATED ALWAYS AS IDENTITY,
    tenant_id       UUID NOT NULL,
    user_id         UUID,
    metric          TEXT NOT NULL,
    value           BIGINT NOT NULL DEFAULT 1,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

CREATE TABLE usage_events_2026_05 PARTITION OF usage_events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE usage_events_2026_06 PARTITION OF usage_events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE usage_events_2026_07 PARTITION OF usage_events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX idx_usage_events_tenant ON usage_events (tenant_id, created_at DESC);

-- ── Encryption Keys (HSM-backed) ──

CREATE TABLE tenant_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    purpose         TEXT NOT NULL CHECK (purpose IN ('files','emails','documents','database','backups')),
    key_id          TEXT NOT NULL UNIQUE,
    encrypted_key   BYTEA NOT NULL,     -- DEK encrypted by KEK (envelope encryption)
    version         INT NOT NULL DEFAULT 1,
    algorithm       TEXT DEFAULT 'AES-256-GCM',
    active          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,

    UNIQUE (tenant_id, purpose, version)
);

-- ── Custom Domains ──

CREATE TABLE custom_domains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    domain          TEXT NOT NULL UNIQUE,
    verified        BOOLEAN DEFAULT FALSE,
    verification_token TEXT,
    ssl_status      TEXT DEFAULT 'pending' CHECK (ssl_status IN ('pending','provisioning','active','failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_domains_tenant ON custom_domains (tenant_id);

-- ── Invitations ──

CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    email           TEXT NOT NULL,
    role            TEXT DEFAULT 'member',
    invited_by      UUID NOT NULL REFERENCES users(id),
    token           TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON invitations (token) WHERE accepted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- Row-Level Security
-- ═══════════════════════════════════════════════════════════════

-- Helper: current tenant ID from session/JWT
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.tenant_id', true)::UUID;
EXCEPTION
    WHEN others THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see data in their own tenant
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_api_keys ON api_keys
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_audit ON audit_log
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_usage ON usage_monthly
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_events ON usage_events
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_keys ON tenant_keys
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_domains ON custom_domains
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_invitations ON invitations
    USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_mfa ON user_mfa
    USING (user_id IN (SELECT id FROM users WHERE tenant_id = current_tenant_id()));

CREATE POLICY tenant_isolation_recovery ON recovery_codes
    USING (user_id IN (SELECT id FROM users WHERE tenant_id = current_tenant_id()));

-- ═══════════════════════════════════════════════════════════════
-- Helper Functions
-- ═══════════════════════════════════════════════════════════════

-- Auto-create monthly audit partitions
CREATE OR REPLACE FUNCTION create_audit_partition()
RETURNS void AS $$
DECLARE
    month_start DATE;
    month_end DATE;
    partition_name TEXT;
BEGIN
    month_start := date_trunc('month', CURRENT_DATE + INTERVAL '2 months');
    month_end := month_start + INTERVAL '1 month';
    partition_name := 'audit_log_' || to_char(month_start, 'YYYY_MM');

    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
            partition_name, month_start, month_end
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Auto-create monthly usage event partitions
CREATE OR REPLACE FUNCTION create_usage_partition()
RETURNS void AS $$
DECLARE
    month_start DATE;
    month_end DATE;
    partition_name TEXT;
BEGIN
    month_start := date_trunc('month', CURRENT_DATE + INTERVAL '2 months');
    month_end := month_start + INTERVAL '1 month';
    partition_name := 'usage_events_' || to_char(month_start, 'YYYY_MM');

    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF usage_events FOR VALUES FROM (%L) TO (%L)',
            partition_name, month_start, month_end
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Record an audit event
CREATE OR REPLACE FUNCTION record_audit(
    p_tenant_id UUID,
    p_user_id UUID,
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}',
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    audit_id BIGINT;
BEGIN
    INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
    VALUES (p_tenant_id, p_user_id, p_action, p_resource_type, p_resource_id, p_details, p_ip_address, p_user_agent)
    RETURNING id INTO audit_id;
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Track a usage event
CREATE OR REPLACE FUNCTION track_usage(
    p_tenant_id UUID,
    p_user_id UUID DEFAULT NULL,
    p_metric TEXT,
    p_value BIGINT DEFAULT 1,
    p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE
    period TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
BEGIN
    -- Insert event
    INSERT INTO usage_events (tenant_id, user_id, metric, value, metadata)
    VALUES (p_tenant_id, p_user_id, p_metric, p_value, p_metadata);

    -- Upsert monthly rollup
    INSERT INTO usage_monthly (tenant_id, period, api_calls, ai_calls, docs_created, emails_sent, files_uploaded, searches)
    VALUES (p_tenant_id, period, 0, 0, 0, 0, 0, 0)
    ON CONFLICT (tenant_id, period) DO NOTHING;

    -- Increment the right counter
    CASE p_metric
        WHEN 'api_calls' THEN
            UPDATE usage_monthly SET api_calls = api_calls + p_value, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND period = period;
        WHEN 'ai_calls' THEN
            UPDATE usage_monthly SET ai_calls = ai_calls + p_value, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND period = period;
        WHEN 'documents_created' THEN
            UPDATE usage_monthly SET docs_created = docs_created + p_value, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND period = period;
        WHEN 'emails_sent' THEN
            UPDATE usage_monthly SET emails_sent = emails_sent + p_value, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND period = period;
        WHEN 'files_uploaded' THEN
            UPDATE usage_monthly SET files_uploaded = files_uploaded + p_value, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND period = period;
        WHEN 'searches' THEN
            UPDATE usage_monthly SET searches = searches + p_value, updated_at = NOW()
            WHERE tenant_id = p_tenant_id AND period = period;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- Scheduled maintenance (run monthly via pg_cron or external)
-- ═══════════════════════════════════════════════════════════════

-- SELECT create_audit_partition();
-- SELECT create_usage_partition();

-- ═══════════════════════════════════════════════════════════════
-- Initial data: ensure admin user + audit functionality
-- ═══════════════════════════════════════════════════════════════

-- Grants for application role (adjust to your setup)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anvil_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anvil_app;

-- ═══════════════════════════════════════════════════════════════
-- Migration 003: SCIM 2.0 Provisioning
-- ═══════════════════════════════════════════════════════════════

-- ── SCIM tokens (per-tenant bearer tokens for IdP provisioning) ──

CREATE TABLE IF NOT EXISTS scim_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    label           TEXT NOT NULL DEFAULT 'Default',
    token_hash      TEXT NOT NULL UNIQUE,
    prefix          TEXT NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scim_tokens_tenant ON scim_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_scim_tokens_hash ON scim_tokens (token_hash) WHERE active = true;

-- ── SCIM configuration ──

CREATE TABLE IF NOT EXISTS scim_configs (
    tenant_id           UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    group_role_map      JSONB NOT NULL DEFAULT '{}',
    auto_create_groups  BOOLEAN NOT NULL DEFAULT false,
    default_role        TEXT NOT NULL DEFAULT 'member'
                            CHECK (default_role IN ('admin','member','viewer')),
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── External ID column on users (for SCIM ExternalId) ──

ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_external_id ON users (tenant_id, external_id)
    WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- ── User sessions (for session revocation on SCIM deprovision) ──

CREATE TABLE IF NOT EXISTS user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    revoked_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_user ON user_sessions (tenant_id, user_id)
    WHERE revoked_at IS NULL;

-- ── Invitations (for user invite flow) ──

CREATE TABLE IF NOT EXISTS invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',
    invited_by      UUID REFERENCES users(id),
    token           TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations (token)
    WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON invitations (tenant_id, email);

-- ── Billing accounts ──

CREATE TABLE IF NOT EXISTS billing_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id                 TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id      TEXT UNIQUE,
    stripe_subscription_id  TEXT UNIQUE,
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    seats                   INT NOT NULL DEFAULT 1,
    status                  TEXT NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','past_due','canceled','trialing','paused')),
    trial_ends_at           TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_stripe_customer ON billing_accounts (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

-- ── SAML IdP configurations ──

CREATE TABLE IF NOT EXISTS saml_idps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    sso_url         TEXT NOT NULL,
    slo_url         TEXT,
    certificate     TEXT NOT NULL,
    attribute_map   JSONB NOT NULL DEFAULT '{}',
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, entity_id)
);

-- ── LDAP connections ──

CREATE TABLE IF NOT EXISTS ldap_connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    bind_dn         TEXT NOT NULL,
    bind_password   TEXT NOT NULL,   -- encrypted at rest via tenant DEK
    search_base     TEXT NOT NULL,
    search_filter   TEXT NOT NULL DEFAULT '(mail={{username}})',
    group_base      TEXT,
    use_tls         BOOLEAN NOT NULL DEFAULT true,
    active_directory BOOLEAN NOT NULL DEFAULT false,
    role_mappings   JSONB NOT NULL DEFAULT '[]',
    sync_interval   INT NOT NULL DEFAULT 3600,  -- seconds
    last_sync_at    TIMESTAMPTZ,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MFA policies ──

CREATE TABLE IF NOT EXISTS mfa_policies (
    tenant_id               UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    policy                  TEXT NOT NULL DEFAULT 'disabled'
                                CHECK (policy IN ('disabled','optional','required','required_with_grace')),
    allowed_methods         TEXT[] NOT NULL DEFAULT '{totp,webauthn}',
    grace_period_days       INT NOT NULL DEFAULT 14,
    excluded_roles          TEXT[] NOT NULL DEFAULT '{}',
    enforcement_started     TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Tenant encryption keys (DEK metadata — key material in HSM/KMS) ──

CREATE TABLE IF NOT EXISTS tenant_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purpose         TEXT NOT NULL
                        CHECK (purpose IN ('files','emails','documents','database','backups')),
    key_version     INT NOT NULL DEFAULT 1,
    kms_key_id      TEXT,           -- AWS KMS / GCP KMS key reference
    encrypted_dek   BYTEA,          -- DEK encrypted by KEK (envelope encryption)
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    UNIQUE (tenant_id, purpose, key_version)
);

CREATE INDEX IF NOT EXISTS idx_tenant_keys_active ON tenant_keys (tenant_id, purpose)
    WHERE active = true;

-- ── Demo signups (for landing page trials) ──

CREATE TABLE IF NOT EXISTS demo_signups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trial_id        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL,
    name            TEXT NOT NULL,
    company         TEXT,
    team_size       TEXT,
    use_case        TEXT,
    plan_id         TEXT NOT NULL DEFAULT 'starter',
    deploy_type     TEXT NOT NULL DEFAULT 'cloud'
                        CHECK (deploy_type IN ('cloud','self-hosted')),
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','provisioning','active','expired')),
    tenant_id       UUID REFERENCES tenants(id),
    ip_hash         TEXT,   -- hashed for rate limiting / abuse detection
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_signups_email ON demo_signups (email);
CREATE INDEX IF NOT EXISTS idx_demo_signups_status ON demo_signups (status, created_at);

