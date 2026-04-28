import { useState, useEffect } from 'react';
import { WorkoutSet, WorkoutDay } from '../types';
import { WorkoutSets } from './WorkoutSets';
import { WorkoutView } from './WorkoutView';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkoutStatus } from '../hooks/useWorkoutStatus';

interface WorkoutProps {
  onBack?: () => void;
}

export function Workout({ onBack }: WorkoutProps) {
  const { currentTheme } = useTheme();
  const { remainingSets } = useWorkoutStatus();
  const [page, setPage] = useState<'sets' | 'workout'>('workout');
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [defaultSetId, setDefaultSetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkoutData();
  }, []);

  const loadWorkoutData = async () => {
    try {
      setLoading(true);
      const [setsResponse, defaultResponse] = await Promise.all([
        fetch('/api/workout/sets'),
        fetch('/api/workout/default-set'),
      ]);

      if (setsResponse.ok) {
        const setsData = await setsResponse.json();
        setSets(setsData.sets || []);
      }

      if (defaultResponse.ok) {
        const defaultData = await defaultResponse.json();
        setDefaultSetId(defaultData.setId || null);
      }
    } catch (error) {
      console.error('Error loading workout data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetsChange = async (newSets: WorkoutSet[]) => {
    setSets(newSets);
    try {
      await fetch('/api/workout/sets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sets: newSets }),
      });
    } catch (error) {
      console.error('Error saving sets:', error);
    }
  };

  const handleDefaultSetChange = async (setId: string | null) => {
    setDefaultSetId(setId);
    try {
      await fetch('/api/workout/default-set', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setId }),
      });
    } catch (error) {
      console.error('Error saving default set:', error);
    }
  };

  const handleWorkoutDayChange = async (day: WorkoutDay) => {
    try {
      await fetch('/api/workout/day', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(day),
      });
    } catch (error) {
      console.error('Error saving workout day:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: currentTheme.colors.background }}>
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: currentTheme.colors.primary }}
          ></div>
          <p style={{ color: currentTheme.colors.textSecondary }}>Loading workout data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: currentTheme.colors.background }}>
      {/* Workout Navbar */}
      <nav
        className="shadow-sm border-b"
        style={{
          backgroundColor: currentTheme.colors.surface,
          borderColor: currentTheme.colors.border,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                    color: currentTheme.colors.textSecondary,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = currentTheme.colors.background;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  ← Back
                </button>
              )}
              <h1
                className="text-xl font-bold"
                style={{ color: currentTheme.colors.text }}
              >
                Workout
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage('workout')}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: page === 'workout' ? currentTheme.colors.primary : 'transparent',
                  color: page === 'workout' ? 'white' : currentTheme.colors.textSecondary,
                }}
                onMouseEnter={(e) => {
                  if (page !== 'workout') {
                    e.currentTarget.style.backgroundColor = currentTheme.colors.background;
                  }
                }}
                onMouseLeave={(e) => {
                  if (page !== 'workout') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>Today's Workout</span>
                {remainingSets !== null && remainingSets > 0 && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: page === 'workout' ? 'rgba(255,255,255,0.3)' : currentTheme.colors.primary,
                      color: 'white',
                    }}
                  >
                    {remainingSets}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPage('sets')}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={{
                  backgroundColor: page === 'sets' ? currentTheme.colors.primary : 'transparent',
                  color: page === 'sets' ? 'white' : currentTheme.colors.textSecondary,
                }}
                onMouseEnter={(e) => {
                  if (page !== 'sets') {
                    e.currentTarget.style.backgroundColor = currentTheme.colors.background;
                  }
                }}
                onMouseLeave={(e) => {
                  if (page !== 'sets') {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                Manage Sets
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {page === 'sets' ? (
          <WorkoutSets
            sets={sets}
            defaultSetId={defaultSetId}
            onSetsChange={handleSetsChange}
            onDefaultSetChange={handleDefaultSetChange}
          />
        ) : (
          <WorkoutView
            sets={sets}
            defaultSetId={defaultSetId}
            onWorkoutDayChange={handleWorkoutDayChange}
          />
        )}
      </main>
    </div>
  );
}

