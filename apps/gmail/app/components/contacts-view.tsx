'use client';

import { useState, useMemo } from 'react';
import { cn } from '@anvil/ui';
import type { JSContact } from '../lib/jmap-calendar-contacts';

// ── Mock Contacts Data ──

const MOCK_CONTACTS: JSContact[] = [
  {
    '@type': 'Contact',
    id: 'con-1',
    uid: 'uid-c1',
    firstName: 'Sarah',
    lastName: 'Chen',
    name: 'Sarah Chen',
    emails: [{ '@type': 'EmailAddress', email: 'sarah@company.com', contexts: ['work'] }],
    phones: [{ '@type': 'Phone', phone: '+1-555-0101', contexts: ['work'] }],
    organizations: [{ '@type': 'Organization', name: 'TechCorp', title: 'Engineering Manager' }],
    photo: '',
  },
  {
    '@type': 'Contact',
    id: 'con-2',
    uid: 'uid-c2',
    firstName: 'Alex',
    lastName: 'Rivera',
    name: 'Alex Rivera',
    emails: [{ '@type': 'EmailAddress', email: 'alex@startup.io', contexts: ['work'] }, { '@type': 'EmailAddress', email: 'alex@gmail.com', contexts: ['home'] }],
    phones: [{ '@type': 'Phone', phone: '+1-555-0202', contexts: ['mobile'] }],
    organizations: [{ '@type': 'Organization', name: 'StartupXYZ', title: 'CTO' }],
  },
  {
    '@type': 'Contact',
    id: 'con-3',
    uid: 'uid-c3',
    firstName: 'Emily',
    lastName: 'Zhang',
    name: 'Emily Zhang',
    emails: [{ '@type': 'EmailAddress', email: 'emily@design.co', contexts: ['work'] }],
    phones: [{ '@type': 'Phone', phone: '+1-555-0303', contexts: ['work'] }],
    organizations: [{ '@type': 'Organization', name: 'Design Co', title: 'Lead Designer' }],
    birthday: '1992-03-15',
  },
  {
    '@type': 'Contact',
    id: 'con-4',
    uid: 'uid-c4',
    firstName: 'Marcus',
    lastName: 'Johnson',
    name: 'Marcus Johnson',
    emails: [{ '@type': 'EmailAddress', email: 'marcus@dev.io', contexts: ['work'] }],
    organizations: [{ '@type': 'Organization', name: 'Freelance', title: 'Full-Stack Developer' }],
    notes: 'Met at ReactConf 2025. Interested in collaboration.',
  },
  {
    '@type': 'Contact',
    id: 'con-5',
    uid: 'uid-c5',
    firstName: 'Priya',
    lastName: 'Patel',
    name: 'Priya Patel',
    emails: [{ '@type': 'EmailAddress', email: 'priya@university.edu', contexts: ['work'] }],
    phones: [{ '@type': 'Phone', phone: '+1-555-0505', contexts: ['work'] }],
    organizations: [{ '@type': 'Organization', name: 'State University', title: 'Professor of CS' }],
    birthday: '1988-11-22',
  },
  {
    '@type': 'Contact',
    id: 'con-6',
    uid: 'uid-c6',
    firstName: 'Jordan',
    lastName: 'Lee',
    name: 'Jordan Lee',
    emails: [{ '@type': 'EmailAddress', email: 'jordan@cloud.dev', contexts: ['work'] }],
    phones: [{ '@type': 'Phone', phone: '+1-555-0606', contexts: ['mobile'] }],
    organizations: [{ '@type': 'Organization', name: 'CloudScale', title: 'DevOps Lead' }],
  },
];

// ── Contact Form Modal ──

function ContactFormModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: JSContact;
  onSave: (contact: Partial<JSContact>) => void;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName || '');
  const [lastName, setLastName] = useState(initial?.lastName || '');
  const [email, setEmail] = useState(initial?.emails?.[0]?.email || '');
  const [phone, setPhone] = useState(initial?.phones?.[0]?.phone || '');
  const [company, setCompany] = useState(initial?.organizations?.[0]?.name || '');
  const [title, setTitle] = useState(initial?.organizations?.[0]?.title || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [birthday, setBirthday] = useState(initial?.birthday || '');

  const handleSave = () => {
    if (!firstName.trim() && !lastName.trim()) return;
    onSave({
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      emails: email ? [{ '@type': 'EmailAddress' as const, email, contexts: ['work' as const] }] : undefined,
      phones: phone ? [{ '@type': 'Phone' as const, phone, contexts: ['mobile' as const] }] : undefined,
      organizations: company ? [{ '@type': 'Organization' as const, name: company, title }] : undefined,
      notes: notes || undefined,
      birthday: birthday || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">{initial ? 'Edit Contact' : 'New Contact'}</h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" autoFocus />
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <div className="flex gap-3">
            <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Contact Detail Panel ──

function ContactDetail({ contact, onEdit, onClose }: { contact: JSContact; onEdit: () => void; onClose: () => void }) {
  const initials = (contact.firstName?.[0] || '') + (contact.lastName?.[0] || '');

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-4">
        <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
        <button onClick={onEdit} className="px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">Edit</button>
      </div>

      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-semibold mb-2">
          {initials || '?'}
        </div>
        <h3 className="text-lg font-semibold text-gray-900">{contact.name || `${contact.firstName} ${contact.lastName}`}</h3>
        {contact.organizations?.[0] && (
          <p className="text-sm text-gray-500">{contact.organizations[0].title} at {contact.organizations[0].name}</p>
        )}
      </div>

      <div className="space-y-3">
        {contact.emails?.map((e, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-sm">✉️</span>
            <div>
              <p className="text-sm font-medium text-gray-900">{e.email}</p>
              <p className="text-xs text-gray-400">{e.contexts?.join(', ') || 'email'}</p>
            </div>
          </div>
        ))}
        {contact.phones?.map((p, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-sm">📞</span>
            <div>
              <p className="text-sm font-medium text-gray-900">{p.phone}</p>
              <p className="text-xs text-gray-400">{p.contexts?.join(', ') || 'phone'}</p>
            </div>
          </div>
        ))}
        {contact.birthday && (
          <div className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-sm">🎂</span>
            <div>
              <p className="text-sm font-medium text-gray-900">{new Date(contact.birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
              <p className="text-xs text-gray-400">Birthday</p>
            </div>
          </div>
        )}
        {contact.notes && (
          <div className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-sm">📝</span>
            <p className="text-sm text-gray-700">{contact.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Contacts View ──

export default function ContactsView() {
  const [contacts, setContacts] = useState(MOCK_CONTACTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<JSContact | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState<JSContact | undefined>();

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    const q = searchQuery.toLowerCase();
    return contacts
      .filter((c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.firstName || '').toLowerCase().includes(q) ||
        (c.lastName || '').toLowerCase().includes(q) ||
        c.emails?.some((e) => e.email.toLowerCase().includes(q)) ||
        c.organizations?.some((o) => o.name.toLowerCase().includes(q))
      )
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  }, [contacts, searchQuery]);

  // Group by first letter
  const grouped = useMemo(() => {
    const groups: Record<string, JSContact[]> = {};
    for (const c of filteredContacts) {
      const letter = ((c.lastName || c.firstName || '?')[0] || '?').toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(c);
    }
    return groups;
  }, [filteredContacts]);

  const handleCreateContact = (data: Partial<JSContact>) => {
    const newContact: JSContact = {
      '@type': 'Contact',
      id: `con-${Date.now()}`,
      uid: crypto.randomUUID(),
      firstName: data.firstName,
      lastName: data.lastName,
      name: data.name,
      emails: data.emails,
      phones: data.phones,
      organizations: data.organizations,
      notes: data.notes,
      birthday: data.birthday,
    };
    setContacts((prev) => [...prev, newContact]);
    setSelectedContact(newContact);
  };

  const handleUpdateContact = (data: Partial<JSContact>) => {
    if (!editingContact) return;
    setContacts((prev) => prev.map((c) => c.id === editingContact.id ? { ...c, ...data } : c));
    setSelectedContact({ ...editingContact, ...data } as JSContact);
    setEditingContact(undefined);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-white">
      {/* Contact list */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        {/* Search + New */}
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
            <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <button
            onClick={() => { setEditingContact(undefined); setShowContactForm(true); }}
            className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + New Contact
          </button>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-auto">
          {Object.entries(grouped).map(([letter, group]) => (
            <div key={letter}>
              <div className="px-3 py-1 text-xs font-medium text-gray-400 bg-gray-50 sticky top-0">{letter}</div>
              {group.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50',
                    selectedContact?.id === contact.id && 'bg-blue-50'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                    {(contact.firstName?.[0] || '') + (contact.lastName?.[0] || '')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{contact.name || `${contact.firstName} ${contact.lastName}`}</p>
                    <p className="text-xs text-gray-400 truncate">{contact.emails?.[0]?.email || contact.organizations?.[0]?.name || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filteredContacts.length === 0 && (
            <div className="p-6 text-center text-gray-400 text-sm">No contacts found</div>
          )}
        </div>
      </div>

      {/* Contact detail */}
      <div className="flex-1 overflow-auto">
        {selectedContact ? (
          <ContactDetail
            contact={selectedContact}
            onEdit={() => { setEditingContact(selectedContact); setShowContactForm(true); }}
            onClose={() => setSelectedContact(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a contact to view details
          </div>
        )}
      </div>

      {/* Contact form modal */}
      {showContactForm && (
        <ContactFormModal
          initial={editingContact}
          onSave={editingContact ? handleUpdateContact : handleCreateContact}
          onClose={() => { setShowContactForm(false); setEditingContact(undefined); }}
        />
      )}
    </div>
  );
}
