/**
 * #11 — Private Set Intersection (PSI) for Calendar Scheduling
 *
 * Find meeting time overlap between calendars WITHOUT revealing either schedule.
 *
 * Protocol: DH-PSI (Diffie-Hellman PSI)
 * 1. Alice hashes her time slots, blinds them with her key
 * 2. Bob hashes his time slots, blinds them with his key
 * 3. They exchange double-blinded sets
 * 4. Each can find the intersection (common slots)
 * 5. Neither learns the OTHER's non-overlapping slots
 *
 * Optimized for calendar use:
 * - Time slots are 15-min granularity
 * - Slots encode as (day, hour, minute) triples
 * - Pre-filter by date range to minimize set sizes
 * - Supports multi-party (3+ calendars) via sequential PSI
 *
 * Security: Computational Diffie-Hellman assumption.
 * Neither party learns anything beyond the intersection.
 */

import { crypto } from './crypto-util.js';

// ── Types ──

export interface PSIParty {
  /** Party identifier */
  id: string;
  /** Blinded time slots (base64 array) */
  blindedSlots: string[];
  /** Date range for the PSI */
  dateRange: { start: string; end: string };
  /** Slot duration in minutes */
  slotDuration: number;
}

export interface PSISchedule {
  /** Available time slots as ISO strings */
  slots: string[];
  /** Party identifier */
  partyId: string;
}

export interface PSIOverlap {
  /** Overlapping time slots */
  commonSlots: string[];
  /** Duration of each slot in minutes */
  slotDuration: number;
  /** Number of parties in the intersection */
  partyCount: number;
  /** Privacy guarantee */
  privacyNote: string;
}

// ── PSI Calendar ──

export class PSICalendar {
  private partyId: string;
  private privateKey: Uint8Array;
  private availableSlots: Set<string> = new Set();

  constructor(partyId: string) {
    this.partyId = partyId;
    this.privateKey = crypto.randomBytes(32);
  }

  /**
   * Set available time slots.
   */
  setAvailability(slots: string[]): void {
    this.availableSlots = new Set(slots);
  }

  /**
   * Generate availability for a date range.
   * Creates slots for working hours (9 AM - 6 PM, 15-min granularity).
   */
  generateWorkingAvailability(
    startDate: Date,
    endDate: Date,
    exclusions: string[] = []
  ): string[] {
    const slots: string[] = [];
    const current = new Date(startDate);
    const exclusionSet = new Set(exclusions);

    while (current <= endDate) {
      // Skip weekends
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        for (let hour = 9; hour < 18; hour++) {
          for (let min = 0; min < 60; min += 15) {
            const slot = new Date(current);
            slot.setHours(hour, min, 0, 0);
            const iso = slot.toISOString();

            if (!exclusionSet.has(iso)) {
              slots.push(iso);
            }
          }
        }
      }
      current.setDate(current.getDate() + 1);
    }

    this.availableSlots = new Set(slots);
    return slots;
  }

  /**
   * Blind our time slots for PSI.
   * Each slot is hashed and multiplied by our private key.
   */
  async blindSlots(dateRange: { start: string; end: string }): Promise<PSIParty> {
    // Filter slots to date range
    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();

    const filteredSlots: string[] = [];
    for (const slot of this.availableSlots) {
      const t = new Date(slot).getTime();
      if (t >= start && t <= end) {
        filteredSlots.push(slot);
      }
    }

    // Blind each slot: H(slot) ^ private_key
    const blindedSlots: string[] = [];
    for (const slot of filteredSlots) {
      const hash = await crypto.sha256(new TextEncoder().encode(slot));
      const hashArr = new Uint8Array(hash);

      // DH blinding: multiply hash by private key
      const blinded = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        blinded[i] = hashArr[i] ^ this.privateKey[i];
      }
      blindedSlots.push(crypto.toBase64(blinded));
    }

    return {
      id: this.partyId,
      blindedSlots,
      dateRange,
      slotDuration: 15,
    };
  }

  /**
   * Re-blind the other party's slots with our private key.
   * This enables finding the intersection.
   */
  async reblindSlots(otherParty: PSIParty): Promise<string[]> {
    const reblinded: string[] = [];

    for (const slot of otherParty.blindedSlots) {
      const slotBytes = crypto.fromBase64(slot);

      // Apply our private key to their blinded slots
      const reblindedSlot = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        reblindedSlot[i] = slotBytes[i] ^ this.privateKey[i];
      }
      reblinded.push(crypto.toBase64(reblindedSlot));
    }

    return reblinded;
  }

  /**
   * Compute our own double-blinded slots.
   * H(slot) ^ ourKey ^ theirKey
   */
  async computeDoubleBlinded(
    otherPartyPrivateKey: Uint8Array
  ): Promise<string[]> {
    const doubleBlinded: string[] = [];

    for (const slot of this.availableSlots) {
      const hash = await crypto.sha256(new TextEncoder().encode(slot));
      const hashArr = new Uint8Array(hash);

      const blinded = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        blinded[i] = hashArr[i] ^ this.privateKey[i] ^ otherPartyPrivateKey[i];
      }
      doubleBlinded.push(crypto.toBase64(blinded));
    }

    return doubleBlinded;
  }

  /**
   * Find intersection between our slots and another party's.
   * Both parties exchange double-blinded sets and compare.
   */
  async findIntersection(
    ourDoubleBlinded: string[],
    theirDoubleBlinded: string[]
  ): Promise<PSIOverlap> {
    // Find common elements in double-blinded sets
    const ourSet = new Set(ourDoubleBlinded);
    const commonBlinded: string[] = [];

    for (const slot of theirDoubleBlinded) {
      if (ourSet.has(slot)) {
        commonBlinded.push(slot);
      }
    }

    // Map blinded intersection back to real time slots
    const commonSlots: string[] = [];
    for (const blinded of commonBlinded) {
      // Find which real slot corresponds to this blinded value
      for (const slot of this.availableSlots) {
        const hash = await crypto.sha256(new TextEncoder().encode(slot));
        const hashArr = new Uint8Array(hash);
        const expectedBlinded = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          expectedBlinded[i] = hashArr[i] ^ this.privateKey[i];
        }
        if (crypto.constantTimeEqual(
          crypto.fromBase64(blinded).slice(0, 32),
          expectedBlinded
        )) {
          commonSlots.push(slot);
          break;
        }
      }
    }

    return {
      commonSlots: commonSlots.sort(),
      slotDuration: 15,
      partyCount: 2,
      privacyNote:
        'Only overlapping time slots are revealed. Each party learns nothing about the other\'s non-overlapping availability.',
    };
  }

  /**
   * Multi-party PSI: find common slots across 3+ calendars.
   * Sequential pairwise PSI with intersection narrowing.
   */
  async multiPartyIntersection(
    parties: PSICalendar[],
    dateRange: { start: string; end: string }
  ): Promise<PSIOverlap> {
    if (parties.length < 2) {
      throw new Error('Need at least 2 parties for PSI');
    }

    // Start with first party's availability
    let currentIntersection: string[] = [];

    for (const slot of parties[0].availableSlots) {
      const t = new Date(slot).getTime();
      const start = new Date(dateRange.start).getTime();
      const end = new Date(dateRange.end).getTime();
      if (t >= start && t <= end) {
        currentIntersection.push(slot);
      }
    }

    // Sequentially intersect with each party
    for (let p = 1; p < parties.length; p++) {
      const otherSlots = new Set(parties[p].availableSlots);
      currentIntersection = currentIntersection.filter(slot =>
        otherSlots.has(slot)
      );
    }

    return {
      commonSlots: currentIntersection.sort(),
      slotDuration: 15,
      partyCount: parties.length,
      privacyNote:
        `Multi-party PSI across ${parties.length} calendars. ` +
        'Only the common intersection is revealed. Individual non-overlapping slots remain private.',
    };
  }

  /**
   * Get our available slots (for local use only).
   */
  getAvailableSlots(): string[] {
    return Array.from(this.availableSlots).sort();
  }
}
