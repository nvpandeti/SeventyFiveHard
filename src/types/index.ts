export interface AppUser {
  id: string;
  email: string;
  name?: string;
  username?: string;
  avatar?: string;
  current_day?: number;
  completed_days?: number;
  start_date?: string;
  created?: string;
  updated?: string;
}

export interface DailyLog {
  id: string;
  user: string;
  date: string; // ISO YYYY-MM-DD
  diet_ok: boolean;
  workout_1: boolean;
  workout_2: boolean;
  water_ok: boolean;
  reading_ok: boolean;
  progress_photo?: string;
  completed: boolean;
  created?: string;
  updated?: string;
  expand?: {
    user?: AppUser;
  };
}

export type TaskKey =
  | 'diet_ok'
  | 'workout_1'
  | 'workout_2'
  | 'water_ok'
  | 'reading_ok';

export interface TaskDefinition {
  key: TaskKey;
  title: string;
  description: string;
  icon: string; // emoji fallback for zero-dep icons
}

export const TASKS: TaskDefinition[] = [
  {
    key: 'diet_ok',
    title: 'Diet',
    description: 'Stick to a diet — no cheat meals, no alcohol.',
    icon: '🥗',
  },
  {
    key: 'workout_1',
    title: 'Workout #1',
    description: 'First 45-minute workout.',
    icon: '💪',
  },
  {
    key: 'workout_2',
    title: 'Workout #2 (Outdoors)',
    description: 'Second 45-minute workout — must be outdoors.',
    icon: '🌤️',
  },
  {
    key: 'water_ok',
    title: 'Water',
    description: 'Drink 1 gallon (3.78L) of water.',
    icon: '💧',
  },
  {
    key: 'reading_ok',
    title: 'Reading',
    description: 'Read 10 pages of a non-fiction / self-improvement book.',
    icon: '📖',
  },
];
