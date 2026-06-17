/**
 * @anvil/ai/context — Per-User Accumulated Context
 *
 * Maintains a persistent context window per user, composed of:
 * - Profile & preferences
 * - Recent interactions (search history, tool usage patterns)
 * - Active documents & projects
 * - Communication patterns (frequent contacts, writing style)
 * - Knowledge graph (entities, relationships)
 *
 * Designed to be serialized and rehydrated across sessions.
 */

import type { Message } from '../types.js';

// ── Types ──────────────────────────────────────────────

export interface UserProfile {
  /** Unique user ID */
  id: string;
  /** Display name */
  name: string;
  /** Email */
  email?: string;
  /** Timezone */
  timezone?: string;
  /** Locale */
  locale?: string;
  /** Role/title */
  role?: string;
  /** Department or team */
  department?: string;
  /** Custom preferences key-value */
  preferences: Record<string, string | number | boolean>;
  /** Tags the user has self-applied or earned */
  tags: string[];
}

export interface CommunicationStyle {
  /** Detected tone preference */
  tone: 'professional' | 'casual' | 'concise' | 'detailed' | 'technical';
  /** Preferred response length */
  responseLength: 'brief' | 'standard' | 'thorough';
  /** Language preference */
  language: string;
  /** Whether user prefers markdown formatting */
  prefersMarkdown: boolean;
  /** Whether user likes confirmations before actions */
  requiresConfirmation: boolean;
  /** Common abbreviations / jargon the user uses */
  jargon: string[];
}

export interface FrequentContact {
  email: string;
  name?: string;
  /** Interaction count */
  frequency: number;
  /** Last interaction timestamp */
  lastInteraction: number;
  /** Relationship tag */
  relationship?: 'colleague' | 'manager' | 'report' | 'client' | 'personal';
}

export interface ActiveDocument {
  id: string;
  title: string;
  type: string;
  lastAccessed: number;
  /** How often this doc appears in interactions */
  relevanceScore: number;
}

export interface KnowledgeEntity {
  id: string;
  name: string;
  type: 'person' | 'project' | 'concept' | 'tool' | 'document' | 'event';
  aliases: string[];
  attributes: Record<string, unknown>;
  /** Related entity IDs */
  relations: Array<{ entityId: string; relationType: string }>;
  /** How many times this entity appears in context */
  mentionCount: number;
  lastMentioned: number;
}

export interface ToolUsageStats {
  toolName: string;
  /** Total invocations */
  invocations: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average execution time in ms */
  avgDurationMs: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Common parameter patterns */
  frequentParams: Record<string, unknown>;
}

export interface UserContextData {
  /** Core profile */
  profile: UserProfile;
  /** Communication preferences */
  communicationStyle: CommunicationStyle;
  /** Frequently contacted people */
  frequentContacts: FrequentContact[];
  /** Active documents */
  activeDocuments: ActiveDocument[];
  /** Knowledge graph entities */
  entities: Map<string, KnowledgeEntity>;
  /** Tool usage statistics */
  toolUsage: Map<string, ToolUsageStats>;
  /** Recent interaction summaries (last N) */
  recentInteractions: Array<{
    timestamp: number;
    summary: string;
    toolsUsed: string[];
    topics: string[];
  }>;
  /** Custom user notes/memos */
  memos: Array<{ id: string; text: string; createdAt: number }>;
  /** Context creation date */
  createdAt: number;
  /** Last update date */
  updatedAt: number;
}

// ── User Context ───────────────────────────────────────

export class UserContext {
  private data: UserContextData;
  private maxEntities: number;
  private maxInteractions: number;
  private maxContacts: number;
  private maxDocuments: number;

  constructor(
    userId: string,
    options?: {
      maxEntities?: number;
      maxInteractions?: number;
      maxContacts?: number;
      maxDocuments?: number;
    },
  ) {
    this.maxEntities = options?.maxEntities ?? 500;
    this.maxInteractions = options?.maxInteractions ?? 100;
    this.maxContacts = options?.maxContacts ?? 200;
    this.maxDocuments = options?.maxDocuments ?? 50;

    this.data = {
      profile: { id: userId, name: '', preferences: {}, tags: [] },
      communicationStyle: {
        tone: 'professional',
        responseLength: 'standard',
        language: 'en',
        prefersMarkdown: true,
        requiresConfirmation: true,
        jargon: [],
      },
      frequentContacts: [],
      activeDocuments: [],
      entities: new Map(),
      toolUsage: new Map(),
      recentInteractions: [],
      memos: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // ── Profile ─────────────────────────────────────

  get profile(): UserProfile {
    return this.data.profile;
  }

  updateProfile(update: Partial<UserProfile>): void {
    Object.assign(this.data.profile, update);
    this.data.updatedAt = Date.now();
  }

  setPreference(key: string, value: string | number | boolean): void {
    this.data.profile.preferences[key] = value;
    this.data.updatedAt = Date.now();
  }

  getPreference(key: string): string | number | boolean | undefined {
    return this.data.profile.preferences[key];
  }

  // ── Communication Style ─────────────────────────

  get communicationStyle(): CommunicationStyle {
    return this.data.communicationStyle;
  }

  updateCommunicationStyle(update: Partial<CommunicationStyle>): void {
    Object.assign(this.data.communicationStyle, update);
    this.data.updatedAt = Date.now();
  }

  /**
   * Infer communication preferences from a message.
   * Applies behavioral signals to update tone, length, markdown, and jargon.
   */
  inferFromMessage(message: Message): void {
    const raw = message.content;
    const text = raw.toLowerCase();

    if (message.role === 'user') {
      // ── Brevity / response-length signals ──
      const wordCount = raw.trim().split(/\s+/).length;
      if (wordCount < 6 && raw.length < 40) {
        // Very short user messages → prefers brief replies
        const current = this.data.communicationStyle.responseLength;
        if (current === 'thorough') {
          this.data.communicationStyle.responseLength = 'standard';
        } else if (current === 'standard') {
          this.data.communicationStyle.responseLength = 'brief';
        }
      } else if (wordCount > 60) {
        // Long, detailed user messages → user is comfortable with thoroughness
        if (this.data.communicationStyle.responseLength === 'brief') {
          this.data.communicationStyle.responseLength = 'standard';
        }
      }

      // ── Tone signals ──
      const casualPhrases = /\b(hey|hiya|sup|yeah|yep|nope|gonna|wanna|kinda|sorta|lol|haha|thanks!|cool|awesome|nice)\b/;
      const technicalPhrases = /\b(api|sdk|endpoint|codebase|repo|pr|ci|cd|deploy|infra|terraform|kubernetes|microservice|latency|throughput)\b/;
      const formalPhrases = /\b(please|kindly|sincerely|regarding|pursuant|henceforth|therein|accordingly)\b/;

      if (casualPhrases.test(text)) {
        if (this.data.communicationStyle.tone === 'professional') {
          this.data.communicationStyle.tone = 'casual';
        }
      } else if (technicalPhrases.test(text)) {
        this.data.communicationStyle.tone = 'technical';
      } else if (formalPhrases.test(text) && this.data.communicationStyle.tone === 'casual') {
        this.data.communicationStyle.tone = 'professional';
      }

      // ── Confirmation preference ──
      // If user keeps saying "yes, do it" / "go ahead" without asking — lower confirmation bar
      if (/\b(go ahead|just do it|don'?t ask|auto|automatically|no need to confirm|skip confirmation)\b/.test(text)) {
        this.data.communicationStyle.requiresConfirmation = false;
      } else if (/\b(always (ask|confirm|check)|ask me first|confirm before|don'?t (send|create|delete) without)\b/.test(text)) {
        this.data.communicationStyle.requiresConfirmation = true;
      }

      // ── Timezone detection ──
      const tzMatch = text.match(/\b(pst|pdt|est|edt|cst|cdt|mst|mdt|gmt|utc|ist|cet|aest|jst)\b/);
      if (tzMatch && !this.data.profile.timezone) {
        const tzMap: Record<string, string> = {
          pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles',
          est: 'America/New_York', edt: 'America/New_York',
          cst: 'America/Chicago', cdt: 'America/Chicago',
          mst: 'America/Denver', mdt: 'America/Denver',
          gmt: 'GMT', utc: 'UTC',
          ist: 'Asia/Kolkata', cet: 'Europe/Paris',
          aest: 'Australia/Sydney', jst: 'Asia/Tokyo',
        };
        const tz = tzMap[tzMatch[1]];
        if (tz) this.data.profile.timezone = tz;
      }

      // ── Language preference ──
      // Detect non-English if common non-ASCII chars dominate
      const nonAscii = (raw.match(/[^\x00-\x7F]/g) ?? []).length;
      if (nonAscii > raw.length * 0.15) {
        // Likely non-English — keep language as-is (don't overwrite)
        this.data.communicationStyle.language = this.data.communicationStyle.language === 'en'
          ? 'auto'
          : this.data.communicationStyle.language;
      }
    }

    // ── Markdown preference (both roles) ──
    if (raw.includes('```') || raw.includes('**') || raw.includes('## ') || (raw.includes('- ') && raw.includes('\n'))) {
      this.data.communicationStyle.prefersMarkdown = true;
    }

    // ── Jargon / technical terms ──
    const words = raw.split(/\s+/);
    const existingJargon = new Set(this.data.communicationStyle.jargon);
    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9_-]/g, '');
      if (clean.length < 4) continue;
      const isAcronym = /^[A-Z]{2,}$/.test(clean);
      const isCamelCase = /^[a-z]+[A-Z]/.test(clean);
      const isScreamCase = /^[A-Z_]{3,}$/.test(clean);
      if ((isAcronym || isCamelCase || isScreamCase) && !existingJargon.has(clean)) {
        if (this.data.communicationStyle.jargon.length < 80) {
          this.data.communicationStyle.jargon.push(clean);
          existingJargon.add(clean);
        }
      }
    }

    this.data.updatedAt = Date.now();
  }

  /**
   * Learn from an explicit feedback signal (user rating or correction).
   */
  recordFeedback(type: 'too_long' | 'too_short' | 'too_formal' | 'too_casual' | 'correct'): void {
    switch (type) {
      case 'too_long':
        this.data.communicationStyle.responseLength =
          this.data.communicationStyle.responseLength === 'thorough' ? 'standard' : 'brief';
        break;
      case 'too_short':
        this.data.communicationStyle.responseLength =
          this.data.communicationStyle.responseLength === 'brief' ? 'standard' : 'thorough';
        break;
      case 'too_formal':
        this.data.communicationStyle.tone =
          this.data.communicationStyle.tone === 'professional' ? 'casual' : this.data.communicationStyle.tone;
        break;
      case 'too_casual':
        this.data.communicationStyle.tone =
          this.data.communicationStyle.tone === 'casual' ? 'professional' : this.data.communicationStyle.tone;
        break;
      case 'correct':
        // Reinforce current style
        break;
    }
    this.data.updatedAt = Date.now();
  }

  // ── Contacts ────────────────────────────────────

  addContact(contact: FrequentContact): void {
    const existing = this.data.frequentContacts.find(c => c.email === contact.email);
    if (existing) {
      existing.frequency += contact.frequency;
      existing.lastInteraction = Math.max(existing.lastInteraction, contact.lastInteraction);
      if (contact.name) existing.name = contact.name;
      if (contact.relationship) existing.relationship = contact.relationship;
    } else {
      this.data.frequentContacts.push(contact);
    }

    // Sort by frequency, trim
    this.data.frequentContacts.sort((a, b) => b.frequency - a.frequency);
    if (this.data.frequentContacts.length > this.maxContacts) {
      this.data.frequentContacts = this.data.frequentContacts.slice(0, this.maxContacts);
    }

    this.data.updatedAt = Date.now();
  }

  getTopContacts(limit = 10): FrequentContact[] {
    return this.data.frequentContacts.slice(0, limit);
  }

  // ── Active Documents ───────────────────────────

  addActiveDocument(doc: ActiveDocument): void {
    const existing = this.data.activeDocuments.find(d => d.id === doc.id);
    if (existing) {
      existing.lastAccessed = doc.lastAccessed;
      existing.relevanceScore = Math.max(existing.relevanceScore, doc.relevanceScore);
    } else {
      this.data.activeDocuments.push(doc);
    }

    // Sort by relevance, trim
    this.data.activeDocuments.sort((a, b) => b.relevanceScore - a.relevanceScore);
    if (this.data.activeDocuments.length > this.maxDocuments) {
      this.data.activeDocuments = this.data.activeDocuments.slice(0, this.maxDocuments);
    }

    this.data.updatedAt = Date.now();
  }

  getActiveDocuments(limit = 10): ActiveDocument[] {
    return this.data.activeDocuments.slice(0, limit);
  }

  // ── Knowledge Entities ──────────────────────────

  addEntity(entity: KnowledgeEntity): void {
    const existing = this.data.entities.get(entity.id);
    if (existing) {
      existing.mentionCount++;
      existing.lastMentioned = Date.now();
      // Merge aliases
      for (const alias of entity.aliases) {
        if (!existing.aliases.includes(alias)) {
          existing.aliases.push(alias);
        }
      }
      // Merge attributes
      Object.assign(existing.attributes, entity.attributes);
      // Merge relations
      for (const rel of entity.relations) {
        if (!existing.relations.some(r => r.entityId === rel.entityId && r.relationType === rel.relationType)) {
          existing.relations.push(rel);
        }
      }
    } else {
      this.data.entities.set(entity.id, { ...entity, mentionCount: 1, lastMentioned: Date.now() });
    }

    // Trim if over limit
    if (this.data.entities.size > this.maxEntities) {
      const entries = Array.from(this.data.entities.entries())
        .sort((a, b) => b[1].mentionCount - a[1].mentionCount);
      this.data.entities = new Map(entries.slice(0, this.maxEntities));
    }

    this.data.updatedAt = Date.now();
  }

  getEntity(id: string): KnowledgeEntity | undefined {
    return this.data.entities.get(id);
  }

  searchEntities(query: string, limit = 10): KnowledgeEntity[] {
    const lower = query.toLowerCase();
    const results: Array<{ entity: KnowledgeEntity; score: number }> = [];

    for (const entity of this.data.entities.values()) {
      let score = 0;
      if (entity.name.toLowerCase().includes(lower)) score += 10;
      if (entity.aliases.some(a => a.toLowerCase().includes(lower))) score += 5;
      if (entity.type.toLowerCase() === lower) score += 3;
      if (score > 0) {
        results.push({ entity, score: score + entity.mentionCount * 0.1 });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.entity);
  }

  // ── Tool Usage ──────────────────────────────────

  recordToolUsage(toolName: string, success: boolean, durationMs: number, params?: Record<string, unknown>): void {
    const existing = this.data.toolUsage.get(toolName);
    if (existing) {
      existing.invocations++;
      existing.successRate = (existing.successRate * (existing.invocations - 1) + (success ? 1 : 0)) / existing.invocations;
      existing.avgDurationMs = (existing.avgDurationMs * (existing.invocations - 1) + durationMs) / existing.invocations;
      existing.lastUsed = Date.now();
      if (params) {
        existing.frequentParams = { ...existing.frequentParams, ...params };
      }
    } else {
      this.data.toolUsage.set(toolName, {
        toolName,
        invocations: 1,
        successRate: success ? 1 : 0,
        avgDurationMs: durationMs,
        lastUsed: Date.now(),
        frequentParams: params ?? {},
      });
    }

    this.data.updatedAt = Date.now();
  }

  getMostUsedTools(limit = 10): ToolUsageStats[] {
    return Array.from(this.data.toolUsage.values())
      .sort((a, b) => b.invocations - a.invocations)
      .slice(0, limit);
  }

  // ── Interactions ────────────────────────────────

  recordInteraction(summary: string, toolsUsed: string[], topics: string[]): void {
    this.data.recentInteractions.push({
      timestamp: Date.now(),
      summary,
      toolsUsed,
      topics,
    });

    if (this.data.recentInteractions.length > this.maxInteractions) {
      this.data.recentInteractions = this.data.recentInteractions.slice(-this.maxInteractions);
    }

    this.data.updatedAt = Date.now();
  }

  getRecentInteractions(limit = 10): UserContextData['recentInteractions'] {
    return this.data.recentInteractions.slice(-limit);
  }

  // ── Memos ───────────────────────────────────────

  addMemo(text: string): string {
    const id = `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.data.memos.push({ id, text, createdAt: Date.now() });
    this.data.updatedAt = Date.now();
    return id;
  }

  removeMemo(id: string): boolean {
    const idx = this.data.memos.findIndex(m => m.id === id);
    if (idx === -1) return false;
    this.data.memos.splice(idx, 1);
    this.data.updatedAt = Date.now();
    return true;
  }

  getMemos(): UserContextData['memos'] {
    return [...this.data.memos];
  }

  // ── Context Window ──────────────────────────────

  /**
   * Build a condensed context string suitable for injection into a system prompt.
   * Controls total length to stay within token budget.
   */
  buildContextWindow(maxTokens: number = 2000): string {
    const sections: string[] = [];

    // Profile summary
    if (this.data.profile.name) {
      sections.push(`User: ${this.data.profile.name}`);
      if (this.data.profile.role) sections.push(`Role: ${this.data.profile.role}`);
      if (this.data.profile.timezone) sections.push(`Timezone: ${this.data.profile.timezone}`);
    }

    // Communication style
    const style = this.data.communicationStyle;
    sections.push(`Communication: ${style.tone} tone, ${style.responseLength} responses, prefers ${style.prefersMarkdown ? 'markdown' : 'plain text'}`);
    if (style.jargon.length > 0) {
      sections.push(`Known jargon: ${style.jargon.slice(0, 15).join(', ')}`);
    }

    // Top contacts (abbreviated)
    if (this.data.frequentContacts.length > 0) {
      const contacts = this.getTopContacts(5)
        .map(c => `${c.name ?? c.email} (${c.relationship ?? 'contact'})`)
        .join(', ');
      sections.push(`Frequent contacts: ${contacts}`);
    }

    // Active documents
    if (this.data.activeDocuments.length > 0) {
      const docs = this.getActiveDocuments(5)
        .map(d => `"${d.title}" (${d.type})`)
        .join(', ');
      sections.push(`Active documents: ${docs}`);
    }

    // Recent topics
    const recentTopics = this.data.recentInteractions.slice(-5).flatMap(i => i.topics);
    const uniqueTopics = [...new Set(recentTopics)];
    if (uniqueTopics.length > 0) {
      sections.push(`Recent topics: ${uniqueTopics.slice(0, 10).join(', ')}`);
    }

    // Recent interactions
    const recent = this.getRecentInteractions(3);
    if (recent.length > 0) {
      const summaries = recent.map(i => i.summary).join('; ');
      sections.push(`Recent activity: ${summaries}`);
    }

    // User memos (persistent notes the AI has saved about the user)
    if (this.data.memos.length > 0) {
      const recentMemos = this.data.memos
        .slice(-8)
        .map(m => `- ${m.text}`)
        .join('\n');
      sections.push(`Saved notes about user:\n${recentMemos}`);
    }

    // Most-used tools (for personalized workflow suggestions)
    const topTools = this.getMostUsedTools(3);
    if (topTools.length > 0 && topTools[0].invocations > 2) {
      const toolStr = topTools.map(t => `${t.toolName}(×${t.invocations})`).join(', ');
      sections.push(`Preferred tools: ${toolStr}`);
    }

    // Custom preferences
    const customPrefs = Object.entries(this.data.profile.preferences)
      .filter(([, v]) => v !== undefined && v !== '')
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (customPrefs) {
      sections.push(`Preferences: ${customPrefs}`);
    }

    // Enforce token budget (~4 chars per token)
    const maxChars = maxTokens * 4;
    let result = sections.join('\n');
    if (result.length > maxChars) {
      // Drop sections from least important to most important until we fit
      const dropOrder = ['Recent activity', 'Recent topics', 'Active documents', 'Frequent contacts', 'Known jargon'];
      for (const prefix of dropOrder) {
        if (result.length <= maxChars) break;
        const lines = result.split('\n');
        result = lines.filter(l => !l.startsWith(prefix)).join('\n');
      }
      // Final hard truncate if still too long
      if (result.length > maxChars) {
        result = result.slice(0, maxChars);
      }
    }

    return result;
  }

  // ── Serialization ──────────────────────────────

  /**
   * Serialize to JSON-safe object.
   */
  toJSON(): Record<string, unknown> {
    return {
      profile: this.data.profile,
      communicationStyle: this.data.communicationStyle,
      frequentContacts: this.data.frequentContacts,
      activeDocuments: this.data.activeDocuments,
      entities: Object.fromEntries(this.data.entities),
      toolUsage: Object.fromEntries(this.data.toolUsage),
      recentInteractions: this.data.recentInteractions,
      memos: this.data.memos,
      createdAt: this.data.createdAt,
      updatedAt: this.data.updatedAt,
    };
  }

  /**
   * Rehydrate from serialized data.
   */
  static fromJSON(json: Record<string, unknown>): UserContext {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid UserContext JSON: expected object');
    }

    const profile = json.profile as UserProfile | undefined;
    if (!profile || !profile.id) {
      throw new Error('Invalid UserContext JSON: missing profile.id');
    }

    const ctx = new UserContext(profile.id);
    ctx.data.profile = profile;
    ctx.data.communicationStyle = (json.communicationStyle ?? ctx.data.communicationStyle) as CommunicationStyle;
    ctx.data.frequentContacts = Array.isArray(json.frequentContacts) ? json.frequentContacts as FrequentContact[] : [];
    ctx.data.activeDocuments = Array.isArray(json.activeDocuments) ? json.activeDocuments as ActiveDocument[] : [];

    try {
      const entitiesRaw = json.entities ?? {};
      ctx.data.entities = new Map(Object.entries(entitiesRaw as Record<string, KnowledgeEntity>));
    } catch {
      ctx.data.entities = new Map();
    }

    try {
      const toolUsageRaw = json.toolUsage ?? {};
      ctx.data.toolUsage = new Map(Object.entries(toolUsageRaw as Record<string, ToolUsageStats>));
    } catch {
      ctx.data.toolUsage = new Map();
    }

    ctx.data.recentInteractions = Array.isArray(json.recentInteractions) ? json.recentInteractions as UserContextData['recentInteractions'] : [];
    ctx.data.memos = Array.isArray(json.memos) ? json.memos as UserContextData['memos'] : [];
    ctx.data.createdAt = (typeof json.createdAt === 'number' ? json.createdAt : Date.now());
    ctx.data.updatedAt = (typeof json.updatedAt === 'number' ? json.updatedAt : Date.now());
    return ctx;
  }

  /**
   * Merge another UserContext into this one (for sync scenarios).
   */
  merge(other: UserContext): void {
    // Merge contacts (sum frequencies)
    for (const contact of other.data.frequentContacts) {
      this.addContact(contact);
    }

    // Merge entities
    for (const entity of other.data.entities.values()) {
      this.addEntity(entity);
    }

    // Merge tool usage (weighted average)
    for (const [name, stats] of other.data.toolUsage) {
      const existing = this.data.toolUsage.get(name);
      if (existing) {
        const total = existing.invocations + stats.invocations;
        existing.successRate = (existing.successRate * existing.invocations + stats.successRate * stats.invocations) / total;
        existing.avgDurationMs = (existing.avgDurationMs * existing.invocations + stats.avgDurationMs * stats.invocations) / total;
        existing.invocations = total;
      } else {
        this.data.toolUsage.set(name, { ...stats });
      }
    }

    // Use most recent updatedAt
    this.data.updatedAt = Math.max(this.data.updatedAt, other.data.updatedAt);
  }
}
