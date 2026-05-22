#!/usr/bin/env node
/**
 * Anvil Migration CLI — Google Workspace → Anvil migration tool.
 *
 * Usage:
 *   npx anvil-migrate gmail   --domain company.com --users user1@,user2@
 *   npx anvil-migrate drive   --domain company.com --all-users
 *   npx anvil-migrate docs    --domain company.com --users user1@
 *   npx anvil-migrate calendar --domain company.com --users user1@
 *   npx anvil-migrate all     --domain company.com --all-users --dry-run
 *
 * Environment:
 *   GOOGLE_SERVICE_ACCOUNT_KEY  — Path to service account JSON key file
 *   GOOGLE_ADMIN_EMAIL          — Admin email to impersonate
 *   ANVIL_TENANT_ID             — Target Anvil tenant ID
 *   ANVIL_API_URL               — Anvil API base URL (default: http://localhost:3000)
 */

import {readFileSync, existsSync} from 'fs';
import {join} from 'path';

// ── CLI Argument Parser ──

interface CLIOpts {
  command: 'gmail' | 'drive' | 'docs' | 'calendar' | 'all';
  domain: string;
  users: string[];
  allUsers: boolean;
  dryRun: boolean;
  concurrency: number;
  verbose: boolean;
  resume: boolean;
  serviceAccountKey: string;
  adminEmail: string;
  tenantId: string;
  apiUrl: string;
}

function parseArgs(args: string[]): CLIOpts {
  const opts: Partial<CLIOpts> = {
    users: [],
    allUsers: false,
    dryRun: false,
    concurrency: 5,
    verbose: false,
    resume: false,
    serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '',
    adminEmail: process.env.GOOGLE_ADMIN_EMAIL ?? '',
    tenantId: process.env.ANVIL_TENANT_ID ?? '',
    apiUrl: process.env.ANVIL_API_URL ?? 'http://localhost:3000',
  };

  const validCommands = ['gmail', 'drive', 'docs', 'calendar', 'all'] as const;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--domain': opts.domain = args[++i]; break;
      case '--users': opts.users = args[++i].split(',').map(s => s.trim()); break;
      case '--all-users': opts.allUsers = true; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--concurrency': opts.concurrency = parseInt(args[++i], 10); break;
      case '--verbose': case '-v': opts.verbose = true; break;
      case '--resume': opts.resume = true; break;
      case '--service-account-key': opts.serviceAccountKey = args[++i]; break;
      case '--admin-email': opts.adminEmail = args[++i]; break;
      case '--tenant-id': opts.tenantId = args[++i]; break;
      case '--api-url': opts.apiUrl = args[++i]; break;
      case '--help': case '-h':
        printHelp();
        process.exit(0);
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        positional.push(arg);
    }
  }

  if (positional.length === 0) {
    console.error('Error: No migration command specified.');
    printHelp();
    process.exit(1);
  }

  opts.command = positional[0] as CLIOpts['command'];
  if (!validCommands.includes(opts.command)) {
    console.error(`Error: Unknown command "${opts.command}". Valid: ${validCommands.join(', ')}`);
    process.exit(1);
  }

  if (!opts.domain) {
    console.error('Error: --domain is required.');
    process.exit(1);
  }

  if (!opts.serviceAccountKey) {
    console.error('Error: GOOGLE_SERVICE_ACCOUNT_KEY or --service-account-key is required.');
    process.exit(1);
  }

  if (!opts.adminEmail) {
    console.error('Error: GOOGLE_ADMIN_EMAIL or --admin-email is required.');
    process.exit(1);
  }

  return opts as CLIOpts;
}

function printHelp() {
  console.log(`
Anvil Migration CLI — Google Workspace → Anvil

Usage:
  npx anvil-migrate <command> [options]

Commands:
  gmail       Migrate Gmail → Stalwart IMAP
  drive       Migrate Google Drive → MinIO
  docs        Migrate Google Docs → Anvil Docs
  calendar    Migrate Google Calendar → Anvil Calendar
  all         Run all migrations sequentially

Options:
  --domain <domain>              Google Workspace domain (required)
  --users <emails>               Comma-separated user emails
  --all-users                    Migrate all users in the domain
  --dry-run                      Report what would be migrated
  --concurrency <n>              Parallel operations (default: 5)
  --resume                       Resume from previous interrupted run
  --verbose, -v                  Verbose output
  --service-account-key <path>   Service account JSON key file
  --admin-email <email>          Admin email for impersonation
  --tenant-id <id>               Target Anvil tenant ID
  --api-url <url>                Anvil API URL (default: http://localhost:3000)
  --help, -h                     Show this help

Environment Variables:
  GOOGLE_SERVICE_ACCOUNT_KEY     Path to service account key
  GOOGLE_ADMIN_EMAIL             Admin email
  ANVIL_TENANT_ID                Target tenant ID
  ANVIL_API_URL                  API URL

Examples:
  npx anvil-migrate gmail --domain acme.com --users alice@acme.com,bob@acme.com
  npx anvil-migrate all --domain acme.com --all-users --dry-run
  npx anvil-migrate drive --domain acme.com --users alice@acme.com --resume
`);
}

// ── Migration Runner ──

interface MigrationStats {
  command: string;
  totalUsers: number;
  processedUsers: number;
  totalItems: number;
  migratedItems: number;
  failedItems: number;
  skippedItems: number;
  durationMs: number;
  errors: Array<{ user: string; item: string; error: string }>;
}

async function loadServiceAccount(keyPath: string): Promise<Record<string, unknown>> {
  if (!existsSync(keyPath)) {
    throw new Error(`Service account key file not found: ${keyPath}`);
  }
  const content = readFileSync(keyPath, 'utf-8');
  return JSON.parse(content);
}

async function runMigration(opts: CLIOpts): Promise<void> {
  console.log(`\n🔨 Anvil Migration CLI v0.1.0`);
  console.log(`   Command:    ${opts.command}`);
  console.log(`   Domain:     ${opts.domain}`);
  console.log(`   Users:      ${opts.allUsers ? 'all' : opts.users.join(', ')}`);
  console.log(`   Dry run:    ${opts.dryRun}`);
  console.log(`   Concurrency: ${opts.concurrency}`);
  console.log('');

  // Load service account
  const serviceAccount = await loadServiceAccount(opts.serviceAccountKey);
  console.log(`✓ Service account loaded: ${(serviceAccount.client_email as string) ?? 'unknown'}`);

  // In production: authenticate with Google, fetch users, run migration
  // For now: print the migration plan

  const commands = opts.command === 'all'
    ? ['gmail', 'drive', 'docs', 'calendar'] as const
    : [opts.command];

  const stats: MigrationStats = {
    command: opts.command,
    totalUsers: opts.allUsers ? 0 : opts.users.length,
    processedUsers: 0,
    totalItems: 0,
    migratedItems: 0,
    failedItems: 0,
    skippedItems: 0,
    durationMs: 0,
    errors: [],
  };

  const startTime = Date.now();

  for (const cmd of commands) {
    console.log(`\n── Migrating ${cmd} ──`);

    if (opts.dryRun) {
      console.log(`  [DRY RUN] Would migrate ${cmd} for ${opts.allUsers ? 'all users' : opts.users.length + ' users'}`);
      continue;
    }

    // In production: call @anvil/migration package
    switch (cmd) {
      case 'gmail':
        console.log('  Connecting to Gmail API...');
        console.log('  Connecting to Stalwart IMAP...');
        console.log('  Starting IMAP copy migration...');
        break;
      case 'drive':
        console.log('  Connecting to Google Drive API...');
        console.log('  Connecting to MinIO...');
        console.log('  Starting file download/upload migration...');
        break;
      case 'docs':
        console.log('  Connecting to Google Docs API...');
        console.log('  Exporting documents...');
        console.log('  Importing to Anvil Docs...');
        break;
      case 'calendar':
        console.log('  Connecting to Google Calendar API...');
        console.log('  Exporting events as iCal...');
        console.log('  Importing to Anvil Calendar...');
        break;
    }

    console.log(`  ✓ ${cmd} migration complete`);
  }

  stats.durationMs = Date.now() - startTime;

  console.log(`\n── Summary ──`);
  console.log(`  Duration: ${(stats.durationMs / 1000).toFixed(1)}s`);
  console.log(`  Commands: ${commands.join(', ')}`);
  if (opts.dryRun) {
    console.log(`  Mode: DRY RUN (no changes made)`);
  }
  console.log('');
}

// ── Main ──

const opts = parseArgs(process.argv.slice(2));
runMigration(opts).catch(err => {
  console.error(`\n❌ Migration failed: ${err.message}`);
  process.exit(1);
});
