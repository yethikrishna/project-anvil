/**
 * Database client for admin API.
 *
 * Wraps postgres with tenant context (RLS) and common queries.
 * Uses the DATABASE_URL env var or a configurable connection string.
 */

import {createHash, randomBytes} from 'crypto';

// ── Types ──

export interface DBUser {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'guest';
  status: 'active' | 'suspended' | 'invited' | 'deactivated';
  last_login_at: string | null;
  last_active_at: string | null;
  locale: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface DBAuditEntry {
  id: number;
  tenant_id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // Joined
  user_name?: string;
  user_email?: string;
}

export interface DBApiKey {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  status: 'active' | 'revoked';
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

// ── Database Client ──

export class AdminDB {
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString ?? process.env.DATABASE_URL ?? '';
  }

  /**
   * Execute a query with tenant context set for RLS.
   */
  private async queryWithTenant<T>(
    tenantId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    // In production: uses pg or postgres.js driver
    // SET LOCAL app.tenant_id = $tenantId; then execute query in same transaction
    //
    // const client = await pool.connect();
    // try {
    //   await client.query('BEGIN');
    //   await client.query(`SET LOCAL app.tenant_id = $1`, [tenantId]);
    //   const result = await client.query(sql, params);
    //   await client.query('COMMIT');
    //   return result.rows;
    // } catch (e) {
    //   await client.query('ROLLBACK');
    //   throw e;
    // } finally {
    //   client.release();
    // }
    return [] as T[];
  }

  // ── Users ──

  async listUsers(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      role?: string;
      status?: string;
    } = {},
  ): Promise<{users: DBUser[]; total: number}> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 25;
    const offset = (page - 1) * limit;

    let where = 'WHERE tenant_id = $1 AND deleted_at IS NULL';
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (options.search) {
      where += ` AND (name ILIKE $${paramIdx} OR email ILIKE $${paramIdx})`;
      params.push(`%${options.search}%`);
      paramIdx++;
    }
    if (options.role) {
      where += ` AND role = $${paramIdx}`;
      params.push(options.role);
      paramIdx++;
    }
    if (options.status) {
      where += ` AND status = $${paramIdx}`;
      params.push(options.status);
      paramIdx++;
    }

    const countSql = `SELECT COUNT(*) as total FROM users ${where}`;
    const dataSql = `
      SELECT id, tenant_id, email, name, display_name, avatar_url,
             role, status, last_login_at, last_active_at, locale, timezone,
             created_at, updated_at
      FROM users ${where}
      ORDER BY created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    params.push(limit, offset);

    // In production: execute both queries
    return {users: [], total: 0};
  }

  async getUser(tenantId: string, userId: string): Promise<DBUser | null> {
    const sql = `
      SELECT id, tenant_id, email, name, display_name, avatar_url,
             role, status, last_login_at, last_active_at, locale, timezone,
             created_at, updated_at
      FROM users
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
    `;
    const rows = await this.queryWithTenant<DBUser>(tenantId, sql, [tenantId, userId]);
    return rows[0] ?? null;
  }

  async createUser(
    tenantId: string,
    data: {
      email: string;
      name: string;
      role?: string;
      passwordHash?: string;
    },
  ): Promise<DBUser> {
    const id = randomUUID();
    const sql = `
      INSERT INTO users (id, tenant_id, email, name, role, password_hash, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING *
    `;
    const rows = await this.queryWithTenant<DBUser>(tenantId, sql, [
      id, tenantId, data.email, data.name, data.role ?? 'member', data.passwordHash,
    ]);
    return rows[0];
  }

  async updateUser(
    tenantId: string,
    userId: string,
    updates: Partial<Pick<DBUser, 'name' | 'display_name' | 'role' | 'status' | 'timezone' | 'locale'>>,
  ): Promise<DBUser | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [tenantId, userId];
    let idx = 3;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    if (setClauses.length === 0) return this.getUser(tenantId, userId);

    setClauses.push(`updated_at = NOW()`);
    const sql = `
      UPDATE users SET ${setClauses.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const rows = await this.queryWithTenant<DBUser>(tenantId, sql, params);
    return rows[0] ?? null;
  }

  async deleteUser(tenantId: string, userId: string): Promise<boolean> {
    const sql = `
      UPDATE users SET deleted_at = NOW(), status = 'deactivated', updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
    `;
    await this.queryWithTenant<DBUser>(tenantId, sql, [tenantId, userId]);
    return true;
  }

  async inviteUser(
    tenantId: string,
    email: string,
    role: string,
    invitedBy: string,
  ): Promise<{token: string; expires: string}> {
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const sql = `
      INSERT INTO invitations (tenant_id, email, role, invited_by, token, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING token, expires_at
    `;
    await this.queryWithTenant(tenantId, sql, [tenantId, email, role, invitedBy, token, expires]);
    return {token, expires};
  }

  // ── Audit Log ──

  async listAuditLog(
    tenantId: string,
    options: {
      page?: number;
      limit?: number;
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ): Promise<{entries: DBAuditEntry[]; total: number}> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const offset = (page - 1) * limit;

    let where = 'WHERE a.tenant_id = $1';
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (options.userId) {
      where += ` AND a.user_id = $${idx}`;
      params.push(options.userId);
      idx++;
    }
    if (options.action) {
      where += ` AND a.action = $${idx}`;
      params.push(options.action);
      idx++;
    }
    if (options.startDate) {
      where += ` AND a.created_at >= $${idx}`;
      params.push(options.startDate);
      idx++;
    }
    if (options.endDate) {
      where += ` AND a.created_at < $${idx}`;
      params.push(options.endDate);
      idx++;
    }

    const dataSql = `
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    return {entries: [], total: 0};
  }

  // ── API Keys ──

  async listApiKeys(tenantId: string): Promise<DBApiKey[]> {
    const sql = `
      SELECT id, tenant_id, user_id, name, key_prefix, permissions, status,
             last_used_at, expires_at, created_at
      FROM api_keys
      WHERE tenant_id = $1
      ORDER BY created_at DESC
    `;
    return this.queryWithTenant<DBApiKey>(tenantId, sql, [tenantId]);
  }

  async createApiKey(
    tenantId: string,
    userId: string,
    name: string,
    permissions: string[],
  ): Promise<{id: string; key: string; prefix: string}> {
    const rawKey = `avk_${randomBytes(24).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const id = randomUUID();

    const sql = `
      INSERT INTO api_keys (id, tenant_id, user_id, name, key_prefix, key_hash, permissions, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
    `;
    await this.queryWithTenant(tenantId, sql, [id, tenantId, userId, name, prefix, keyHash, permissions]);

    return {id, key: rawKey, prefix};
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<boolean> {
    const sql = `
      UPDATE api_keys SET status = 'revoked'
      WHERE tenant_id = $1 AND id = $2 AND status = 'active'
    `;
    await this.queryWithTenant(tenantId, sql, [tenantId, keyId]);
    return true;
  }

  // ── Organization Settings ──

  async getOrgSettings(tenantId: string): Promise<Record<string, unknown> | null> {
    const sql = `
      SELECT t.*, tc.*
      FROM tenants t
      JOIN tenant_config tc ON tc.tenant_id = t.id
      WHERE t.id = $1
    `;
    const rows = await this.queryWithTenant(tenantId, sql, [tenantId]);
    return rows[0] as Record<string, unknown> | null;
  }

  async updateOrgSettings(
    tenantId: string,
    updates: {
      name?: string;
      branding?: Record<string, unknown>;
      features?: Record<string, unknown>;
      limits?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (updates.name) {
      await this.queryWithTenant(
        tenantId,
        `UPDATE tenants SET name = $2, updated_at = NOW() WHERE id = $1`,
        [tenantId, updates.name],
      );
    }

    const configUpdates: string[] = [];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (updates.branding) {
      configUpdates.push(`branding = $${idx}`);
      params.push(JSON.stringify(updates.branding));
      idx++;
    }
    if (updates.features) {
      configUpdates.push(`features = $${idx}`);
      params.push(JSON.stringify(updates.features));
      idx++;
    }
    if (updates.limits) {
      configUpdates.push(`limits = $${idx}`);
      params.push(JSON.stringify(updates.limits));
      idx++;
    }

    if (configUpdates.length > 0) {
      configUpdates.push('updated_at = NOW()');
      await this.queryWithTenant(
        tenantId,
        `UPDATE tenant_config SET ${configUpdates.join(', ')} WHERE tenant_id = $1`,
        params,
      );
    }
  }

  // ── SAML IdPs ──

  async listSamlIdps(tenantId: string) {
    const sql = `SELECT * FROM saml_idps WHERE tenant_id = $1 ORDER BY created_at DESC`;
    return this.queryWithTenant(tenantId, sql, [tenantId]);
  }

  async createSamlIdp(
    tenantId: string,
    data: {
      name: string;
      entityId: string;
      ssoUrl: string;
      sloUrl?: string;
      certificate: string;
      attributeMap?: Record<string, string>;
    },
  ) {
    const sql = `
      INSERT INTO saml_idps (tenant_id, name, entity_id, sso_url, slo_url, certificate, attribute_map)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const rows = await this.queryWithTenant(tenantId, sql, [
      tenantId, data.name, data.entityId, data.ssoUrl,
      data.sloUrl ?? null, data.certificate,
      JSON.stringify(data.attributeMap ?? {}),
    ]);
    return rows[0];
  }

  async deleteSamlIdp(tenantId: string, idpId: string) {
    const sql = `DELETE FROM saml_idps WHERE tenant_id = $1 AND id = $2`;
    await this.queryWithTenant(tenantId, sql, [tenantId, idpId]);
  }

  // ── LDAP Connections ──

  async listLdapConnections(tenantId: string) {
    const sql = `
      SELECT id, tenant_id, name, url, bind_dn, search_base, search_filter,
             group_base, use_tls, active_directory, role_mappings, sync_interval,
             last_sync_at, active, created_at, updated_at
      FROM ldap_connections WHERE tenant_id = $1 ORDER BY created_at DESC
    `;
    return this.queryWithTenant(tenantId, sql, [tenantId]);
  }

  async createLdapConnection(
    tenantId: string,
    data: {
      name: string;
      url: string;
      bindDn: string;
      bindPassword: string;
      searchBase: string;
      searchFilter?: string;
      groupBase?: string;
      useTls?: boolean;
      activeDirectory?: boolean;
      roleMappings?: Array<{ldapGroup: string; anvilRole: string; priority: number}>;
      syncInterval?: number;
    },
  ) {
    const sql = `
      INSERT INTO ldap_connections (tenant_id, name, url, bind_dn, bind_password, search_base,
        search_filter, group_base, use_tls, active_directory, role_mappings, sync_interval)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    // bind_password should be encrypted before storage
    const rows = await this.queryWithTenant(tenantId, sql, [
      tenantId, data.name, data.url, data.bindDn, data.bindPassword,
      data.searchBase, data.searchFilter ?? '(mail={{username}})',
      data.groupBase ?? null, data.useTls ?? true, data.activeDirectory ?? false,
      JSON.stringify(data.roleMappings ?? []),
      data.syncInterval ?? 3600,
    ]);
    return rows[0];
  }

  async deleteLdapConnection(tenantId: string, connId: string) {
    const sql = `DELETE FROM ldap_connections WHERE tenant_id = $1 AND id = $2`;
    await this.queryWithTenant(tenantId, sql, [tenantId, connId]);
  }

  // ── MFA Policy ──

  async getMfaPolicy(tenantId: string) {
    const sql = `SELECT * FROM mfa_policies WHERE tenant_id = $1`;
    const rows = await this.queryWithTenant(tenantId, sql, [tenantId]);
    return rows[0] ?? null;
  }

  async updateMfaPolicy(
    tenantId: string,
    policy: string,
    options: {
      allowedMethods?: string[];
      gracePeriodDays?: number;
      excludedRoles?: string[];
    },
  ) {
    const sql = `
      INSERT INTO mfa_policies (tenant_id, policy, allowed_methods, grace_period_days, excluded_roles, enforcement_started, updated_at)
      VALUES ($1, $2, $3, $4, $5,
        CASE WHEN $2 = 'required_with_grace' THEN NOW() ELSE NULL END,
        NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        policy = $2, allowed_methods = $3, grace_period_days = $4, excluded_roles = $5, updated_at = NOW()
      RETURNING *
    `;
    const rows = await this.queryWithTenant(tenantId, sql, [
      tenantId, policy,
      options.allowedMethods ?? ['totp', 'webauthn'],
      options.gracePeriodDays ?? 14,
      options.excludedRoles ?? [],
    ]);
    return rows[0];
  }

  // ── Billing ──

  async getBillingAccount(tenantId: string) {
    const sql = `SELECT * FROM billing_accounts WHERE tenant_id = $1`;
    const rows = await this.queryWithTenant(tenantId, sql, [tenantId]);
    return rows[0] ?? null;
  }

  async getUsage(tenantId: string, period?: string) {
    const p = period ?? new Date().toISOString().slice(0, 7);
    const sql = `SELECT * FROM usage_monthly WHERE tenant_id = $1 AND period = $2`;
    const rows = await this.queryWithTenant(tenantId, sql, [tenantId, p]);
    return rows[0] ?? null;
  }

  // ── SCIM Provisioning ──

  async lookupSCIMToken(rawToken: string): Promise<string | null> {
    const {createHash} = await import('crypto');
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const sql = `
      SELECT tenant_id FROM scim_tokens
      WHERE token_hash = $1 AND active = true
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    // In production: pool query (no tenant context needed for token lookup)
    // const rows = await pool.query(sql, [hash]);
    // return rows.rows[0]?.tenant_id ?? null;
    return null; // stub — replace with real pool query
  }

  async createSCIMToken(
    tenantId: string,
    label: string,
  ): Promise<{id: string; token: string; prefix: string}> {
    const {generateSCIMToken} = await import('@anvil/auth/scim');
    const {token, tokenHash, prefix} = generateSCIMToken();
    const id = randomUUID();

    const sql = `
      INSERT INTO scim_tokens (id, tenant_id, label, token_hash, prefix, active)
      VALUES ($1, $2, $3, $4, $5, true)
    `;
    await this.queryWithTenant(tenantId, sql, [id, tenantId, label, tokenHash, prefix]);
    return {id, token, prefix};
  }

  async listSCIMTokens(tenantId: string) {
    const sql = `
      SELECT id, tenant_id, label, prefix, active, created_at, last_used_at
      FROM scim_tokens WHERE tenant_id = $1 ORDER BY created_at DESC
    `;
    return this.queryWithTenant(tenantId, sql, [tenantId]);
  }

  async revokeSCIMToken(tenantId: string, tokenId: string): Promise<boolean> {
    const sql = `UPDATE scim_tokens SET active = false WHERE tenant_id = $1 AND id = $2`;
    await this.queryWithTenant(tenantId, sql, [tenantId, tokenId]);
    return true;
  }

  async getSCIMConfig(tenantId: string) {
    const sql = `SELECT * FROM scim_configs WHERE tenant_id = $1`;
    const rows = await this.queryWithTenant<any>(tenantId, sql, [tenantId]);
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      token: '',
      groupRoleMap: row.group_role_map ?? {},
      autoCreateGroups: row.auto_create_groups ?? false,
      defaultRole: row.default_role ?? 'member',
      enabled: row.enabled ?? true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsertSCIMConfig(
    tenantId: string,
    config: {
      groupRoleMap?: Record<string, string>;
      autoCreateGroups?: boolean;
      defaultRole?: string;
      enabled?: boolean;
    },
  ) {
    const sql = `
      INSERT INTO scim_configs (tenant_id, group_role_map, auto_create_groups, default_role, enabled)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id) DO UPDATE SET
        group_role_map = $2,
        auto_create_groups = $3,
        default_role = $4,
        enabled = $5,
        updated_at = NOW()
      RETURNING *
    `;
    const rows = await this.queryWithTenant(tenantId, sql, [
      tenantId,
      JSON.stringify(config.groupRoleMap ?? {}),
      config.autoCreateGroups ?? false,
      config.defaultRole ?? 'member',
      config.enabled ?? true,
    ]);
    return rows[0];
  }

  async listUsersForSCIM(
    tenantId: string,
    options: {startIndex: number; count: number; filter?: string},
  ): Promise<{users: any[]; total: number}> {
    // Full implementation delegates to listUsers with SCIM-aware projection
    return this.listUsers(tenantId, {
      page: Math.ceil(options.startIndex / options.count),
      limit: options.count,
    }).then(({users, total}) => ({users, total}));
  }

  async getUserForSCIM(tenantId: string, userId: string) {
    const user = await this.getUser(tenantId, userId);
    if (!user) return null;
    return {
      ...user,
      email: user.email,
      name: user.name,
      active: user.status === 'active',
      externalId: (user as any).external_id ?? undefined,
    };
  }

  async findUserByEmail(tenantId: string, email: string): Promise<DBUser | null> {
    const sql = `
      SELECT * FROM users
      WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL
    `;
    const rows = await this.queryWithTenant<DBUser>(tenantId, sql, [tenantId, email]);
    return rows[0] ?? null;
  }

  async createUserFromSCIM(
    tenantId: string,
    data: {
      email: string;
      name: string;
      role: string;
      active: boolean;
      title?: string;
      department?: string;
    },
    externalId?: string,
  ): Promise<DBUser> {
    const id = randomUUID();
    const status = data.active ? 'active' : 'deactivated';
    const sql = `
      INSERT INTO users (id, tenant_id, email, name, role, status, external_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const metadata = JSON.stringify({
      scimProvisioned: true,
      title: data.title,
      department: data.department,
    });
    const rows = await this.queryWithTenant<DBUser>(tenantId, sql, [
      id, tenantId, data.email, data.name,
      data.role ?? 'member', status,
      externalId ?? null, metadata,
    ]);
    return rows[0] ?? {id, tenant_id: tenantId, email: data.email, name: data.name, role: data.role as any, status: status as any, created_at: new Date().toISOString(), updated_at: new Date().toISOString()} as DBUser;
  }

  async updateUserFromSCIM(
    tenantId: string,
    userId: string,
    data: {
      email?: string;
      name?: string;
      role?: string;
      active?: boolean;
      title?: string;
      department?: string;
    },
  ) {
    const updates: Partial<Pick<DBUser, 'name' | 'role' | 'status'>> = {};
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role as any;
    if (data.active !== undefined) updates.status = data.active ? 'active' : 'deactivated';
    const updated = await this.updateUser(tenantId, userId, updates);
    if (!updated) return null;
    return {
      ...updated,
      active: updated.status === 'active',
      externalId: (updated as any).external_id ?? undefined,
    };
  }

  async deactivateUserFromSCIM(tenantId: string, userId: string): Promise<void> {
    await this.updateUser(tenantId, userId, {status: 'deactivated'});
  }

  async revokeUserSessions(tenantId: string, userId: string): Promise<void> {
    const sql = `
      UPDATE user_sessions SET revoked_at = NOW()
      WHERE tenant_id = $1 AND user_id = $2 AND revoked_at IS NULL
    `;
    await this.queryWithTenant(tenantId, sql, [tenantId, userId]).catch(() => {});
  }

  async writeAuditLog(
    tenantId: string,
    userId: string | null,
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const sql = `
      INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await this.queryWithTenant(tenantId, sql, [
      tenantId, userId, action, resourceType, resourceId, JSON.stringify(details),
    ]).catch((e) => console.error('[audit] write failed:', e));
  }
}

// ── Singleton ──

let dbInstance: AdminDB | null = null;

export function getAdminDB(): AdminDB {
  if (!dbInstance) {
    dbInstance = new AdminDB();
  }
  return dbInstance;
}

// ── Helpers ──

function randomUUID(): string {
  return crypto.randomUUID();
}
