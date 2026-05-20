/**
 * @anvil/contacts — Shared contact system across Gmail, Calendar, Drive.
 *
 * Features:
 * - Unified contact model (name, email, phone, org, avatar)
 * - Contact groups/lists
 * - Contact search
 * - Recently contacted (frequent contacts)
 * - Merge suggestions (duplicate detection)
 */

// ── Types ──

export interface Contact {
  id: string;
  /** Primary email */
  email: string;
  /** Display name */
  name: string;
  /** Given name */
  firstName?: string;
  /** Family name */
  lastName?: string;
  /** Phone numbers */
  phones: {label: string; number: string}[];
  /** Organization */
  organization?: string;
  /** Job title */
  title?: string;
  /** Avatar URL */
  avatar?: string;
  /** Notes */
  notes?: string;
  /** Contact groups */
  groups: string[];
  /** Last contacted */
  lastContactedAt?: string;
  /** Contact count */
  contactCount: number;
  /** Source */
  source: 'gmail' | 'drive' | 'calendar' | 'manual' | 'import';
  /** Creation date */
  createdAt: string;
  updatedAt: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  color: string;
  memberCount: number;
}

// ── In-Memory Store ──

const contacts: Contact[] = [
  {
    id: 'c1', email: 'sarah.chen@anvil.dev', name: 'Sarah Chen', firstName: 'Sarah', lastName: 'Chen',
    phones: [{label: 'mobile', number: '+1-555-0101'}],
    organization: 'Anvil Corp', title: 'Product Manager',
    groups: ['work', 'team'], contactCount: 24, source: 'gmail',
    lastContactedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: '2026-01-15T00:00:00Z', updatedAt: new Date().toISOString(),
  },
  {
    id: 'c2', email: 'arjun.patel@anvil.dev', name: 'Arjun Patel', firstName: 'Arjun', lastName: 'Patel',
    phones: [{label: 'mobile', number: '+91-98765-43210'}],
    organization: 'Anvil Corp', title: 'Senior Engineer',
    groups: ['work', 'team'], contactCount: 18, source: 'gmail',
    lastContactedAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: '2026-02-01T00:00:00Z', updatedAt: new Date().toISOString(),
  },
  {
    id: 'c3', email: 'mike.johnson@gmail.com', name: 'Mike Johnson', firstName: 'Mike', lastName: 'Johnson',
    phones: [],
    organization: 'Google', title: 'Staff Engineer',
    groups: ['personal'], contactCount: 5, source: 'gmail',
    lastContactedAt: new Date(Date.now() - 604800000).toISOString(),
    createdAt: '2026-03-10T00:00:00Z', updatedAt: '2026-03-10T00:00:00Z',
  },
  {
    id: 'c4', email: 'priya.sharma@anvil.dev', name: 'Priya Sharma', firstName: 'Priya', lastName: 'Sharma',
    phones: [{label: 'work', number: '+91-98765-00000'}],
    organization: 'Anvil Corp', title: 'Designer',
    groups: ['work', 'team'], contactCount: 12, source: 'drive',
    lastContactedAt: new Date(Date.now() - 172800000).toISOString(),
    createdAt: '2026-01-20T00:00:00Z', updatedAt: new Date().toISOString(),
  },
  {
    id: 'c5', email: 'john.doe@example.com', name: 'John Doe', firstName: 'John', lastName: 'Doe',
    phones: [{label: 'home', number: '+1-555-0202'}],
    groups: ['personal'], contactCount: 2, source: 'manual',
    lastContactedAt: new Date(Date.now() - 2592000000).toISOString(),
    createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z',
  },
];

const groups: ContactGroup[] = [
  {id: 'work', name: 'Work', color: '#3b82f6', memberCount: 3},
  {id: 'team', name: 'Team', color: '#10b981', memberCount: 3},
  {id: 'personal', name: 'Personal', color: '#f59e0b', memberCount: 2},
];

// ── Query Functions ──

export function getAllContacts(): Contact[] {
  return contacts.sort((a, b) => a.name.localeCompare(b.name));
}

export function getContact(id: string): Contact | undefined {
  return contacts.find(c => c.id === id);
}

export function searchContacts(query: string): Contact[] {
  const q = query.toLowerCase();
  return contacts.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.email.toLowerCase().includes(q) ||
    c.organization?.toLowerCase().includes(q) ||
    c.title?.toLowerCase().includes(q)
  );
}

export function getRecentContacts(limit = 5): Contact[] {
  return [...contacts]
    .sort((a, b) => new Date(b.lastContactedAt ?? 0).getTime() - new Date(a.lastContactedAt ?? 0).getTime())
    .slice(0, limit);
}

export function getFrequentContacts(limit = 10): Contact[] {
  return [...contacts]
    .sort((a, b) => b.contactCount - a.contactCount)
    .slice(0, limit);
}

export function getContactsByGroup(groupId: string): Contact[] {
  return contacts.filter(c => c.groups.includes(groupId));
}

export function getAllGroups(): ContactGroup[] {
  return groups;
}

export function getContactByEmail(email: string): Contact | undefined {
  return contacts.find(c => c.email.toLowerCase() === email.toLowerCase());
}

// ── CRUD ──

export function createContact(input: Partial<Contact> & {email: string; name: string}): Contact {
  const contact: Contact = {
    id: `c_${Date.now()}`,
    email: input.email,
    name: input.name,
    firstName: input.firstName,
    lastName: input.lastName,
    phones: input.phones ?? [],
    organization: input.organization,
    title: input.title,
    avatar: input.avatar,
    notes: input.notes,
    groups: input.groups ?? [],
    contactCount: 0,
    source: input.source ?? 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  contacts.push(contact);
  return contact;
}

// ── Merge Detection ──

export interface MergeSuggestion {
  contact1: Contact;
  contact2: Contact;
  confidence: number;
  reason: string;
}

export function findMergeSuggestions(): MergeSuggestion[] {
  const suggestions: MergeSuggestion[] = [];

  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];

      // Same email = definite duplicate
      if (a.email.toLowerCase() === b.email.toLowerCase()) {
        suggestions.push({contact1: a, contact2: b, confidence: 1.0, reason: 'Same email address'});
        continue;
      }

      // Similar name + same org
      const nameSimilarity = calculateNameSimilarity(a.name, b.name);
      if (nameSimilarity > 0.7 && a.organization && a.organization === b.organization) {
        suggestions.push({contact1: a, contact2: b, confidence: nameSimilarity * 0.9, reason: 'Similar name in same organization'});
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function calculateNameSimilarity(a: string, b: string): number {
  const aParts = a.toLowerCase().split(/\s+/);
  const bParts = b.toLowerCase().split(/\s+/);

  let matches = 0;
  for (const ap of aParts) {
    if (bParts.some(bp => bp.includes(ap) || ap.includes(bp))) {
      matches++;
    }
  }

  return matches / Math.max(aParts.length, bParts.length);
}
