import { useMemo } from 'react';
import { CalendarEvent } from '../types';
import { EventCard } from './EventCard';
import { format, isToday, isTomorrow, startOfDay, isBefore } from 'date-fns';
import { Theme } from '../hooks/useTheme';

interface EventListProps {
  events: CalendarEvent[];
  onToggleCompleted: (uid: string) => void;
  onUpdateNotes: (uid: string, notes: string) => void;
  onDelete?: (uid: string) => void;
  getCourseColor: (course: string) => string;
  theme: Theme;
  courseOrder?: string[];
}

interface CourseGroup {
  course: string;
  events: CalendarEvent[];
  incompleteCount: number;
  allCompleted: boolean;
}

interface GroupedEvents {
  date: Date;
  label: string;
  courses: CourseGroup[];
}

export function EventList({ events, onToggleCompleted, onUpdateNotes, onDelete, getCourseColor, theme, courseOrder = [] }: EventListProps) {
  // Count completed and total
  const completionStats = useMemo(() => {
    const total = events.length;
    const completed = events.filter(e => e.completed).length;
    return { completed, total };
  }, [events]);

  const groupedEvents = useMemo(() => {
    if (events.length === 0) return [];

    const today = startOfDay(new Date());
    
    // Filter to only show events from today onward
    // Don't show past events in the list view - they should be marked completed and hidden
    const filteredEvents = events.filter((event) => {
      const eventDay = startOfDay(event.start);
      // Only show events from today onward
      return !isBefore(eventDay, today);
    });

    // Group events by day
    const dayGroups = new Map<string, CalendarEvent[]>();

    filteredEvents.forEach((event) => {
      const dayKey = format(startOfDay(event.start), 'yyyy-MM-dd');
      if (!dayGroups.has(dayKey)) {
        dayGroups.set(dayKey, []);
      }
      dayGroups.get(dayKey)!.push(event);
    });

    // Convert to array and group by course within each day
    const grouped: GroupedEvents[] = Array.from(dayGroups.entries())
      .map(([dayKey, dayEvents]) => {
        const date = new Date(dayKey + 'T00:00:00');
        let label = '';

        if (isToday(date)) {
          label = `Today, ${format(date, 'EEEE, MMMM d')}`;
        } else if (isTomorrow(date)) {
          label = `Tomorrow, ${format(date, 'EEEE, MMMM d')}`;
        } else {
          label = format(date, 'EEEE, MMMM d');
        }

        // Group events by course within this day
        const courseGroups = new Map<string, CalendarEvent[]>();
        dayEvents.forEach((event) => {
          if (!courseGroups.has(event.course)) {
            courseGroups.set(event.course, []);
          }
          courseGroups.get(event.course)!.push(event);
        });

        // Convert to array and create CourseGroup objects
        const courses: CourseGroup[] = Array.from(courseGroups.entries())
          .map(([course, courseEvents]) => {
            // Incomplete first (completed last), then by time — same as calendar
            courseEvents.sort((a, b) => {
              if (a.completed !== b.completed) return a.completed ? 1 : -1;
              return a.start.getTime() - b.start.getTime();
            });
            const incompleteCount = courseEvents.filter(e => !e.completed).length;
            const allCompleted = incompleteCount === 0 && courseEvents.length > 0;
            return { course, events: courseEvents, incompleteCount, allCompleted };
          })
          // All-completed courses at the bottom (same as calendar), then course order
          .sort((a, b) => {
            if (a.allCompleted !== b.allCompleted) return a.allCompleted ? 1 : -1;
            if (a.course === 'My Tasks') return -1;
            if (b.course === 'My Tasks') return 1;
            if (a.course === 'Other') return 1;
            if (b.course === 'Other') return -1;
            const aIndex = courseOrder.indexOf(a.course);
            const bIndex = courseOrder.indexOf(b.course);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.course.localeCompare(b.course);
          });

        return { date, label, courses };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return grouped;
  }, [events, courseOrder]);

  if (groupedEvents.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: theme.colors.textSecondary }}>
        No events found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Completion count */}
      <div className="mb-4 pb-3 border-b" style={{ borderColor: theme.colors.border }}>
        <h2 className="text-xl font-semibold" style={{ color: theme.colors.text }}>
          {completionStats.completed}/{completionStats.total} assignments completed
        </h2>
      </div>

      {groupedEvents.map((group) => (
        <div key={group.label} className="space-y-4">
          <div
            className="sticky top-0 py-2 z-10 border-b"
            style={{
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: theme.colors.text }}>
              {group.label}
            </h2>
          </div>
          <div className="space-y-4">
            {group.courses.map((courseGroup) => (
              <div key={courseGroup.course} className="space-y-3">
                <div
                  className="flex items-center gap-2 py-1"
                  style={{
                    borderBottom: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <h3
                    className={`text-base font-semibold ${courseGroup.allCompleted ? 'line-through' : ''}`}
                    style={{
                      color: courseGroup.allCompleted
                        ? theme.colors.textSecondary
                        : (getCourseColor(courseGroup.course) || theme.colors.text),
                      opacity: courseGroup.allCompleted ? 0.6 : 1,
                    }}
                  >
                        {courseGroup.course}:
                  </h3>
                  <span
                    className="text-sm"
                    style={{ 
                      color: courseGroup.allCompleted
                        ? theme.colors.textSecondary
                        : theme.colors.textSecondary,
                      opacity: courseGroup.allCompleted ? 0.6 : 1,
                    }}
                  >
                    {courseGroup.incompleteCount}
                  </span>
                </div>
                <div className="space-y-3 ml-4">
                  {courseGroup.events.map((event) => (
                    <EventCard
                      key={event.uid}
                      event={event}
                      onToggleCompleted={onToggleCompleted}
                      onUpdateNotes={onUpdateNotes}
                      onDelete={onDelete}
                      courseColor={getCourseColor(event.course)}
                      theme={theme}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
