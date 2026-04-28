import { useState, useEffect } from 'react';
import { WorkoutDay, WorkoutSet } from '../types';

export function useWorkoutStatus() {
  const [remainingSets, setRemainingSets] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's workout day
        const dayResponse = await fetch(`/api/workout/day?date=${today}`);
        if (dayResponse.ok) {
          const day: WorkoutDay = await dayResponse.json();
          
          // Get default set ID
          const defaultResponse = await fetch('/api/workout/default-set');
          let defaultSetId: string | null = null;
          if (defaultResponse.ok) {
            const defaultData = await defaultResponse.json();
            defaultSetId = defaultData.setId;
          }
          
          // Get all sets
          const setsResponse = await fetch('/api/workout/sets');
          let sets: WorkoutSet[] = [];
          if (setsResponse.ok) {
            const setsData = await setsResponse.json();
            sets = setsData.sets || [];
          }
          
          // Calculate remaining sets
          if (defaultSetId && sets.length > 0) {
            const setIds = day.sets.length > 0 ? day.sets : [defaultSetId, defaultSetId, defaultSetId];
            const completed = day.completed || {};
            
            // Count how many sets are incomplete
            let incompleteCount = 0;
            for (let i = 0; i < 3; i++) {
              const setId = setIds[i] || defaultSetId;
              const set = sets.find(s => s.id === setId);
              if (set) {
                const allCompleted = set.exercises.every((_, idx) => completed[`${i}-${idx}`]);
                if (!allCompleted) {
                  incompleteCount++;
                }
              } else {
                incompleteCount++;
              }
            }
            setRemainingSets(incompleteCount);
          } else {
            setRemainingSets(null);
          }
        } else {
          // No workout day exists, so all 3 sets are remaining
          setRemainingSets(3);
        }
      } catch (error) {
        console.error('Error loading workout status:', error);
        setRemainingSets(null);
      } finally {
        setLoading(false);
      }
    };
    
    loadStatus();
    
    // Refresh every 30 seconds to update the count
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return { remainingSets, loading };
}

