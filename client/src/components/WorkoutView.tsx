import { useState, useEffect } from 'react';
import { WorkoutSet, WorkoutDay } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkoutStatus } from '../hooks/useWorkoutStatus';

interface WorkoutViewProps {
  sets: WorkoutSet[];
  defaultSetId: string | null;
  onWorkoutDayChange: (day: WorkoutDay) => void;
}

export function WorkoutView({ sets, defaultSetId, onWorkoutDayChange }: WorkoutViewProps) {
  const { currentTheme } = useTheme();
  const { remainingSets } = useWorkoutStatus();
  const [selectedSetIds, setSelectedSetIds] = useState<string[]>([]);
  const [completedExercises, setCompletedExercises] = useState<Record<string, boolean>>({});
  const [celebratingSet, setCelebratingSet] = useState<number | null>(null);
  const [celebratingWorkout, setCelebratingWorkout] = useState(false);
  const [streak, setStreak] = useState<number>(0);

  useEffect(() => {
    // Load today's workout and streak
    const today = new Date().toISOString().split('T')[0];
    const loadWorkout = async () => {
      try {
        const [workoutResponse, streakResponse] = await Promise.all([
          fetch(`/api/workout/day?date=${today}`),
          fetch('/api/workout/streak'),
        ]);
        
        if (workoutResponse.ok) {
          const day: WorkoutDay = await workoutResponse.json();
          // Ensure we have 3 sets (pad with default if needed)
          const setIds = day.sets.length > 0 ? day.sets : [];
          while (setIds.length < 3 && defaultSetId) {
            setIds.push(defaultSetId);
          }
          setSelectedSetIds(setIds.slice(0, 3));
          setCompletedExercises(day.completed || {});
        } else if (workoutResponse.status === 404) {
          // Create new workout day with 3x default set
          setSelectedSetIds(defaultSetId ? [defaultSetId, defaultSetId, defaultSetId] : []);
          setCompletedExercises({});
        } else {
          // Error response, use defaults
          setSelectedSetIds(defaultSetId ? [defaultSetId, defaultSetId, defaultSetId] : []);
          setCompletedExercises({});
        }
        
        if (streakResponse.ok) {
          const streakData = await streakResponse.json();
          setStreak(streakData.streak || 0);
        }
      } catch (error) {
        console.error('Error loading workout:', error);
        // Default to 3x default set
        setSelectedSetIds(defaultSetId ? [defaultSetId, defaultSetId, defaultSetId] : []);
        setCompletedExercises({});
      }
    };
    loadWorkout();
  }, [defaultSetId]);

  const handleSetChange = (index: number, setId: string) => {
    const updated = [...selectedSetIds];
    updated[index] = setId;
    setSelectedSetIds(updated);
    
    // Clear completion for this set when changing sets
    const newCompleted = { ...completedExercises };
    Object.keys(newCompleted).forEach(key => {
      if (key.startsWith(`${index}-`)) {
        delete newCompleted[key];
      }
    });
    setCompletedExercises(newCompleted);
    
    const today = new Date().toISOString().split('T')[0];
    const updatedDay: WorkoutDay = {
      date: today,
      sets: updated,
      completed: newCompleted,
    };
    onWorkoutDayChange(updatedDay);
  };

  const toggleExercise = (setIndex: number, exerciseIndex: number) => {
    const key = `${setIndex}-${exerciseIndex}`;
    const newCompleted = {
      ...completedExercises,
      [key]: !completedExercises[key],
    };
    setCompletedExercises(newCompleted);
    
    const today = new Date().toISOString().split('T')[0];
    const updatedDay: WorkoutDay = {
      date: today,
      sets: selectedSetIds,
      completed: newCompleted,
    };
    onWorkoutDayChange(updatedDay);
    
    // Check if set is complete
    const setId = selectedSetIds[setIndex];
    const set = getSetById(setId);
    if (set) {
      const allCompleted = set.exercises.every((_, idx) => newCompleted[`${setIndex}-${idx}`]);
      if (allCompleted) {
        setCelebratingSet(setIndex);
        setTimeout(() => setCelebratingSet(null), 2000);
      }
    }
    
    // Check if entire workout is complete
    const allSetsComplete = [0, 1, 2].every(sIdx => {
      const sId = selectedSetIds[sIdx];
      const s = getSetById(sId);
      if (!s) return false;
      return s.exercises.every((_, eIdx) => newCompleted[`${sIdx}-${eIdx}`]);
    });
    
    if (allSetsComplete) {
      setCelebratingWorkout(true);
      setTimeout(() => setCelebratingWorkout(false), 3000);
      // Refresh streak when workout is completed
      fetch('/api/workout/streak')
        .then(res => res.ok ? res.json() : { streak: 0 })
        .then(data => setStreak(data.streak || 0))
        .catch(() => {});
    }
  };

  const getSetById = (setId: string | null): WorkoutSet | null => {
    if (!setId) return null;
    return sets.find(s => s.id === setId) || null;
  };

  const isExerciseCompleted = (setIndex: number, exerciseIndex: number): boolean => {
    return completedExercises[`${setIndex}-${exerciseIndex}`] || false;
  };

  const isSetComplete = (setIndex: number): boolean => {
    const setId = selectedSetIds[setIndex];
    const set = getSetById(setId);
    if (!set) return false;
    return set.exercises.every((_, idx) => isExerciseCompleted(setIndex, idx));
  };

  const isWorkoutComplete = (): boolean => {
    return [0, 1, 2].every(idx => isSetComplete(idx));
  };

  if (!defaultSetId || sets.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg mb-4" style={{ color: currentTheme.colors.text }}>
          No default set configured
        </p>
        <p className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
          Please create a set and set it as default in the Sets page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Celebration Overlay for Workout */}
      {celebratingWorkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-bounce">
            <div className="text-8xl mb-4">🎉</div>
            <div 
              className="text-4xl font-bold"
              style={{ color: currentTheme.colors.primary }}
            >
              Amazing! Workout Complete!
            </div>
            <div 
              className="text-xl mt-2"
              style={{ color: currentTheme.colors.textSecondary }}
            >
              You're crushing it! 💪
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: currentTheme.colors.text }}>
              Today's Workout
              {remainingSets !== null && remainingSets > 0 && (
                <span
                  className="ml-3 px-3 py-1 rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: currentTheme.colors.primary,
                    color: 'white',
                  }}
                >
                  {remainingSets} left
                </span>
              )}
            </h2>
            <p className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {streak > 0 && (
            <div
              className="px-4 py-2 rounded-lg border-2 flex items-center gap-2"
              style={{
                backgroundColor: currentTheme.colors.surface,
                borderColor: currentTheme.colors.primary,
              }}
            >
              <span className="text-2xl">🔥</span>
              <div>
                <div className="text-xs font-medium" style={{ color: currentTheme.colors.textSecondary }}>
                  Streak
                </div>
                <div className="text-xl font-bold" style={{ color: currentTheme.colors.primary }}>
                  {streak} {streak === 1 ? 'day' : 'days'}
                </div>
              </div>
            </div>
          )}
        </div>
        {isWorkoutComplete() && (
          <div className="mt-2 px-4 py-2 rounded-md inline-block animate-pulse" style={{ backgroundColor: currentTheme.colors.primary, color: 'white' }}>
            ✓ Workout Complete!
          </div>
        )}
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((index) => {
          const setId = selectedSetIds[index] || defaultSetId;
          const set = getSetById(setId);
          const setComplete = isSetComplete(index);
          const isCelebrating = celebratingSet === index;
          
          return (
            <div
              key={index}
              className={`p-6 rounded-lg border transition-all duration-300 ${
                setComplete ? 'ring-2 ring-offset-2' : ''
              } ${isCelebrating ? 'animate-pulse scale-105' : ''}`}
              style={{
                backgroundColor: setComplete 
                  ? (currentTheme.colors.primary + '15') 
                  : currentTheme.colors.surface,
                borderColor: setComplete 
                  ? currentTheme.colors.primary 
                  : currentTheme.colors.border,
                borderWidth: setComplete ? '2px' : '1px',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold" style={{ color: currentTheme.colors.text }}>
                    Set {index + 1}
                  </h3>
                  {setComplete && (
                    <span className="text-2xl animate-bounce">✓</span>
                  )}
                  {isCelebrating && (
                    <span className="text-xl animate-bounce">🎉</span>
                  )}
                </div>
                <select
                  value={setId}
                  onChange={(e) => handleSetChange(index, e.target.value)}
                  className="px-3 py-2 rounded-md text-sm"
                  style={{
                    backgroundColor: currentTheme.colors.background,
                    borderColor: currentTheme.colors.border,
                    color: currentTheme.colors.text,
                  }}
                >
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {set ? (
                <ul className="space-y-2">
                  {set.exercises.map((exercise, exIndex) => {
                    const completed = isExerciseCompleted(index, exIndex);
                    return (
                      <li
                        key={exIndex}
                        className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all duration-200 ${
                          completed ? 'opacity-75' : ''
                        }`}
                        style={{
                          backgroundColor: completed 
                            ? (currentTheme.colors.primary + '20')
                            : currentTheme.colors.background,
                        }}
                        onClick={() => toggleExercise(index, exIndex)}
                      >
                        <input
                          type="checkbox"
                          checked={completed}
                          onChange={() => toggleExercise(index, exIndex)}
                          className="w-5 h-5 rounded cursor-pointer"
                          style={{
                            accentColor: currentTheme.colors.primary,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span 
                          className={`flex-1 transition-all duration-200 ${
                            completed ? 'line-through' : ''
                          }`}
                          style={{ 
                            color: completed 
                              ? currentTheme.colors.textSecondary 
                              : currentTheme.colors.text,
                            textDecoration: completed ? 'line-through' : 'none',
                            textDecorationThickness: '2px',
                          }}
                        >
                          {exercise}
                        </span>
                        {completed && (
                          <span className="text-xl animate-bounce">✓</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
                  No set selected
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
