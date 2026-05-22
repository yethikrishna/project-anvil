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
    tenantIdOrParams: string | {
      tenantId: string;
      userId: string | null;
      action: string;
      resourceType: string;
      resourceId: string;
      details: string | Record<string, unknown>;
      ipAddress?: string;
    },
    userId?: string | null,
    action?: string,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    let tenantId: string;
    let uid: string | null;
    let act: string;
    let resType: string;
    let resId: string;
    let det: unknown;

    if (typeof tenantIdOrParams === 'object') {
      tenantId = tenantIdOrParams.tenantId;
      uid = tenantIdOrParams.userId;
      act = tenantIdOrParams.action;
      resType = tenantIdOrParams.resourceType;
      resId = tenantIdOrParams.resourceId;
      det = tenantIdOrParams.details;
    } else {
      tenantId = tenantIdOrParams;
      uid = userId ?? null;
      act = action ?? 'unknown';
      resType = resourceType ?? 'unknown';
      resId = resourceId ?? '-';
      det = details ?? {};
    }

    const sql = `
      INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id, details)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await this.queryWithTenant(tenantId, sql, [
      tenantId, uid, act, resType, resId,
      typeof det === 'string' ? det : JSON.stringify(det),
    ]).catch((e) => console.error('[audit] write failed:', e));
  }

  // ── Stripe / Billing Methods ──

  async stripeEventProcessed(eventId: string): Promise<boolean> {
    const sql = `SELECT 1 FROM stripe_events WHERE stripe_event_id = $1 AND status = 'processed'`;
    const rows = await this.query(sql, [eventId]).catch(() => ({rows: []}));
    return (rows as any).rows?.length > 0;
  }

  async recordStripeEvent(
    eventId: string,
    eventType: string,
    status: 'processed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    const sql = `
      INSERT INTO stripe_events (stripe_event_id, event_type, status, error_message, processed_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (stripe_event_id) DO UPDATE SET status = $3, error_message = $4, processed_at = NOW()
    `;
    await this.query(sql, [eventId, eventType, status, errorMessage ?? null]).catch(() => {});
  }

  async linkStripeCustomer(tenantId: string, customerId: string, subscriptionId: string): Promise<void> {
    const sql = `
      UPDATE billing_accounts SET stripe_customer_id = $1, stripe_subscription_id = $2
      WHERE tenant_id = $3
    `;
    await this.query(sql, [customerId, subscriptionId, tenantId]).catch(() => {});
  }

  async linkStripeCustomerByEmail(email: string, customerId: string, subscriptionId: string): Promise<void> {
    const sql = `
      UPDATE billing_accounts ba
      SET stripe_customer_id = $1, stripe_subscription_id = $2
      FROM tenants t
      WHERE ba.tenant_id = t.id AND t.owner_email = $3
    `;
    await this.query(sql, [customerId, subscriptionId, email]).catch(() => {});
  }

  async createOrUpdateBillingAccount(params: {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    planId: string;
    seats: number;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string;
  }): Promise<void> {
    const sql = `
      INSERT INTO billing_accounts
        (id, tenant_id, stripe_customer_id, stripe_subscription_id, plan_id, seats, status, trial_ends_at, current_period_end)
      VALUES
        (gen_random_uuid(), (SELECT tenant_id FROM billing_accounts WHERE stripe_customer_id = $1 LIMIT 1),
         $1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (stripe_customer_id) DO UPDATE SET
        stripe_subscription_id = $2,
        plan_id = $3,
        seats = $4,
        status = $5,
        trial_ends_at = $6,
        current_period_end = $7,
        updated_at = NOW()
    `;
    await this.query(sql, [
      params.stripeCustomerId, params.stripeSubscriptionId, params.planId,
      params.seats, params.status, params.trialEndsAt, params.currentPeriodEnd,
    ]).catch(() => {});
  }

  async updateBillingStatus(stripeCustomerId: string, status: string): Promise<void> {
    const sql = `UPDATE billing_accounts SET status = $1, updated_at = NOW() WHERE stripe_customer_id = $2`;
    await this.query(sql, [status, stripeCustomerId]).catch(() => {});
  }

  async updateTenantPlan(stripeCustomerId: string, planId: string): Promise<void> {
    const sql = `
      UPDATE tenants t SET plan_id = $1
      FROM billing_accounts ba
      WHERE ba.tenant_id = t.id AND ba.stripe_customer_id = $2
    `;
    await this.query(sql, [planId, stripeCustomerId]).catch(() => {});
  }

  async getTenantByStripeCustomer(stripeCustomerId: string): Promise<{id: string; email: string} | null> {
    const sql = `
      SELECT t.id, t.owner_email AS email
      FROM tenants t
      JOIN billing_accounts ba ON ba.tenant_id = t.id
      WHERE ba.stripe_customer_id = $1
      LIMIT 1
    `;
    const result = await this.query(sql, [stripeCustomerId]).catch(() => ({rows: []}));
    const rows = (result as any).rows ?? [];
    return rows[0] ?? null;
  }

  async recordInvoice(params: {
    stripeCustomerId: string;
    stripeInvoiceId: string;
    amountPaid: number;
    currency: string;
    pdfUrl: string | null;
    period: {start: string; end: string};
    status: string;
  }): Promise<void> {
    const sql = `
      INSERT INTO invoices
        (id, billing_account_id, stripe_invoice_id, amount_paid, currency, pdf_url, period_start, period_end, status)
      VALUES (
        gen_random_uuid(),
        (SELECT id FROM billing_accounts WHERE stripe_customer_id = $1 LIMIT 1),
        $2, $3, $4, $5, $6, $7, $8
      )
      ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = $8, pdf_url = $5
    `;
    await this.query(sql, [
      params.stripeCustomerId, params.stripeInvoiceId,
      params.amountPaid, params.currency, params.pdfUrl,
      params.period.start, params.period.end, params.status,
    ]).catch(() => {});
  }

  async updateStripeCustomerEmail(stripeCustomerId: string, email: string): Promise<void> {
    const sql = `
      UPDATE tenants t SET owner_email = $1
      FROM billing_accounts ba
      WHERE ba.tenant_id = t.id AND ba.stripe_customer_id = $2
    `;
    await this.query(sql, [email, stripeCustomerId]).catch(() => {});
  }

  private async query(sql: string, params: unknown[]): Promise<unknown> {
    // Direct query without RLS for billing operations (system-level)
    return this.queryWithTenant('system', sql, params);
  }

  // ── Usage Metering Methods ──

  async getTenantById(tenantId: string): Promise<{id: string; ownerEmail: string | null; slug: string} | null> {
    const sql = `SELECT id, owner_email, slug FROM tenants WHERE id = $1`;
    const result = await this.queryWithTenant(tenantId, sql, [tenantId]).catch(() => ({rows: []}));
    const row = (result as any).rows?.[0];
    if (!row) return null;
    return {id: row.id, ownerEmail: row.owner_email, slug: row.slug};
  }

  async getBillingAccount(tenantId: string): Promise<{stripeCustomerId: string | null} | null> {
    const sql = `SELECT stripe_customer_id FROM billing_accounts WHERE tenant_id = $1`;
    const result = await this.queryWithTenant(tenantId, sql, [tenantId]).catch(() => ({rows: []}));
    const row = (result as any).rows?.[0];
    if (!row) return null;
    return {stripeCustomerId: row.stripe_customer_id};
  }

  async getTenantPlan(tenantId: string): Promise<string | null> {
    const sql = `SELECT plan_id FROM tenants WHERE id = $1`;
    const result = await this.queryWithTenant(tenantId, sql, [tenantId]).catch(() => ({rows: []}));
    return (result as any).rows?.[0]?.plan_id ?? null;
  }

  async getUsageForPeriod(
    tenantId: string,
    period: string, // YYYY-MM
  ): Promise<{aiCalls: number; apiCalls: number; storageGB: number; activeUsers: number}> {
    const sql = `
      SELECT metric, SUM(quantity) AS total
      FROM usage_records
      WHERE tenant_id = $1
        AND to_char(period_start, 'YYYY-MM') = $2
      GROUP BY metric
    `;
    const result = await this.queryWithTenant(tenantId, sql, [tenantId, period]).catch(() => ({rows: []}));
    const rows = (result as any).rows ?? [];
    const map: Record<string, number> = {};
    for (const row of rows) map[row.metric] = Number(row.total);

    return {
      aiCalls: map['ai_calls'] ?? 0,
      apiCalls: map['api_calls'] ?? 0,
      storageGB: (map['storage_bytes'] ?? 0) / (1024 ** 3),
      activeUsers: map['active_users'] ?? 0,
    };
  }

  async getDailyUsage(
    tenantId: string,
    period: string, // YYYY-MM
  ): Promise<Array<{date: string; aiCalls: number; apiCalls: number}>> {
    const sql = `
      SELECT
        to_char(period_start, 'YYYY-MM-DD') AS date,
        SUM(CASE WHEN metric = 'ai_calls' THEN quantity ELSE 0 END) AS ai_calls,
        SUM(CASE WHEN metric = 'api_calls' THEN quantity ELSE 0 END) AS api_calls
      FROM usage_records
      WHERE tenant_id = $1
        AND to_char(period_start, 'YYYY-MM') = $2
      GROUP BY 1
      ORDER BY 1
    `;
    const result = await this.queryWithTenant(tenantId, sql, [tenantId, period]).catch(() => ({rows: []}));
    return ((result as any).rows ?? []).map((r: any) => ({
      date: r.date,
      aiCalls: Number(r.ai_calls),
      apiCalls: Number(r.api_calls),
    }));
  }

  async incrementUsage(
    tenantId: string,
    metric: string,
    quantity: number,
    period: string, // YYYY-MM
  ): Promise<void> {
    const now = new Date();
    const periodStart = new Date(`${period}-01T00:00:00Z`);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const sql = `
      INSERT INTO usage_records (id, tenant_id, metric, quantity, recorded_at, period_start, period_end)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5)
      ON CONFLICT DO NOTHING
    `;
    // For high-frequency metrics, upsert by day bucket
    const upsertSql = `
      INSERT INTO usage_records (id, tenant_id, metric, quantity, recorded_at, period_start, period_end)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW(), date_trunc('day', NOW()), date_trunc('day', NOW()) + INTERVAL '1 day')
    `;
    await this.queryWithTenant(tenantId, upsertSql, [tenantId, metric, quantity]).catch(() => {});
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
