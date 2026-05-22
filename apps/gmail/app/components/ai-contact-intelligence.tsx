'use client';

/**
 * AI Contact Intelligence — Anvil Mail
 *
 * Automatically extracts structured contact information from email signatures
 * and thread context. No external APIs needed — pure local extraction.
 *
 * Extracts:
 * - Full name, job title, company
 * - Phone numbers (mobile, office, fax)
 * - Email addresses
 * - LinkedIn / Twitter / website URLs
 * - Physical address
 * - Pronouns
 *
 * Features:
 * - ContactCard component rendered at bottom of email
 * - "Save to Contacts" one-click action
 * - Merge with existing contact if already known
 * - Smart dedup: won't show if sender already in contacts
 */

import {useState, useMemo} from 'react';

// ── Types ──

export interface ExtractedContact {
  name?: string;
  email?: string;
  title?: string;
  company?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  address?: string;
  pronouns?: string;
  confidence: number; // 0–1
  rawSignature: string;
}

// ── Extraction patterns ──

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?:\s*(?:x|ext)\.?\s*\d+)?|\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/g;

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

const LINKEDIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([^\s/>"]+)/i;
const TWITTER_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^\s/>"]+)/i;

// Title patterns — common job title keywords
const TITLE_PATTERNS = [
  /(?:^|,\s*|\n)((?:Chief|VP|Vice President|Director|Manager|Head of|Senior|Lead|Principal|Staff|Junior|Associate|Assistant|Executive|President|Co-?Founder|Founder|CEO|CTO|CFO|COO|CMO|CPO|CIO|CSO|Product|Engineering|Design|Marketing|Sales|Operations|Strategy|Partnerships|Business Development|Customer Success|Account|Technical|Solutions|Software|Full[- ]Stack|Front[- ]End|Back[- ]End|DevOps|Data|ML|AI|Platform|Infrastructure|Security|Legal|Finance|HR|People|Talent|Recruiting)[^\n,]*)/gim,
];

function extractTitle(text: string): string | undefined {
  for (const pattern of TITLE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) {
      return match[1].trim().slice(0, 80);
    }
  }
  return undefined;
}

function extractCompany(text: string, knownName?: string): string | undefined {
  // Look for company patterns: "at Company", "Company, Inc.", "@ Company"
  const patterns = [
    /(?:^|\n)@\s*([A-Z][^\n,]+?)(?:\n|$)/m,
    /\bat\s+([A-Z][^\n,]+?)(?:\n|,|$)/m,
    /([A-Z][A-Za-z\s&.]+(?:Inc|LLC|Ltd|Corp|Co|Group|Labs|Technologies|Solutions|Services|Consulting|Capital|Ventures|Media|Studio|Studios|Agency|Foundation|Institute|University|College)\b\.?)/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const company = match[1].trim();
      // Don't return the person's own name as company
      if (knownName && company.toLowerCase() === knownName.toLowerCase()) continue;
      if (company.length > 2 && company.length < 80) return company;
    }
  }
  return undefined;
}

function extractPronouns(text: string): string | undefined {
  const match = text.match(/\(?(he\/him|she\/her|they\/them|he\/they|she\/they|any\/all)\)?/i);
  return match ? match[1].toLowerCase() : undefined;
}

// ── Main extraction function ──

export function extractContactFromEmail(
  senderName: string,
  senderEmail: string,
  emailBody: string,
): ExtractedContact {
  // Find signature — typically after "-- " or last 300 chars if email is long
  const sigDividers = ['-- \n', '\n-- \n', '---\n', '__________', '________________'];
  let signature = emailBody;

  for (const divider of sigDividers) {
    const idx = emailBody.lastIndexOf(divider);
    if (idx > emailBody.length * 0.5) { // only if divider is in bottom half
      signature = emailBody.slice(idx + divider.length);
      break;
    }
  }

  // If no signature divider found, use last 400 chars
  if (signature === emailBody && emailBody.length > 400) {
    signature = emailBody.slice(-400);
  }

  let confidence = 0.3; // base

  // Extract emails
  const emails = [...signature.matchAll(EMAIL_PATTERN)].map(m => m[0]);
  const emailAddr = emails.find(e => e !== senderEmail) || senderEmail;
  if (emailAddr === senderEmail) confidence += 0.1;

  // Extract phones
  const phones = [...signature.matchAll(PHONE_PATTERN)].map(m => m[0].trim()).filter(p => p.length >= 10);
  const phone = phones[0];
  const mobile = phones[1];
  if (phone) confidence += 0.2;

  // Extract URLs
  const urls = [...signature.matchAll(URL_PATTERN)].map(m => m[0]);
  const website = urls.find(u => !u.includes('linkedin') && !u.includes('twitter') && !u.includes('x.com'));
  const linkedinMatch = signature.match(LINKEDIN_PATTERN);
  const twitterMatch = signature.match(TWITTER_PATTERN);
  if (website || linkedinMatch) confidence += 0.1;

  // Extract title
  const title = extractTitle(signature);
  if (title) confidence += 0.2;

  // Extract company
  const company = extractCompany(signature, senderName);
  if (company) confidence += 0.15;

  // Extract pronouns
  const pronouns = extractPronouns(signature);

  // Extract address (look for postal patterns)
  const addressMatch = signature.match(/\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)[.,\s]+[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/);
  const address = addressMatch ? addressMatch[0].trim() : undefined;

  return {
    name: senderName,
    email: senderEmail,
    title,
    company,
    phone,
    mobile,
    website,
    linkedin: linkedinMatch ? `https://linkedin.com/in/${linkedinMatch[1]}` : undefined,
    twitter: twitterMatch ? `@${twitterMatch[1]}` : undefined,
    address,
    pronouns,
    confidence: Math.min(1, confidence),
    rawSignature: signature.trim().slice(0, 500),
  };
}

// ── Contact Card Component ──

interface ContactCardProps {
  contact: ExtractedContact;
  onSave?: (contact: ExtractedContact) => void;
  onDismiss?: () => void;
}

export function AIContactCard({contact, onSave, onDismiss}: ContactCardProps) {
  const [saved, setSaved] = useState(false);

  // Only show if we extracted meaningful info beyond just name+email
  const hasRichInfo = !!(contact.title || contact.company || contact.phone || contact.linkedin || contact.website);

  if (!hasRichInfo || contact.confidence < 0.35) return null;

  const handleSave = () => {
    onSave?.(contact);
    setSaved(true);
  };

  const initials = contact.name
    ? contact.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="mt-3 border border-blue-100 rounded-xl bg-blue-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {/* Name + pronouns */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900">{contact.name}</span>
              {contact.pronouns && (
                <span className="text-[10px] text-gray-400">({contact.pronouns})</span>
              )}
            </div>

            {/* Title + company */}
            {(contact.title || contact.company) && (
              <div className="text-xs text-gray-600 mt-0.5">
                {contact.title}{contact.title && contact.company ? ' · ' : ''}{contact.company}
              </div>
            )}

            {/* Contact details grid */}
            <div className="mt-1.5 space-y-0.5">
              {contact.email && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>✉️</span>
                  <a href={`mailto:${contact.email}`} className="hover:text-blue-600 truncate">{contact.email}</a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>📞</span>
                  <a href={`tel:${contact.phone}`} className="hover:text-blue-600">{contact.phone}</a>
                </div>
              )}
              {contact.mobile && contact.mobile !== contact.phone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>📱</span>
                  <a href={`tel:${contact.mobile}`} className="hover:text-blue-600">{contact.mobile}</a>
                </div>
              )}
              {contact.website && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>🌐</span>
                  <a href={contact.website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 truncate max-w-[200px]">
                    {contact.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              {contact.linkedin && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>🔗</span>
                  <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">LinkedIn</a>
                </div>
              )}
              {contact.twitter && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>🐦</span>
                  <span>{contact.twitter}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {!saved ? (
            <button
              onClick={handleSave}
              className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap"
            >
              + Save
            </button>
          ) : (
            <span className="text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-lg font-medium">✓ Saved</span>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-[10px] text-gray-400 hover:text-gray-600 text-center"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Confidence indicator */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[10px] text-blue-400">✨ Auto-detected from signature</span>
        <span className="text-[10px] text-gray-300">·</span>
        <span className="text-[10px] text-gray-400">{Math.round(contact.confidence * 100)}% confidence</span>
      </div>
    </div>
  );
}

// ── Hook: auto-extract from email ──

export function useContactExtraction(
  senderName: string,
  senderEmail: string,
  emailBody: string,
  knownContacts?: Set<string>, // set of known email addresses
) {
  const contact = useMemo(
    () => extractContactFromEmail(senderName, senderEmail, emailBody),
    [senderName, senderEmail, emailBody],
  );

  const isAlreadyKnown = knownContacts?.has(senderEmail) ?? false;
  const shouldShow = !isAlreadyKnown && contact.confidence >= 0.35 &&
    !!(contact.title || contact.company || contact.phone || contact.linkedin);

  return {contact, shouldShow};
}
