import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent } from '../types';
import { startOfDay, isBefore, addDays } from 'date-fns';

interface EventResponse {
  uid: string;
  title: string;
  course: string;
  description: string;
  start: string;
  end?: string;
  location?: string;
  url?: string;
}

export function useEvents(profileId: string = 'default') {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load both ICS events and custom events
      const [icsResponse, customResponse] = await Promise.all([
        fetch(`/api/events?profile=${profileId}`),
        fetch(`/api/custom-events?profile=${profileId}`),
      ]);

      if (!icsResponse.ok) {
        throw new Error('Failed to load events');
      }

      const icsData: EventResponse[] = await icsResponse.json();
      const customData: EventResponse[] = customResponse.ok ? await customResponse.json() : [];
      
      // Combine both types of events
      const data: EventResponse[] = [...icsData, ...customData];

      // Load saved state from server (profile-specific)
      let savedCompleted: Record<string, boolean> = {};
      let savedNotes: Record<string, string> = {};
      let hasInitialized = false;
      
      try {
        const [completedResponse, notesResponse, initializedResponse] = await Promise.all([
          fetch(`/api/user-state/completed?profile=${profileId}`),
          fetch(`/api/user-state/notes?profile=${profileId}`),
          fetch(`/api/user-state/initialized?profile=${profileId}`),
        ]);
        
        if (completedResponse.ok) {
          savedCompleted = await completedResponse.json();
          console.log('Loaded completion status from server:', savedCompleted);
        } else {
          console.warn('Failed to load completion status:', completedResponse.status, completedResponse.statusText);
        }
        if (notesResponse.ok) {
          savedNotes = await notesResponse.json();
        } else {
          console.warn('Failed to load notes:', notesResponse.status, notesResponse.statusText);
        }
        if (initializedResponse.ok) {
          const initializedData = await initializedResponse.json();
          hasInitialized = initializedData.initialized === true;
        } else {
          console.warn('Failed to load initialized status:', initializedResponse.status, initializedResponse.statusText);
        }
      } catch (error) {
        // If server endpoints fail, use empty defaults
        console.error('Error loading user state:', error);
        alert(`Error loading saved data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      const today = startOfDay(new Date());
      const completed: Record<string, boolean> = { ...savedCompleted };

      // Merge API data with saved state
      let mergedEvents: CalendarEvent[] = data.map((event) => {
        const eventDate = new Date(event.start);
        const eventDay = startOfDay(eventDate);
        
        // Migrate old "My Events" to "My Tasks"
        if (event.course === 'My Events') {
          event.course = 'My Tasks';
        }
        
        // On first load, mark all past events (before today) as completed (one-time thing)
        let isCompleted = savedCompleted[event.uid] || false;
        if (!hasInitialized && isBefore(eventDay, today)) {
          isCompleted = true;
          completed[event.uid] = true;
        }

        // Auto-move custom events that aren't completed on their due date
        // Only move if the day has actually passed (after midnight), not if it's still today
        let finalStartDate = eventDate;
        const isCustomEvent = event.uid.startsWith('custom-');
        if (isCustomEvent && !isCompleted) {
          // Only move if the event date is in the past (before today), not if it's today
          if (isBefore(eventDay, today)) {
            // Check if we've already moved it today (to avoid infinite updates)
            // Use a simple in-memory check for this session
            const lastMovedKey = `last-moved-${profileId}-${event.uid}`;
            const lastMovedDate = sessionStorage.getItem(lastMovedKey);
            const todayStr = today.toISOString().split('T')[0];
            
            // Only move if we haven't moved it today
            if (lastMovedDate !== todayStr) {
              // Move to tomorrow
              finalStartDate = addDays(today, 1);
              // Update the custom event on the server (async, don't wait)
              fetch(`/api/custom-events/${event.uid}?profile=${profileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: finalStartDate.toISOString() }),
              }).catch(console.error);
              // Mark that we moved it today (sessionStorage is fine for this)
              sessionStorage.setItem(lastMovedKey, todayStr);
            }
          }
        }

        return {
          ...event,
          start: finalStartDate,
          end: event.end ? new Date(event.end) : undefined,
          url: event.url,
          completed: isCompleted,
          notes: savedNotes[event.uid] || '',
        };
      });

      // Save the auto-completed past events if this is the first initialization
      if (!hasInitialized && Object.keys(completed).length > 0) {
        console.log('Marking past events as completed:', completed);
        await Promise.all([
          fetch(`/api/user-state/completed?profile=${profileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completed),
          })
          .then(async response => {
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Failed to save completion status: ${response.status} ${errorText}`);
            }
            console.log('Successfully saved auto-completed past events');
          })
          .catch(error => {
            console.error('Error saving auto-completed events:', error);
          }),
          fetch(`/api/user-state/initialized?profile=${profileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initialized: true }),
          })
          .then(async response => {
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Failed to save initialized status: ${response.status} ${errorText}`);
            }
            console.log('Successfully saved initialized status');
          })
          .catch(error => {
            console.error('Error saving initialized status:', error);
          }),
        ]);
      }

      setEvents(mergedEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  const toggleCompleted = useCallback((uid: string) => {
    setEvents((prev) => {
      const updated = prev.map((event) =>
        event.uid === uid
          ? { ...event, completed: !event.completed }
          : event
      );

      // Update server (profile-specific)
      const completed: Record<string, boolean> = {};
      updated.forEach((event) => {
        if (event.completed) {
          completed[event.uid] = true;
        }
      });
      
      // Save to server (async, don't wait)
      const tabId = sessionStorage.getItem('bct-tab-id') || '';
      fetch(`/api/user-state/completed?profile=${profileId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'X-Tab-ID': tabId,
        },
        body: JSON.stringify(completed),
      })
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save completion status: ${response.status} ${errorText}`);
        }
        console.log('Successfully saved completion status:', completed);
      })
      .catch(error => {
        console.error('Error saving completion status:', error);
        alert(`Failed to save completion status: ${error.message}`);
      });

      return updated;
    });
  }, [profileId]);

  // Debounce timer for notes updates
  const notesSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventsRef = useRef<CalendarEvent[]>([]);

  // Keep eventsRef in sync with events state
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const updateNotes = useCallback((uid: string, notes: string) => {
    setEvents((prev) => {
      const updated = prev.map((event) =>
        event.uid === uid ? { ...event, notes } : event
      );

      // Update ref immediately
      eventsRef.current = updated;

      // Clear existing timer
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }

      // Debounce server save (wait 500ms after last keystroke)
      notesSaveTimerRef.current = setTimeout(() => {
        // Use current state from ref (always up-to-date)
        const notesMap: Record<string, string> = {};
        eventsRef.current.forEach((event) => {
          if (event.notes) {
            notesMap[event.uid] = event.notes;
          }
        });
        
        // Save to server
        const tabId = sessionStorage.getItem('bct-tab-id') || '';
        fetch(`/api/user-state/notes?profile=${profileId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'X-Tab-ID': tabId,
          },
          body: JSON.stringify(notesMap),
        })
        .then(async response => {
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save notes: ${response.status} ${errorText}`);
          }
          console.log('Successfully saved notes');
        })
        .catch(error => {
          console.error('Error saving notes:', error);
        });
      }, 500);

      return updated;
    });
  }, [profileId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (notesSaveTimerRef.current) {
        clearTimeout(notesSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Real-time sync disabled - user will manually refresh if needed

  return {
    events,
    loading,
    error,
    refresh: loadEvents,
    toggleCompleted,
    updateNotes,
  };
}
