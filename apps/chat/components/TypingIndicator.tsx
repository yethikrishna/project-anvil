'use client';

/**
 * TypingIndicator — animated dots showing who is typing.
 * Shows up to 3 names, then "X people are typing..."
 */

interface TypingUser {
  userId: string;
  since: number;
}

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  className?: string;
}

export default function TypingIndicator({ typingUsers, className = '' }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.slice(0, 3).map(t =>
    t.userId === 'default' ? 'Someone' : t.userId
  );

  let label: string;
  if (typingUsers.length === 1) {
    label = `${names[0]} is typing`;
  } else if (typingUsers.length === 2) {
    label = `${names[0]} and ${names[1]} are typing`;
  } else if (typingUsers.length === 3) {
    label = `${names[0]}, ${names[1]}, and ${names[2]} are typing`;
  } else {
    label = `${typingUsers.length} people are typing`;
  }

  return (
    <div className={`flex items-center gap-2 text-xs text-gray-400 px-4 py-1 ${className}`}>
      {/* Animated dots */}
      <span className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
      </span>
      <span className="italic">{label}…</span>
    </div>
  );
}
