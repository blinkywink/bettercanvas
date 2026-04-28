export interface CalendarEvent {
  uid: string;
  title: string;
  course: string;
  description: string;
  start: Date;
  end?: Date;
  location?: string;
  url?: string;
  completed: boolean;
  notes: string;
}

export type ViewMode = 'today' | 'calendar' | 'list' | 'workout';

export interface WorkoutSet {
  id: string;
  name: string;
  exercises: string[]; // 3-5 exercises
}

export interface WorkoutDay {
  date: string; // ISO date string
  sets: string[]; // Array of set IDs (default is 3x default set)
  completed?: Record<string, boolean>; // Map of "setIndex-exerciseIndex" to completion status
}
