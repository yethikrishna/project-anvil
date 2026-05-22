/**
 * @anvil/auth/scim — SCIM 2.0 Server implementation.
 *
 * Enables enterprise customers to auto-provision and deprovision users
 * from their IdP (Okta, Azure AD, OneLogin, Ping Identity, etc.).
 *
 * Spec: RFC 7643 (SCIM Core Schema) + RFC 7644 (SCIM Protocol)
 *
 * Features:
 * - SCIM 2.0 User and Group resources
 * - Bearer token authentication per tenant
 * - Full CRUD: create, read, update, patch, delete
 * - Filter support (eq, co, sw, pr) for User.userName, User.email
 * - Pagination (startIndex + count)
 * - Group membership provisioning → Anvil role mapping
 * - Just-in-Time provisioning with attribute mapping
 * - Audit log entries for every provisioning action
 * - Schema discovery endpoint (/scim/v2/ServiceProviderConfig)
 */

// ── SCIM Core Types (RFC 7643) ──

export interface SCIMUser {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'];
  id?: string;
  externalId?: string;
  userName: string;
  name?: {
    formatted?: string;
    familyName?: string;
    givenName?: string;
    middleName?: string;
    honorificPrefix?: string;
    honorificSuffix?: string;
  };
  displayName?: string;
  title?: string;
  active: boolean;
  emails?: Array<{value: string; type?: string; primary?: boolean}>;
  phoneNumbers?: Array<{value: string; type?: string}>;
  photos?: Array<{value: string; type?: string}>;
  groups?: Array<{value: string; display?: string}>;
  roles?: Array<{value: string; display?: string; primary?: boolean}>;
  // Enterprise extension
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'?: {
    employeeNumber?: string;
    costCenter?: string;
    organization?: string;
    division?: string;
    department?: string;
    manager?: {value: string; displayName?: string};
  };
  meta?: {
    resourceType: 'User';
    created?: string;
    lastModified?: string;
    location?: string;
    version?: string;
  };
}

export interface SCIMGroup {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'];
  id?: string;
  externalId?: string;
  displayName: string;
  members?: Array<{value: string; display?: string; '$ref'?: string}>;
  meta?: {
    resourceType: 'Group';
    created?: string;
    lastModified?: string;
    location?: string;
  };
}

export interface SCIMListResponse<T> {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface SCIMError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: number;
  scimType?: string;
  detail: string;
}

export type PatchOp = {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'];
  Operations: Array<{
    op: 'add' | 'replace' | 'remove';
    path?: string;
    value?: unknown;
  }>;
};

// ── Attribute mapping ──

export interface SCIMAttributeMap {
  /** SCIM attribute path → Anvil user field */
  userName?: string;       // defaults to 'email'
  givenName?: string;      // defaults to 'firstName'
  familyName?: string;     // defaults to 'lastName'
  displayName?: string;    // defaults to 'name'
  email?: string;          // which email attribute to use (primary)
  title?: string;          // maps to 'title' in metadata
  department?: string;     // maps to 'department' in metadata
  employeeNumber?: string; // maps to 'employeeId' in metadata
}

// ── Provisioning config per tenant ──

export interface SCIMConfig {
  tenantId: string;
  /** Bearer token (hashed in DB) */
  token: string;
  /** Attribute mapping overrides */
  attributeMap?: SCIMAttributeMap;
  /** Group → Anvil role mapping */
  groupRoleMap: Record<string, 'owner' | 'admin' | 'member' | 'viewer'>;
  /** Auto-create missing groups as teams */
  autoCreateGroups: boolean;
  /** Default role when no group match */
  defaultRole: 'admin' | 'member' | 'viewer';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Filter parser (RFC 7644 §3.4.2) ──

export interface SCIMFilter {
  attribute: string;
  operator: 'eq' | 'co' | 'sw' | 'ew' | 'pr' | 'gt' | 'ge' | 'lt' | 'le' | 'ne';
  value?: string;
}

export function parseFilter(filterStr: string): SCIMFilter | null {
  if (!filterStr) return null;

  // Handle presence filter: "active pr"
  const prMatch = filterStr.match(/^(\S+)\s+pr$/i);
  if (prMatch) {
    return {attribute: prMatch[1].toLowerCase(), operator: 'pr'};
  }

  // Handle comparison: "userName eq "jsmith@example.com""
  const compMatch = filterStr.match(/^(\S+)\s+(eq|co|sw|ew|gt|ge|lt|le|ne)\s+"?([^"]*)"?$/i);
  if (compMatch) {
    return {
      attribute: compMatch[1].toLowerCase(),
      operator: compMatch[2].toLowerCase() as SCIMFilter['operator'],
      value: compMatch[3],
    };
  }

  return null;
}

export function matchesFilter(user: SCIMUser, filter: SCIMFilter | null): boolean {
  if (!filter) return true;

  const getValue = (attr: string): string => {
    switch (attr) {
      case 'username': return user.userName ?? '';
      case 'emails': return user.emails?.find(e => e.primary)?.value ?? user.emails?.[0]?.value ?? '';
      case 'active': return String(user.active);
      case 'externalid': return user.externalId ?? '';
      case 'name.givenname': return user.name?.givenName ?? '';
      case 'name.familyname': return user.name?.familyName ?? '';
      default: return '';
    }
  };

  const v = getValue(filter.attribute);
  const fv = filter.value ?? '';

  switch (filter.operator) {
    case 'eq': return v.toLowerCase() === fv.toLowerCase();
    case 'co': return v.toLowerCase().includes(fv.toLowerCase());
    case 'sw': return v.toLowerCase().startsWith(fv.toLowerCase());
    case 'ew': return v.toLowerCase().endsWith(fv.toLowerCase());
    case 'pr': return v.length > 0;
    case 'ne': return v.toLowerCase() !== fv.toLowerCase();
    default: return false;
  }
}

// ── Attribute mapper (SCIM → Anvil user) ──

export interface AnvilUserData {
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  employeeId?: string;
  phone?: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  active: boolean;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export function scimUserToAnvil(
  scimUser: SCIMUser,
  config: Pick<SCIMConfig, 'attributeMap' | 'defaultRole'>,
  groupRoleMap: Record<string, string>,
): AnvilUserData {
  const attrMap = config.attributeMap ?? {};

  // Resolve primary email
  const primaryEmail = scimUser.emails?.find(e => e.primary)?.value
    ?? scimUser.emails?.[0]?.value
    ?? scimUser.userName;

  // Resolve name
  const firstName = scimUser.name?.givenName ?? '';
  const lastName = scimUser.name?.familyName ?? '';
  const name = scimUser.displayName
    ?? scimUser.name?.formatted
    ?? `${firstName} ${lastName}`.trim()
    || scimUser.userName;

  // Resolve role from group membership
  let resolvedRole: AnvilUserData['role'] = config.defaultRole;
  for (const group of scimUser.groups ?? []) {
    const display = group.display ?? '';
    const mapped = groupRoleMap[display] ?? groupRoleMap[group.value];
    if (mapped) {
      // Take highest-privilege role
      const roleOrder = {owner: 4, admin: 3, member: 2, viewer: 1};
      if ((roleOrder[mapped as keyof typeof roleOrder] ?? 0) > (roleOrder[resolvedRole] ?? 0)) {
        resolvedRole = mapped as AnvilUserData['role'];
      }
    }
  }

  // Enterprise extension
  const ext = scimUser['urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'];

  return {
    email: primaryEmail,
    name,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    title: scimUser.title || ext?.division || undefined,
    department: ext?.department || undefined,
    employeeId: ext?.employeeNumber || undefined,
    phone: scimUser.phoneNumbers?.[0]?.value || undefined,
    role: resolvedRole,
    active: scimUser.active,
    externalId: scimUser.externalId || scimUser.id,
    metadata: ext ? {...ext} : undefined,
  };
}

export function anvilUserToSCIM(
  user: AnvilUserData & {id: string; createdAt: string; updatedAt: string},
  baseUrl: string,
): SCIMUser {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: user.externalId,
    userName: user.email,
    name: {
      formatted: user.name,
      givenName: user.firstName,
      familyName: user.lastName,
    },
    displayName: user.name,
    title: user.title,
    active: user.active,
    emails: [{value: user.email, type: 'work', primary: true}],
    phoneNumbers: user.phone ? [{value: user.phone, type: 'work'}] : undefined,
    'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': {
      employeeNumber: user.employeeId,
      department: user.department,
    },
    meta: {
      resourceType: 'User',
      created: user.createdAt,
      lastModified: user.updatedAt,
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
      version: `W/"${user.updatedAt}"`,
    },
  };
}

// ── PATCH operation applier ──

export function applyPatch(user: SCIMUser, patch: PatchOp): SCIMUser {
  const updated = {...user};

  for (const op of patch.Operations) {
    const path = op.path?.toLowerCase() ?? '';

    if (op.op === 'replace' || op.op === 'add') {
      const value = op.value as Record<string, unknown>;

      if (!path || path === 'active') {
        if (value?.active !== undefined) updated.active = Boolean(value.active);
      }
      if (!path || path === 'displayname') {
        if (value?.displayName) updated.displayName = String(value.displayName);
      }
      if (!path || path === 'username') {
        if (value?.userName) updated.userName = String(value.userName);
      }
      if (path === 'active') {
        updated.active = Boolean(op.value);
      }
      if (path === 'name.givenname') {
        updated.name = {...updated.name, givenName: String(op.value)};
      }
      if (path === 'name.familyname') {
        updated.name = {...updated.name, familyName: String(op.value)};
      }
      if (path === 'emails') {
        updated.emails = Array.isArray(op.value) ? op.value as SCIMUser['emails'] : updated.emails;
      }
    } else if (op.op === 'remove') {
      if (path === 'active') updated.active = false;
    }
  }

  return updated;
}

// ── Service Provider Config (discovery) ──

export const SERVICE_PROVIDER_CONFIG = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
  documentationUri: 'https://docs.anvil.dev/enterprise/scim',
  patch: {supported: true},
  bulk: {supported: false, maxOperations: 0, maxPayloadSize: 0},
  filter: {supported: true, maxResults: 200},
  changePassword: {supported: false},
  sort: {supported: false},
  etag: {supported: true},
  authenticationSchemes: [
    {
      type: 'oauthbearertoken',
      name: 'OAuth Bearer Token',
      description: 'Authentication scheme using Bearer token.',
      documentationUri: 'https://docs.anvil.dev/enterprise/scim#auth',
      primary: true,
    },
  ],
  meta: {
    resourceType: 'ServiceProviderConfig',
    location: '/scim/v2/ServiceProviderConfig',
  },
};

// ── Token generation (for UI) ──

import {createHash, randomBytes} from 'crypto';

export function generateSCIMToken(): {token: string; tokenHash: string; prefix: string} {
  const raw = `scim_${randomBytes(32).toString('hex')}`;
  const prefix = raw.slice(0, 16);
  const hash = createHash('sha256').update(raw).digest('hex');
  return {token: raw, tokenHash: hash, prefix};
}

export function verifySCIMToken(rawToken: string, storedHash: string): boolean {
  const hash = createHash('sha256').update(rawToken).digest('hex');
  if (hash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < hash.length; i++) result |= hash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return result === 0;
}

// ── Response builders ──

export function scimListResponse<T>(
  items: T[],
  totalResults: number,
  startIndex = 1,
  count = 100,
): SCIMListResponse<T> {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults,
    startIndex,
    itemsPerPage: Math.min(count, items.length),
    Resources: items,
  };
}

export function scimError(status: number, detail: string, scimType?: string): SCIMError {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status,
    detail,
    ...(scimType ? {scimType} : {}),
  };
}
