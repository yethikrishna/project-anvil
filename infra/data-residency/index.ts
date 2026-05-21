/**
 * Data Residency Configuration — per-region data routing.
 *
 * Ensures all PII and user data stays within the configured region.
 * Routes read/write operations to the correct regional database
 * and object storage based on organization settings.
 */

// ── Types ──

export type RegionCode = 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'eu-central-1' | 'ap-south-1' | 'ap-northeast-1';

export interface RegionConfig {
  code: RegionCode;
  name: string;
  country: string;
  databaseUrl: string;
  redisUrl: string;
  minioEndpoint: string;
  meilisearchUrl: string;
  compliantWith: ('GDPR' | 'HIPAA' | 'CCPA' | 'PDPA')[];
}

export interface DataResidencyPolicy {
  orgId: string;
  primaryRegion: RegionCode;
  /** Backup regions for disaster recovery (must be in same jurisdiction) */
  backupRegions: RegionCode[];
  /** Data types that must stay in-region */
  restrictedTypes: ('pii' | 'health' | 'financial' | 'communications')[];
  /** Whether cross-region reads are allowed for non-restricted data */
  allowCrossRegionReads: boolean;
  /** Jurisdiction (determines which regions are valid) */
  jurisdiction: 'US' | 'EU' | 'APAC' | 'GLOBAL';
  createdAt: string;
  updatedAt: string;
}

// ── Region Registry ──

export const REGIONS: Record<RegionCode, RegionConfig> = {
  'us-east-1': {
    code: 'us-east-1',
    name: 'US East (Virginia)',
    country: 'US',
    databaseUrl: process.env.DB_URL_US_EAST ?? 'postgresql://anvil:secret@us-east-db:5432/anvil',
    redisUrl: process.env.REDIS_URL_US_EAST ?? 'redis://us-east-redis:6379',
    minioEndpoint: process.env.MINIO_US_EAST ?? 'us-east-minio:9000',
    meilisearchUrl: process.env.MEILI_US_EAST ?? 'http://us-east-meili:7700',
    compliantWith: ['HIPAA', 'CCPA'],
  },
  'us-west-2': {
    code: 'us-west-2',
    name: 'US West (Oregon)',
    country: 'US',
    databaseUrl: process.env.DB_URL_US_WEST ?? 'postgresql://anvil:secret@us-west-db:5432/anvil',
    redisUrl: process.env.REDIS_URL_US_WEST ?? 'redis://us-west-redis:6379',
    minioEndpoint: process.env.MINIO_US_WEST ?? 'us-west-minio:9000',
    meilisearchUrl: process.env.MEILI_US_WEST ?? 'http://us-west-meili:7700',
    compliantWith: ['HIPAA', 'CCPA'],
  },
  'eu-west-1': {
    code: 'eu-west-1',
    name: 'EU West (Ireland)',
    country: 'IE',
    databaseUrl: process.env.DB_URL_EU_WEST ?? 'postgresql://anvil:secret@eu-west-db:5432/anvil',
    redisUrl: process.env.REDIS_URL_EU_WEST ?? 'redis://eu-west-redis:6379',
    minioEndpoint: process.env.MINIO_EU_WEST ?? 'eu-west-minio:9000',
    meilisearchUrl: process.env.MEILI_EU_WEST ?? 'http://eu-west-meili:7700',
    compliantWith: ['GDPR'],
  },
  'eu-central-1': {
    code: 'eu-central-1',
    name: 'EU Central (Frankfurt)',
    country: 'DE',
    databaseUrl: process.env.DB_URL_EU_CENTRAL ?? 'postgresql://anvil:secret@eu-central-db:5432/anvil',
    redisUrl: process.env.REDIS_URL_EU_CENTRAL ?? 'redis://eu-central-redis:6379',
    minioEndpoint: process.env.MINIO_EU_CENTRAL ?? 'eu-central-minio:9000',
    meilisearchUrl: process.env.MEILI_EU_CENTRAL ?? 'http://eu-central-meili:7700',
    compliantWith: ['GDPR'],
  },
  'ap-south-1': {
    code: 'ap-south-1',
    name: 'Asia Pacific (Mumbai)',
    country: 'IN',
    databaseUrl: process.env.DB_URL_AP_SOUTH ?? 'postgresql://anvil:secret@ap-south-db:5432/anvil',
    redisUrl: process.env.REDIS_URL_AP_SOUTH ?? 'redis://ap-south-redis:6379',
    minioEndpoint: process.env.MINIO_AP_SOUTH ?? 'ap-south-minio:9000',
    meilisearchUrl: process.env.MEILI_AP_SOUTH ?? 'http://ap-south-meili:7700',
    compliantWith: ['PDPA'],
  },
  'ap-northeast-1': {
    code: 'ap-northeast-1',
    name: 'Asia Pacific (Tokyo)',
    country: 'JP',
    databaseUrl: process.env.DB_URL_AP_NORTHEAST ?? 'postgresql://anvil:secret@ap-ne-db:5432/anvil',
    redisUrl: process.env.REDIS_URL_AP_NORTHEAST ?? 'redis://ap-ne-redis:6379',
    minioEndpoint: process.env.MINIO_AP_NORTHEAST ?? 'ap-ne-minio:9000',
    meilisearchUrl: process.env.MEILI_AP_NORTHEAST ?? 'http://ap-ne-meili:7700',
    compliantWith: ['PDPA'],
  },
};

// ── Jurisdiction Constraints ──

const JURISDICTION_REGIONS: Record<string, RegionCode[]> = {
  US: ['us-east-1', 'us-west-2'],
  EU: ['eu-west-1', 'eu-central-1'],
  APAC: ['ap-south-1', 'ap-northeast-1'],
  GLOBAL: Object.keys(REGIONS) as RegionCode[],
};

// ── Data Residency Router ──

export class DataResidencyRouter {
  private policies = new Map<string, DataResidencyPolicy>();

  /**
   * Set the data residency policy for an organization.
   */
  setPolicy(policy: DataResidencyPolicy): void {
    // Validate that primary region is allowed for the jurisdiction
    const allowedRegions = JURISDICTION_REGIONS[policy.jurisdiction] ?? [];
    if (!allowedRegions.includes(policy.primaryRegion)) {
      throw new DataResidencyError(
        `Region ${policy.primaryRegion} not allowed for jurisdiction ${policy.jurisdiction}. ` +
        `Allowed: ${allowedRegions.join(', ')}`
      );
    }

    // Validate backup regions
    for (const region of policy.backupRegions) {
      if (!allowedRegions.includes(region)) {
        throw new DataResidencyError(
          `Backup region ${region} not allowed for jurisdiction ${policy.jurisdiction}`
        );
      }
    }

    this.policies.set(policy.orgId, policy);
  }

  /**
   * Get the policy for an org.
   */
  getPolicy(orgId: string): DataResidencyPolicy | undefined {
    return this.policies.get(orgId);
  }

  /**
   * Get the regional configuration for an org's primary region.
   */
  getRegion(orgId: string): RegionConfig {
    const policy = this.policies.get(orgId);
    const region = policy?.primaryRegion ?? 'us-east-1';
    const config = REGIONS[region];
    if (!config) throw new DataResidencyError(`Unknown region: ${region}`);
    return config;
  }

  /**
   * Check if a data operation is allowed for the given org and region.
   */
  isOperationAllowed(
    orgId: string,
    targetRegion: RegionCode,
    dataType: 'pii' | 'health' | 'financial' | 'communications' | 'metadata',
  ): {allowed: boolean; reason?: string} {
    const policy = this.policies.get(orgId);
    if (!policy) return {allowed: true}; // No policy = allow all

    // Primary region always allowed
    if (targetRegion === policy.primaryRegion) {
      return {allowed: true};
    }

    // Backup regions allowed for non-restricted data
    if (policy.backupRegions.includes(targetRegion)) {
      if (policy.restrictedTypes.includes(dataType as any)) {
        return {
          allowed: false,
          reason: `${dataType} data must remain in primary region (${policy.primaryRegion})`,
        };
      }
      return {allowed: true};
    }

    // Cross-region reads
    if (policy.allowCrossRegionReads && dataType === 'metadata') {
      return {allowed: true};
    }

    return {
      allowed: false,
      reason: `Data residency policy restricts ${dataType} data to ${policy.jurisdiction} regions`,
    };
  }

  /**
   * Get all regions valid for a jurisdiction.
   */
  getRegionsForJurisdiction(jurisdiction: string): RegionConfig[] {
    const codes = JURISDICTION_REGIONS[jurisdiction] ?? [];
    return codes.map(c => REGIONS[c]).filter(Boolean);
  }

  /**
   * Validate compliance of a region with a regulation.
   */
  isRegionCompliant(region: RegionCode, regulation: 'GDPR' | 'HIPAA' | 'CCPA' | 'PDPA'): boolean {
    return REGIONS[region]?.compliantWith.includes(regulation) ?? false;
  }
}

export class DataResidencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataResidencyError';
  }
}

// ── Singleton ──

let routerInstance: DataResidencyRouter | null = null;

export function getDataResidencyRouter(): DataResidencyRouter {
  if (!routerInstance) {
    routerInstance = new DataResidencyRouter();
  }
  return routerInstance;
}
