/**
 * SaaS Multi-Tenant Infrastructure
 *
 * Features:
 * - Tenant isolation (schema-per-tenant or row-level security)
 * - Tenant provisioning/deprovisioning
 * - Custom domain mapping
 * - Tenant-aware database connection routing
 * - Tenant configuration management
 * - Resource quotas and limits
 */

import {createHash, randomBytes} from 'crypto';

// ── Types ──

export type IsolationMode = 'schema-per-tenant' | 'rls' | 'database-per-tenant';
export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'deprovisioning' | 'deleted';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  planId: string;
  isolationMode: IsolationMode;
  schemaName: string;
  domain?: string;
  customDomains: string[];
  region: string;
  config: TenantConfig;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TenantConfig {
  branding: {
    logo?: string;
    primaryColor?: string;
    name?: string;
  };
  features: {
    sso: boolean;
    mfa: 'disabled' | 'optional' | 'required';
    auditLog: boolean;
    e2ee: boolean;
    customDomain: boolean;
    api: boolean;
    ai: boolean;
    marketplace: boolean;
  };
  limits: {
    maxUsers: number;
    maxStorageGB: number;
    maxApiCallsPerMin: number;
  };
  auth: {
    samlIdp?: string;
    ldapServer?: string;
    mfaMethods: ('totp' | 'webauthn')[];
    sessionTimeout: number;
  };
}

export interface TenantProvisionResult {
  tenant: Tenant;
  schemaCreated: boolean;
  adminUserCreated: boolean;
  minioBucketCreated: boolean;
  meilisearchIndexCreated: boolean;
}

// ── Tenant Manager ──

export class TenantManager {
  private tenants = new Map<string, Tenant>();
  private domainMap = new Map<string, string>();  // domain → tenantId

  /**
   * Provision a new tenant.
   */
  async provision(params: {
    name: string;
    slug: string;
    planId: string;
    region: string;
    isolationMode?: IsolationMode;
    domain?: string;
    adminEmail: string;
    adminName: string;
  }): Promise<TenantProvisionResult> {
    const tenantId = this.generateTenantId();
    const schemaName = `tenant_${params.slug.replace(/[^a-z0-9]/g, '_')}`;
    const isolationMode = params.isolationMode ?? 'schema-per-tenant';

    const tenant: Tenant = {
      id: tenantId,
      slug: params.slug,
      name: params.name,
      status: 'provisioning',
      planId: params.planId,
      isolationMode,
      schemaName,
      domain: params.domain,
      customDomains: [],
      region: params.region,
      config: this.getDefaultConfig(params.planId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tenants.set(tenantId, tenant);

    try {
      // 1. Create database schema
      await this.createSchema(schemaName, isolationMode);

      // 2. Create admin user
      await this.createAdminUser(tenantId, params.adminEmail, params.adminName);

      // 3. Create MinIO bucket
      await this.createMinioBucket(tenantId);

      // 4. Create Meilisearch index
      await this.createMeilisearchIndex(tenantId);

      // 5. Register domain
      if (params.domain) {
        this.domainMap.set(params.domain, tenantId);
      }

      tenant.status = 'active';
      tenant.updatedAt = new Date().toISOString();

      return {
        tenant,
        schemaCreated: true,
        adminUserCreated: true,
        minioBucketCreated: true,
        meilisearchIndexCreated: true,
      };
    } catch (err) {
      tenant.status = 'suspended';
      tenant.updatedAt = new Date().toISOString();
      throw new TenantError(`Provisioning failed: ${(err as Error).message}`);
    }
  }

  /**
   * Deprovision a tenant (soft delete + cleanup).
   */
  async deprovision(tenantId: string, options?: {immediate?: boolean}): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new TenantError(`Tenant not found: ${tenantId}`);

    tenant.status = 'deprovisioning';
    tenant.updatedAt = new Date().toISOString();

    if (options?.immediate) {
      // Immediate deletion (for testing/dev)
      await this.dropSchema(tenant.schemaName, tenant.isolationMode);
      this.tenants.delete(tenantId);
      for (const domain of tenant.customDomains) {
        this.domainMap.delete(domain);
      }
    } else {
      // Soft delete: mark for deletion, schedule cleanup after retention period
      tenant.deletedAt = new Date().toISOString();
      tenant.status = 'deleted';
    }
  }

  /**
   * Resolve a tenant from a hostname (custom domain support).
   */
  resolveTenant(hostname: string): Tenant | undefined {
    // Check custom domains
    const tenantId = this.domainMap.get(hostname);
    if (tenantId) return this.tenants.get(tenantId);

    // Check slug-based subdomain: <slug>.anvil.example.com
    const slug = hostname.split('.')[0];
    for (const [, tenant] of this.tenants) {
      if (tenant.slug === slug && tenant.status === 'active') {
        return tenant;
      }
    }

    return undefined;
  }

  /**
   * Get tenant by ID.
   */
  getTenant(tenantId: string): Tenant | undefined {
    return this.tenants.get(tenantId);
  }

  /**
   * Add a custom domain to a tenant.
   */
  async addCustomDomain(tenantId: string, domain: string): Promise<void> {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new TenantError(`Tenant not found: ${tenantId}`);

    if (this.domainMap.has(domain)) {
      throw new TenantError(`Domain already mapped: ${domain}`);
    }

    // Verify domain ownership (DNS TXT record check)
    // In production: DNS lookup for _anvil-verify.<domain> TXT record

    tenant.customDomains.push(domain);
    this.domainMap.set(domain, tenantId);
    tenant.updatedAt = new Date().toISOString();
  }

  /**
   * Update tenant configuration.
   */
  updateConfig(tenantId: string, updates: Partial<TenantConfig>): Tenant {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new TenantError(`Tenant not found: ${tenantId}`);

    tenant.config = deepMerge(tenant.config, updates);
    tenant.updatedAt = new Date().toISOString();
    return tenant;
  }

  /**
   * List all tenants with optional filtering.
   */
  listTenants(filters?: {
    status?: TenantStatus;
    planId?: string;
    region?: string;
  }): Tenant[] {
    let result = Array.from(this.tenants.values());

    if (filters?.status) result = result.filter(t => t.status === filters.status);
    if (filters?.planId) result = result.filter(t => t.planId === filters.planId);
    if (filters?.region) result = result.filter(t => t.region === filters.region);

    return result;
  }

  // ── Schema Management (SQL) ──

  getSchemaSQL(schemaName: string): string {
    return `
      CREATE SCHEMA IF NOT EXISTS ${schemaName};

      -- Tenant-scoped tables
      CREATE TABLE IF NOT EXISTS ${schemaName}.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'invited')),
        avatar_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS ${schemaName}.files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id UUID REFERENCES ${schemaName}.files(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime_type TEXT,
        size BIGINT DEFAULT 0,
        storage_key TEXT,
        is_folder BOOLEAN NOT NULL DEFAULT false,
        owner_id UUID NOT NULL REFERENCES ${schemaName}.users(id),
        path TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ${schemaName}.documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        content JSONB,
        owner_id UUID NOT NULL REFERENCES ${schemaName}.users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ${schemaName}.audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES ${schemaName}.users(id),
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX idx_${schemaName}_files_parent ON ${schemaName}.files(parent_id);
      CREATE INDEX idx_${schemaName}_files_path ON ${schemaName}.files USING gin(path gin_trgm_ops);
      CREATE INDEX idx_${schemaName}_audit_created ON ${schemaName}.audit_log(created_at);
      CREATE INDEX idx_${schemaName}_audit_action ON ${schemaName}.audit_log(action);
    `;
  }

  getRLSPolicySQL(tableName: string): string {
    return `
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON ${tableName}
        USING (tenant_id = current_setting('app.current_tenant')::uuid);
    `;
  }

  // ── Private Methods ──

  private generateTenantId(): string {
    return `org_${randomBytes(8).toString('hex')}`;
  }

  private getDefaultConfig(planId: string): TenantConfig {
    return {
      branding: {},
      features: {
        sso: planId === 'enterprise',
        mfa: planId === 'enterprise' ? 'required' : 'optional',
        auditLog: ['business', 'enterprise'].includes(planId),
        e2ee: planId === 'enterprise',
        customDomain: ['business', 'enterprise'].includes(planId),
        api: planId !== 'free',
        ai: ['business', 'enterprise'].includes(planId),
        marketplace: ['business', 'enterprise'].includes(planId),
      },
      limits: {
        maxUsers: planId === 'free' ? 5 : planId === 'starter' ? 25 : planId === 'business' ? 100 : 100000,
        maxStorageGB: planId === 'free' ? 5 : planId === 'starter' ? 50 : planId === 'business' ? 500 : 10000,
        maxApiCallsPerMin: planId === 'free' ? 10 : planId === 'starter' ? 100 : planId === 'business' ? 1000 : 10000,
      },
      auth: {
        mfaMethods: ['totp', 'webauthn'],
        sessionTimeout: 30 * 60 * 1000, // 30 minutes
      },
    };
  }

  private async createSchema(schemaName: string, mode: IsolationMode): Promise<void> {
    // In production: execute SQL against PostgreSQL
    // const sql = this.getSchemaSQL(schemaName);
    // await pool.query(sql);
  }

  private async dropSchema(schemaName: string, mode: IsolationMode): Promise<void> {
    // In production: DROP SCHEMA IF EXISTS ${schemaName} CASCADE
  }

  private async createAdminUser(tenantId: string, email: string, name: string): Promise<void> {
    // In production: INSERT INTO ${schemaName}.users (email, name, role) VALUES (...)
  }

  private async createMinioBucket(tenantId: string): Promise<void> {
    // In production: minioClient.makeBucket(tenantId)
  }

  private async createMeilisearchIndex(tenantId: string): Promise<void> {
    // In production: meilisearch.createIndex(tenantId)
  }
}

// ── Tenant-Aware Database Middleware ──

export class TenantDBMiddleware {
  /**
   * Set the tenant context for the current database session.
   * Used for RLS (Row-Level Security) isolation mode.
   */
  static setTenantContextSQL(tenantId: string): string {
    return `SET LOCAL app.current_tenant = '${tenantId}';`;
  }

  /**
   * Get the search path for schema-per-tenant isolation.
   */
  static setSearchPathSQL(schemaName: string): string {
    return `SET search_path TO ${schemaName}, public;`;
  }
}

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantError';
  }
}

// ── Helpers ──

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = {...target};
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sv = source[key];
    const tv = target[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      (result as any)[key] = deepMerge(tv as any, sv as any);
    } else if (sv !== undefined) {
      (result as any)[key] = sv;
    }
  }
  return result;
}
