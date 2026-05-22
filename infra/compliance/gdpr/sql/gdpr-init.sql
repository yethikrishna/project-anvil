-- GDPR-compliant database initialization
-- Extends base init.sql with GDPR-specific tables and functions.
--
-- Requirements addressed:
-- - Art. 5: Data minimization, purpose limitation, storage limitation
-- - Art. 7: Consent management
-- - Art. 17: Right to erasure (right to be forgotten)
-- - Art. 20: Right to data portability
-- - Art. 30: Records of processing activities
-- - Art. 33: Breach notification (72-hour)
-- - Art. 35: Data Protection Impact Assessment

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Consent Management (Art. 7) ──

CREATE TABLE IF NOT EXISTS gdpr_processing_purposes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    purpose_key TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    legal_basis TEXT NOT NULL CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 'vital_interest', 'public_task', 'legitimate_interest')),
    data_categories TEXT[] NOT NULL,
    retention_period_days INT,
    requires_consent BOOLEAN DEFAULT TRUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, purpose_key)
);

-- ── Processing Activities Register (Art. 30) ──

CREATE TABLE IF NOT EXISTS gdpr_processing_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    activity_name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    data_categories TEXT[] NOT NULL,
    data_subjects TEXT[] NOT NULL,     -- e.g. {'employees', 'customers'}
    recipients TEXT[] DEFAULT '{}',
    retention_period TEXT NOT NULL,
    technical_measures TEXT,
    organizational_measures TEXT,
    dpia_required BOOLEAN DEFAULT FALSE,
    dpia_completed BOOLEAN DEFAULT FALSE,
    transfer_outside_eu BOOLEAN DEFAULT FALSE,
    transfer_safeguards TEXT,
    last_reviewed DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Data Breach Register (Art. 33) ──

CREATE TABLE IF NOT EXISTS gdpr_breach_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reported_at TIMESTAMPTZ,
    dpa_notified_at TIMESTAMPTZ,
    subjects_notified_at TIMESTAMPTZ,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    affected_data_categories TEXT[] NOT NULL,
    affected_subjects_count INT DEFAULT 0,
    root_cause TEXT,
    remediation_steps TEXT,
    status TEXT DEFAULT 'investigating' CHECK (status IN ('investigating', 'contained', 'resolved', 'closed')),
    dpo_name TEXT,
    dpo_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DPIA Register (Art. 35) ──

CREATE TABLE IF NOT EXISTS gdpr_dpia_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    project_name TEXT NOT NULL,
    description TEXT NOT NULL,
    assessment_date DATE NOT NULL,
    assessor TEXT NOT NULL,
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
    mitigation_measures TEXT,
    residual_risk TEXT,
    approved BOOLEAN DEFAULT FALSE,
    approved_by TEXT,
    next_review_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Right to Erasure Tracking (Art. 17) ──

CREATE TABLE IF NOT EXISTS gdpr_erasure_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,  -- 30 days from request
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'denied', 'partial')),
    denial_reason TEXT,
    completion_details JSONB DEFAULT '[]',
    completed_at TIMESTAMPTZ,
    verified_by UUID
);

-- ── Data Portability Requests (Art. 20) ──

CREATE TABLE IF NOT EXISTS gdpr_portability_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    format TEXT DEFAULT 'json' CHECK (format IN ('json', 'csv', 'xml')),
    export_path TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    completed_at TIMESTAMPTZ,
    download_expires_at TIMESTAMPTZ
);

-- ── Helper Functions ──

-- Check if erasure deadline is approaching
CREATE OR REPLACE FUNCTION gdpr_erasure_overdue()
RETURNS TABLE (id UUID, tenant_id UUID, user_id UUID, days_overdue INT) AS $$
BEGIN
    RETURN QUERY
    SELECT er.id, er.tenant_id, er.user_id,
           (CURRENT_DATE - er.deadline_at::date) AS days_overdue
    FROM gdpr_erasure_requests er
    WHERE er.status = 'pending' AND er.deadline_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Get consent status for a user across all purposes
CREATE OR REPLACE FUNCTION gdpr_user_consent_status(p_tenant_id UUID, p_user_id UUID)
RETURNS TABLE (purpose TEXT, consented BOOLEAN, last_updated TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (cr.purpose) cr.purpose, cr.consented, cr.created_at
    FROM consent_records cr
    WHERE cr.tenant_id = p_tenant_id AND cr.user_id = p_user_id
    ORDER BY cr.purpose, cr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS ──
ALTER TABLE gdpr_processing_purposes ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_processing_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_breach_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_erasure_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_portability_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY gdpr_tenant_purposes ON gdpr_processing_purposes USING (tenant_id = current_tenant_id());
CREATE POLICY gdpr_tenant_register ON gdpr_processing_register USING (tenant_id = current_tenant_id());
CREATE POLICY gdpr_tenant_breach ON gdpr_breach_register USING (tenant_id = current_tenant_id());
CREATE POLICY gdpr_tenant_erasure ON gdpr_erasure_requests USING (tenant_id = current_tenant_id());
CREATE POLICY gdpr_tenant_portability ON gdpr_portability_requests USING (tenant_id = current_tenant_id());

COMMENT ON TABLE gdpr_breach_register IS 'GDPR Art. 33: Must notify DPA within 72 hours of becoming aware.';
COMMENT ON TABLE gdpr_erasure_requests IS 'GDPR Art. 17: Must complete within 30 days (extendable to 60).';
