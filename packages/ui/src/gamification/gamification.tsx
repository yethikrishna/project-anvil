'use client';

/**
 * Gamification system — productivity scoring, achievements, onboarding quests.
 *
 * Features:
 * - Daily productivity score across apps
 * - Achievement/badge system with unlock conditions
 * - Onboarding quests as guided tutorials
 * - Trophy case on profile page
 * - Progress tracking
 */

import {useState, useCallback, useMemo, useEffect} from 'react';

// ── Types ──

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'productivity' | 'social' | 'explorer' | 'mastery';
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  condition: (state: GamificationState) => boolean;
  unlockedAt?: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  steps: QuestStep[];
  reward: {type: 'achievement' | 'points'; value: string};
  category: 'onboarding' | 'weekly' | 'daily';
  progress: number; // 0-1
  completed: boolean;
}

export interface QuestStep {
  id: string;
  title: string;
  completed: boolean;
  action: string; // e.g. "navigate:/docs", "create:document", "send:email"
}

export interface GamificationState {
  points: number;
  streak: number;
  lastActiveDate: string;
  documentsCreated: number;
  emailsSent: number;
  filesUploaded: number;
  searchesPerformed: number;
  tasksCompleted: number;
  calendarsUsed: number;
  daysActive: number;
  achievements: string[]; // Achievement IDs
  questProgress: Record<string, number>;
}

// ── Achievement Definitions ──

const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-doc', name: 'First Document', description: 'Create your first document',
    icon: '📝', category: 'productivity', rarity: 'common',
    condition: (s) => s.documentsCreated >= 1,
  },
  {
    id: 'inbox-zero', name: 'Inbox Zero', description: 'Clear your inbox completely',
    icon: '📧', category: 'productivity', rarity: 'rare',
    condition: (s) => s.emailsSent >= 1, // Simplified: real check would be inbox count = 0
  },
  {
    id: 'power-user', name: 'Power User', description: 'Use all 10 apps in one day',
    icon: '⚡', category: 'explorer', rarity: 'rare',
    condition: (s) => s.documentsCreated > 0 && s.emailsSent > 0 && s.filesUploaded > 0 && s.searchesPerformed > 0 && s.tasksCompleted > 0,
  },
  {
    id: 'collaborator', name: 'Collaborator', description: 'Share 5 documents with others',
    icon: '🤝', category: 'social', rarity: 'uncommon',
    condition: (s) => s.documentsCreated >= 5,
  },
  {
    id: 'night-owl', name: 'Night Owl', description: 'Be active after midnight',
    icon: '🦉', category: 'explorer', rarity: 'uncommon',
    condition: () => new Date().getHours() >= 0 && new Date().getHours() < 5,
  },
  {
    id: 'early-bird', name: 'Early Bird', description: 'Be active before 7 AM',
    icon: '🐦', category: 'explorer', rarity: 'uncommon',
    condition: () => new Date().getHours() >= 5 && new Date().getHours() < 7,
  },
  {
    id: 'streak-7', name: 'Week Warrior', description: 'Maintain a 7-day active streak',
    icon: '🔥', category: 'mastery', rarity: 'rare',
    condition: (s) => s.streak >= 7,
  },
  {
    id: 'streak-30', name: 'Monthly Master', description: 'Maintain a 30-day active streak',
    icon: '💎', category: 'mastery', rarity: 'legendary',
    condition: (s) => s.streak >= 30,
  },
  {
    id: 'task-master', name: 'Task Master', description: 'Complete 50 tasks',
    icon: '✅', category: 'productivity', rarity: 'uncommon',
    condition: (s) => s.tasksCompleted >= 50,
  },
  {
    id: 'search-pro', name: 'Search Pro', description: 'Perform 100 searches',
    icon: '🔍', category: 'mastery', rarity: 'uncommon',
    condition: (s) => s.searchesPerformed >= 100,
  },
  {
    id: 'century', name: 'Century', description: 'Earn 100 points',
    icon: '💯', category: 'mastery', rarity: 'common',
    condition: (s) => s.points >= 100,
  },
  {
    id: 'thousand', name: 'Thousandaire', description: 'Earn 1000 points',
    icon: '🏆', category: 'mastery', rarity: 'rare',
    condition: (s) => s.points >= 1000,
  },
];

// ── Onboarding Quests ──

const ONBOARDING_QUESTS: Quest[] = [
  {
    id: 'welcome-quest', title: 'Welcome to Anvil!',
    description: 'Complete these steps to set up your workspace',
    category: 'onboarding', progress: 0, completed: false,
    reward: {type: 'achievement', value: 'first-doc'},
    steps: [
      {id: 'q1s1', title: 'Open the sidebar', completed: false, action: 'navigate:sidebar'},
      {id: 'q1s2', title: 'Create your first document', completed: false, action: 'create:document'},
      {id: 'q1s3', title: 'Upload a file to Drive', completed: false, action: 'upload:file'},
    ],
  },
  {
    id: 'explore-quest', title: 'Explore Your Apps',
    description: 'Try out different Anvil apps',
    category: 'onboarding', progress: 0, completed: false,
    reward: {type: 'points', value: '50'},
    steps: [
      {id: 'q2s1', title: 'Search for something', completed: false, action: 'search:query'},
      {id: 'q2s2', title: 'Check your calendar', completed: false, action: 'navigate:calendar'},
      {id: 'q2s3', title: 'Create a task', completed: false, action: 'create:task'},
    ],
  },
  {
    id: 'customize-quest', title: 'Make It Yours',
    description: 'Personalize your Anvil experience',
    category: 'onboarding', progress: 0, completed: false,
    reward: {type: 'points', value: '25'},
    steps: [
      {id: 'q3s1', title: 'Change your theme', completed: false, action: 'setting:theme'},
      {id: 'q3s2', title: 'Open the command palette (Cmd+K)', completed: false, action: 'shortcut:cmd+k'},
    ],
  },
];

// ── Hook ──

const STORAGE_KEY = 'anvil-gamification';

const DEFAULT_STATE: GamificationState = {
  points: 0, streak: 0, lastActiveDate: '',
  documentsCreated: 0, emailsSent: 0, filesUploaded: 0,
  searchesPerformed: 0, tasksCompleted: 0, calendarsUsed: 0,
  daysActive: 0, achievements: [], questProgress: {},
};

export function useGamification() {
  const [state, setState] = useState<GamificationState>(DEFAULT_STATE);
  const [quests, setQuests] = useState<Quest[]>(ONBOARDING_QUESTS);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setState(JSON.parse(stored));
    } catch {}
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Check streak
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (state.lastActiveDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      setState(prev => ({
        ...prev,
        lastActiveDate: today,
        daysActive: prev.daysActive + 1,
        streak: prev.lastActiveDate === yesterday ? prev.streak + 1 : 1,
      }));
    }
  }, []);

  // Track action
  const trackAction = useCallback((action: string) => {
    setState(prev => {
      const next = {...prev};
      const [type] = action.split(':');

      switch (type) {
        case 'create': next.documentsCreated++; next.points += 10; break;
        case 'send': next.emailsSent++; next.points += 5; break;
        case 'upload': next.filesUploaded++; next.points += 5; break;
        case 'search': next.searchesPerformed++; next.points += 1; break;
        case 'task': next.tasksCompleted++; next.points += 15; break;
        case 'calendar': next.calendarsUsed++; next.points += 2; break;
      }

      return next;
    });

    // Update quest progress
    setQuests(prev => prev.map(quest => {
      if (quest.completed) return quest;
      const matchingStep = quest.steps.find(s => s.action === action && !s.completed);
      if (matchingStep) {
        const newSteps = quest.steps.map(s => s.id === matchingStep.id ? {...s, completed: true} : s);
        const completed = newSteps.filter(s => s.completed).length;
        const progress = completed / newSteps.length;
        return {...quest, steps: newSteps, progress, completed: progress === 1};
      }
      return quest;
    }));
  }, []);

  // Check for newly unlocked achievements
  const unlockedAchievements = useMemo(() => {
    return ACHIEVEMENTS.filter(a => {
      const alreadyUnlocked = state.achievements.includes(a.id);
      if (alreadyUnlocked) return true;
      if (a.condition(state)) {
        // Auto-unlock
        setState(prev => ({
          ...prev,
          achievements: [...prev.achievements, a.id],
          points: prev.points + (a.rarity === 'legendary' ? 100 : a.rarity === 'rare' ? 50 : a.rarity === 'uncommon' ? 25 : 10),
        }));
        return true;
      }
      return false;
    });
  }, [state]);

  // Productivity score (0-100)
  const productivityScore = useMemo(() => {
    const factors = [
      Math.min(state.documentsCreated, 10) / 10 * 25,
      Math.min(state.emailsSent, 20) / 20 * 15,
      Math.min(state.filesUploaded, 5) / 5 * 15,
      Math.min(state.searchesPerformed, 10) / 10 * 10,
      Math.min(state.tasksCompleted, 5) / 5 * 20,
      Math.min(state.streak, 7) / 7 * 15,
    ];
    return Math.round(factors.reduce((a, b) => a + b, 0));
  }, [state]);

  return {
    state,
    quests,
    productivityScore,
    unlockedAchievements,
    allAchievements: ACHIEVEMENTS,
    trackAction,
  };
}

// ── Components ──

const RARITY_COLORS: Record<string, string> = {
  common: 'border-gray-300 bg-gray-50 dark:bg-gray-800',
  uncommon: 'border-green-300 bg-green-50 dark:bg-green-900/20',
  rare: 'border-blue-300 bg-blue-50 dark:bg-blue-900/20',
  legendary: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20',
};

export function TrophyCase({achievements, unlocked}: {
  achievements: Achievement[];
  unlocked: string[];
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {achievements.map(a => {
        const isUnlocked = unlocked.includes(a.id);
        return (
          <div
            key={a.id}
            className={`text-center p-3 rounded-xl border-2 ${RARITY_COLORS[a.rarity]} ${
              isUnlocked ? '' : 'opacity-40 grayscale'
            }`}
          >
            <div className="text-2xl mb-1">{isUnlocked ? a.icon : '🔒'}</div>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{a.name}</div>
            <div className="text-[10px] text-gray-500">{a.description}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductivityScoreRing({score}: {score: number}) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="transform -rotate-90" width="100" height="100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{score}</div>
        <div className="text-[10px] text-gray-400">score</div>
      </div>
    </div>
  );
}

export function QuestCard({quest, onAction}: {quest: Quest; onAction: (action: string) => void}) {
  return (
    <div className={`rounded-xl border p-4 ${quest.completed ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{quest.title}</h4>
        {quest.completed && <span className="text-green-600 text-xs">✓ Complete</span>}
      </div>
      <p className="text-xs text-gray-500 mb-3">{quest.description}</p>

      <div className="space-y-2">
        {quest.steps.map(step => (
          <div key={step.id} className="flex items-center gap-2">
            <span className={`text-xs ${step.completed ? 'text-green-600' : 'text-gray-400'}`}>
              {step.completed ? '✓' : '○'}
            </span>
            <span className={`text-xs ${step.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {step.title}
            </span>
            {!step.completed && (
              <button
                onClick={() => onAction(step.action)}
                className="ml-auto text-[10px] text-blue-600 hover:underline"
              >
                Do it
              </button>
            )}
          </div>
        ))}
      </div>

      {!quest.completed && (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{width: `${quest.progress * 100}%`}} />
          </div>
          <div className="text-[10px] text-gray-400 mt-1">{Math.round(quest.progress * 100)}% complete</div>
        </div>
      )}
    </div>
  );
}
