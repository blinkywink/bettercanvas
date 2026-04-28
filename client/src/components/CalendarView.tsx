import { useState, useRef, useEffect, useMemo } from 'react';
import { CalendarEvent } from '../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, isAfter, isBefore, isToday, isTomorrow } from 'date-fns';
import { EventCard } from './EventCard';
import { Theme } from '../hooks/useTheme';
import { isImportantAssessment } from '../utils/eventUtils';

type CalendarViewMode = 'month' | 'focused';

interface CalendarViewProps {
  events: CalendarEvent[];
  onToggleCompleted: (uid: string) => void;
  onUpdateNotes: (uid: string, notes: string) => void;
  onDelete?: (uid: string) => void;
  getCourseColor: (course: string) => string;
  theme: Theme;
  courseOrder?: string[];
  onDateSelect?: (date: string) => void;
}

export function CalendarView({ events, onToggleCompleted, onUpdateNotes, onDelete, getCourseColor, theme, courseOrder = [], onDateSelect }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('focused');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const shiftPressed = useRef(false);

  // Calculate days based on view mode
  const days = useMemo(() => {
    if (viewMode === 'month') {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    } else {
      // Focused view: current week + next 2 weeks (21 days)
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(addWeeks(currentWeek, 2), { weekStartsOn: 0 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }
  }, [viewMode, currentMonth, currentWeek]);

  const getEventsForDate = (date: Date) => {
    const dayEvents = events.filter((event) => isSameDay(event.start, date));
    // Sort events: incomplete first (so completed are always at the bottom), then by course order
    return [...dayEvents].sort((a, b) => {
      // Completed events always at the bottom
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      
      // If both same completion status, sort by course order
      if (a.course === 'My Tasks') return -1;
      if (b.course === 'My Tasks') return 1;
      if (a.course === 'Other') return 1;
      if (b.course === 'Other') return -1;
      
      const aIndex = courseOrder.indexOf(a.course);
      const bIndex = courseOrder.indexOf(b.course);
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      
      return a.course.localeCompare(b.course);
    });
  };

  const getEventsForDates = (dates: Date[]) => {
    const allEvents: CalendarEvent[] = [];
    dates.forEach((date) => {
      allEvents.push(...getEventsForDate(date));
    });
    // Sort by date
    return allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
  };

  // Count completed and total for selected dates, or all events if none selected
  const completionStats = useMemo(() => {
    let eventsToCount: CalendarEvent[];
    if (selectedDates.length > 0) {
      const allEvents: CalendarEvent[] = [];
      selectedDates.forEach((date) => {
        allEvents.push(...events.filter((event) => isSameDay(event.start, date)));
      });
      eventsToCount = allEvents;
    } else {
      eventsToCount = events;
    }
    const total = eventsToCount.length;
    const completed = eventsToCount.filter(e => e.completed).length;
    return { completed, total };
  }, [events, selectedDates]);

  // Group selected date events by day, then by course within each day
  const groupedSelectedEvents = useMemo(() => {
    if (selectedDates.length === 0) return [];
    
    // Helper function to group events by course
    const groupByCourse = (dayEvents: CalendarEvent[]) => {
      const courseGroups = new Map<string, CalendarEvent[]>();
      dayEvents.forEach((event) => {
        if (!courseGroups.has(event.course)) {
          courseGroups.set(event.course, []);
        }
        courseGroups.get(event.course)!.push(event);
      });
      
      // Convert to array and create course groups
      return Array.from(courseGroups.entries())
        .map(([course, courseEvents]) => {
          // Sort events within course: incomplete first (completed at bottom), then by time
          courseEvents.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return a.start.getTime() - b.start.getTime();
          });
          
          // Count incomplete assignments (only non-completed)
          const incompleteCount = courseEvents.filter(e => !e.completed).length;
          const allCompleted = incompleteCount === 0 && courseEvents.length > 0;
          
          return {
            course,
            events: courseEvents,
            incompleteCount,
            allCompleted,
          };
        })
        // All-completed courses at the bottom (same as Today/List), then course order
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
    };
    
    // If single day selected, group by course
    if (selectedDates.length === 1) {
      const dayEvents = events.filter((event) => isSameDay(event.start, selectedDates[0]));
      const courses = groupByCourse(dayEvents);
      
      return [{
        date: selectedDates[0],
        courses,
      }];
    }
    
    // Multiple days selected - group by day, then by course within each day
    const dayGroups = new Map<string, { date: Date; courses: Array<{ course: string; events: CalendarEvent[]; incompleteCount: number; allCompleted: boolean }> }>();
    
    selectedDates.forEach((date) => {
      const dayEvents = events.filter((event) => isSameDay(event.start, date));
      if (dayEvents.length === 0) return;
      
      const dayKey = format(date, 'yyyy-MM-dd');
      const courses = groupByCourse(dayEvents);
      
      dayGroups.set(dayKey, { date, courses });
    });
    
    // Convert to array and sort by date
    return Array.from(dayGroups.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [selectedDates, events, courseOrder]);

  const selectedDateEvents = selectedDates.length > 0 ? getEventsForDates(selectedDates) : [];

  const handleDayClick = (day: Date, e: React.MouseEvent) => {
    const selectedDate = format(day, 'yyyy-MM-dd');
    if (onDateSelect) {
      onDateSelect(selectedDate);
    }

    if (e.shiftKey && selectedDates.length > 0) {
      // Multi-select: select range from first selected date to clicked date
      const firstDate = selectedDates[0];
      const startDate = isBefore(day, firstDate) ? day : firstDate;
      const endDate = isAfter(day, firstDate) ? day : firstDate;
      
      const range: Date[] = [];
      let current = new Date(startDate);
      while (current <= endDate) {
        range.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      setSelectedDates(range);
    } else {
      // Single select
      setSelectedDates([day]);
    }
  };

  // Handle keyboard events for Shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed.current = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Completion count - only show when dates are selected */}
      {selectedDates.length > 0 && (
        <div className="mb-4 pb-3 border-b" style={{ borderColor: theme.colors.border }}>
          <h2 className="text-xl font-semibold" style={{ color: theme.colors.text }}>
            {completionStats.completed}/{completionStats.total} assignments completed{selectedDates.length > 1 ? ` (${selectedDates.length} days)` : ''}
          </h2>
        </div>
      )}

      {/* Calendar Header */}
      <div className="mb-6">
        {/* View Mode Selector */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => {
              setViewMode('focused');
              setCurrentWeek(new Date());
            }}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: viewMode === 'focused' ? theme.colors.primary : 'transparent',
              color: viewMode === 'focused' ? 'white' : theme.colors.textSecondary,
            }}
            onMouseEnter={(e) => {
              if (viewMode !== 'focused') {
                e.currentTarget.style.backgroundColor = theme.colors.background;
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'focused') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            Focused
          </button>
          <button
            onClick={() => {
              setViewMode('month');
              setCurrentMonth(new Date());
            }}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              backgroundColor: viewMode === 'month' ? theme.colors.primary : 'transparent',
              color: viewMode === 'month' ? 'white' : theme.colors.textSecondary,
            }}
            onMouseEnter={(e) => {
              if (viewMode !== 'month') {
                e.currentTarget.style.backgroundColor = theme.colors.background;
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'month') {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            Month
          </button>
        </div>

        {/* Navigation and Title */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              if (viewMode === 'month') {
                setCurrentMonth(subMonths(currentMonth, 1));
              } else {
                setCurrentWeek(subWeeks(currentWeek, 2));
              }
            }}
            className="p-2 rounded-md transition-colors"
            style={{
              color: theme.colors.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.background;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h2 className="text-xl font-semibold" style={{ color: theme.colors.text }}>
            {viewMode === 'month' 
              ? format(currentMonth, 'MMMM yyyy')
              : `${format(startOfWeek(currentWeek, { weekStartsOn: 0 }), 'MMM d')} - ${format(endOfWeek(addWeeks(currentWeek, 1), { weekStartsOn: 0 }), 'MMM d, yyyy')}`
            }
          </h2>
          <button
            onClick={() => {
              if (viewMode === 'month') {
                setCurrentMonth(addMonths(currentMonth, 1));
              } else {
                setCurrentWeek(addWeeks(currentWeek, 2));
              }
            }}
            className="p-2 rounded-md transition-colors"
            style={{
              color: theme.colors.text,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.background;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div
            key={day}
            className="text-center text-sm font-semibold py-2"
            style={{ color: theme.colors.textSecondary }}
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {days.map((day) => {
          const dayEvents = getEventsForDate(day);
          // In focused view, all days are "current month" (no distinction needed)
          const isCurrentMonth = viewMode === 'month' ? isSameMonth(day, currentMonth) : true;
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDates.some((d) => isSameDay(d, day));

          return (
            <button
              key={day.toString()}
              onClick={(e) => handleDayClick(day, e)}
              className={`h-[100px] p-1.5 rounded-md text-left border-2 flex flex-col transition-colors ${
                isToday ? 'ring-2' : ''
              } ${isSelected ? 'ring-2' : ''}`}
              style={{
                backgroundColor: isSelected
                  ? theme.colors.accent + '30'
                  : theme.colors.calendarBg,
                borderColor: isToday
                  ? theme.colors.primary
                  : isSelected
                  ? theme.colors.secondary
                  : isCurrentMonth
                  ? theme.colors.calendarBorder
                  : theme.colors.calendarBorderOther,
                borderStyle: isCurrentMonth ? 'solid' : 'dashed',
                ...(isToday && {
                  boxShadow: `0 0 0 2px ${theme.colors.primary}`,
                }),
                ...(isSelected && {
                  boxShadow: `0 0 0 2px ${theme.colors.secondary}`,
                }),
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = theme.colors.accent + '20';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.backgroundColor = theme.colors.calendarBg;
                }
              }}
            >
              <div className="text-sm font-medium mb-1 flex-shrink-0" style={{ color: theme.colors.text }}>
                {format(day, 'd')}
              </div>
              <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5" style={{ maxHeight: '75px' }}>
                {dayEvents.length === 0 ? (
                  <div className="text-xs py-1" style={{ color: theme.colors.textSecondary, opacity: 0.6 }}>—</div>
                ) : (
                  dayEvents.map((event) => {
                    const courseColor = getCourseColor(event.course);
                    const isImportant = isImportantAssessment(event.title);
                    return (
                      <div
                        key={event.uid}
                        className="text-xs px-1 py-0.5 rounded truncate flex-shrink-0 text-white flex items-center gap-0.5"
                        style={{
                          backgroundColor: event.completed
                            ? 'rgba(107, 114, 128, 0.7)'
                            : courseColor,
                          opacity: event.completed ? 0.7 : 1,
                          textDecoration: event.completed ? 'line-through' : 'none',
                        }}
                        title={event.title}
                      >
                        {isImportant && (
                          <span className="font-bold text-[10px] leading-none" style={{ color: '#ff0000' }}>
                            !
                          </span>
                        )}
                        {event.url ? (
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate"
                            style={{
                              color: 'inherit',
                              textDecoration: 'inherit',
                              cursor: 'pointer',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            {event.title}
                          </a>
                        ) : (
                          <span className="truncate">{event.title}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Date Events */}
      {selectedDates.length > 0 && (
        <div
          className="mt-6 p-4 rounded-lg"
          style={{
            backgroundColor: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: theme.colors.text }}>
                {selectedDates.length === 1
                  ? `Events for ${format(selectedDates[0], 'MMMM d, yyyy')}`
                  : `Events for ${selectedDates.length} selected days`}
              </h3>
              <p className="text-sm mt-1" style={{ color: theme.colors.textSecondary }}>
                {completionStats.completed}/{completionStats.total} assignments completed
              </p>
            </div>
            <button
              onClick={() => setSelectedDates([])}
              className="transition-colors"
              style={{ color: theme.colors.textSecondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.colors.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.colors.textSecondary;
              }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          {selectedDates.length > 1 && (
            <div className="mb-4 text-sm" style={{ color: theme.colors.textSecondary }}>
              Selected: {selectedDates.map((d, i) => (
                <span key={i}>
                  {format(d, 'MMM d')}
                  {i < selectedDates.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
          {selectedDateEvents.length === 0 ? (
            <p style={{ color: theme.colors.textSecondary }}>No events for selected day(s)</p>
          ) : (
            <div className="space-y-6">
              {groupedSelectedEvents.map((dayGroup, dayIdx) => (
                <div key={dayIdx} className="space-y-4">
                  {selectedDates.length > 1 && (
                    <div
                      className="sticky top-0 py-3 z-10 mb-2"
                      style={{
                        borderBottom: `2px solid ${theme.colors.border}`,
                      }}
                    >
                      <h3 className="text-lg font-semibold" style={{ color: theme.colors.text }}>
                        {isToday(dayGroup.date)
                          ? `Today, ${format(dayGroup.date, 'EEEE, MMMM d')}`
                          : isTomorrow(dayGroup.date)
                          ? `Tomorrow, ${format(dayGroup.date, 'EEEE, MMMM d')}`
                          : format(dayGroup.date, 'EEEE, MMMM d')}
                      </h3>
                    </div>
                  )}
                  <div className="space-y-4">
                    {dayGroup.courses.map((courseGroup) => (
                      <div key={courseGroup.course} className="space-y-3">
                        <div
                          className="flex items-center gap-2 py-1"
                          style={{
                            borderBottom: `1px solid ${theme.colors.border}`,
                          }}
                        >
                          <h4
                            className={`text-base font-semibold ${courseGroup.allCompleted ? 'line-through' : ''}`}
                            style={{
                              color: courseGroup.allCompleted
                                ? theme.colors.textSecondary
                                : (getCourseColor(courseGroup.course) || theme.colors.text),
                              opacity: courseGroup.allCompleted ? 0.6 : 1,
                            }}
                          >
                                 {courseGroup.course}:
                          </h4>
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
          )}
        </div>
      )}
    </div>
  );
}
