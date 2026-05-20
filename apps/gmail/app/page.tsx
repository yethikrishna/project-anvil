'use client';
import {AppShell, Button, Badge} from '@anvil/ui';

interface MailItem {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  read: boolean;
  starred: boolean;
  labels: string[];
}

const MOCK_MAIL: MailItem[] = [
  {id: '1', from: 'team@company.com', subject: 'Sprint Review — Friday 3pm', preview: 'Hey team, quick reminder about our sprint review this Friday...', time: '10:24 AM', read: false, starred: true, labels: ['work']},
  {id: '2', from: 'github@noreply.com', subject: '[project-anvil] PR #42 merged', preview: 'Your pull request has been merged into main branch...', time: '9:15 AM', read: false, starred: false, labels: ['github']},
  {id: '3', from: 'newsletter@techweekly.com', subject: 'This Week in AI: Agent Orchestration', preview: 'The latest trends in AI agent frameworks and orchestration tools...', time: 'Yesterday', read: true, starred: false, labels: ['newsletter']},
  {id: '4', from: 'hr@company.com', subject: 'Benefits enrollment reminder', preview: 'Open enrollment closes next week. Please review your selections...', time: 'Yesterday', read: true, starred: true, labels: ['work']},
  {id: '5', from: 'deploy@vercel.com', subject: 'Deployment successful — anvil-drive', preview: 'Your deployment to production was successful. Build time: 42s...', time: '2 days ago', read: true, starred: false, labels: ['deploy']},
];

export default function GmailPage() {
  return (
    <AppShell activeApp="gmail">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-56 border-r border-gray-200 bg-white p-3">
          <Button className="w-full mb-4" size="sm">Compose</Button>
          <nav className="space-y-1">
            {['Inbox (2)', 'Starred', 'Sent', 'Drafts', 'Archive', 'Spam', 'Trash'].map(item => (
              <a key={item} href="#" className="flex items-center px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                {item}
              </a>
            ))}
          </nav>
        </div>
        {/* Mail list */}
        <div className="flex-1 divide-y divide-gray-100">
          {MOCK_MAIL.map(mail => (
            <div key={mail.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer ${!mail.read ? 'bg-blue-50/50' : ''}`}>
              <span className="text-sm">{mail.starred ? '⭐' : '☆'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${!mail.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{mail.from}</span>
                  {mail.labels.map(l => <Badge key={l} variant="default">{l}</Badge>)}
                </div>
                <p className={`text-sm truncate ${!mail.read ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{mail.subject}</p>
                <p className="text-xs text-gray-400 truncate">{mail.preview}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{mail.time}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
