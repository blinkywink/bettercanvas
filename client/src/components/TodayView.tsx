import React, { useState, useMemo, useEffect } from 'react';
import { CalendarEvent } from '../types';
import { format, isToday } from 'date-fns';
import { parseDescription } from '../utils/descriptionParser';
import { isImportantAssessment } from '../utils/eventUtils';
import { Theme } from '../hooks/useTheme';

interface TodayViewProps {
  events: CalendarEvent[];
  onToggleCompleted: (uid: string) => void;
  onUpdateNotes: (uid: string, notes: string) => void;
  onDelete?: (uid: string) => void;
  getCourseColor: (course: string) => string;
  theme: Theme;
  courseOrder?: string[];
}


export function TodayView({ events, onToggleCompleted, onUpdateNotes, onDelete, getCourseColor, theme, courseOrder = [] }: TodayViewProps) {
  // Filter to only today's events
  const todayEvents = useMemo(() => {
    return events.filter((event) => isToday(event.start));
  }, [events]);

  // Count completed and total
  const completionStats = useMemo(() => {
    const total = todayEvents.length;
    const completed = todayEvents.filter(e => e.completed).length;
    return { completed, total };
  }, [todayEvents]);

  // Group by course
  const courseGroups = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    
    todayEvents.forEach((event) => {
      if (!groups.has(event.course)) {
        groups.set(event.course, []);
      }
      groups.get(event.course)!.push(event);
    });

    return Array.from(groups.entries())
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
      .sort((a, b) => {
        // All-completed courses at the bottom (same as calendar)
        if (a.allCompleted !== b.allCompleted) return a.allCompleted ? 1 : -1;
        // Then: My Tasks first, Other last
        if (a.course === 'My Tasks') return -1;
        if (b.course === 'My Tasks') return 1;
        if (a.course === 'Other') return 1;
        if (b.course === 'Other') return -1;
        // Use saved order if available
        const aIndex = courseOrder.indexOf(a.course);
        const bIndex = courseOrder.indexOf(b.course);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.course.localeCompare(b.course);
      });
  }, [todayEvents, courseOrder]);

  if (todayEvents.length === 0) {
    return (
      <div className="text-center py-12">
        <p style={{ color: theme.colors.textSecondary }}>No assignments due today!</p>
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

      {courseGroups.map((courseGroup) => (
        <div key={courseGroup.course} className="space-y-3">
          <div
            className="flex items-center gap-2 py-2 border-b"
            style={{ borderColor: theme.colors.border }}
          >
            <h3
              className={`text-lg font-semibold ${courseGroup.allCompleted ? 'line-through' : ''}`}
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
          <div className="space-y-2">
            {courseGroup.events.map((event) => (
              <TodayEventCard
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
  );
}

interface TodayEventCardProps {
  event: CalendarEvent;
  onToggleCompleted: (uid: string) => void;
  onUpdateNotes: (uid: string, notes: string) => void;
  onDelete?: (uid: string) => void;
  courseColor?: string;
  theme: Theme;
}

function TodayEventCard({ event, onToggleCompleted, onUpdateNotes, onDelete, courseColor, theme }: TodayEventCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(event.notes);
  const isImportant = isImportantAssessment(event.title);

  const handleNotesChange = (value: string) => {
    setNotesValue(value);
    onUpdateNotes(event.uid, value);
  };

  const handleNotesBlur = () => {
    setIsEditingNotes(false);
  };

  // Sync notesValue when event.notes changes
  useEffect(() => {
    setNotesValue(event.notes);
  }, [event.notes]);

  return (
    <div
      className="rounded-lg border p-4 transition-colors"
      style={{
        backgroundColor: event.completed
          ? theme.colors.surface
          : theme.colors.surface,
        borderColor: event.completed
          ? theme.colors.border
          : courseColor || theme.colors.border,
        opacity: event.completed ? 0.6 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={event.completed}
          onChange={() => onToggleCompleted(event.uid)}
          className="mt-1 w-5 h-5 rounded border-gray-300"
          style={{ accentColor: courseColor || theme.colors.primary }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isImportant && (
              <span
                className="text-lg font-bold"
                style={{
                  color: theme.colors.error || '#ef4444',
                  opacity: event.completed ? 0.6 : 1,
                }}
                title="Quiz, Test, or Exam"
              >
                !
              </span>
            )}
            <div className="flex-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {event.url ? (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-base"
                    style={{
                      color: event.completed
                        ? theme.colors.textSecondary
                        : theme.colors.text,
                      textDecoration: event.completed ? 'line-through' : 'none',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {event.title}
                  </a>
                ) : (
                  <h4
                    className="font-semibold text-base"
                    style={{
                      color: event.completed
                        ? theme.colors.textSecondary
                        : theme.colors.text,
                      textDecoration: event.completed ? 'line-through' : 'none',
                    }}
                  >
                    {event.title}
                  </h4>
                )}
                {isEditingNotes ? (
                  <input
                    type="text"
                    value={notesValue}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    onBlur={handleNotesBlur}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                      if (e.key === 'Escape') {
                        setNotesValue(event.notes);
                        setIsEditingNotes(false);
                      }
                    }}
                    className="text-sm italic px-2 py-1 rounded border flex-1"
                    style={{
                      color: courseColor || theme.colors.textSecondary,
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                      minWidth: '150px',
                      maxWidth: '100%',
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  event.notes && (
                    <span 
                      className="text-sm italic cursor-pointer"
                      style={{ color: courseColor || theme.colors.textSecondary }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditingNotes(true);
                      }}
                      title="Click to edit"
                    >
                      {event.notes}
                    </span>
                  )
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {event.uid.startsWith('custom-') && onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this task?')) {
                        onDelete(event.uid);
                      }
                    }}
                    className="p-1 rounded transition-colors"
                    style={{
                      color: theme.colors.error || '#ef4444',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.colors.background;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="Delete task"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingNotes(true);
                  }}
                  className="p-1 rounded transition-colors"
                  style={{
                    color: theme.colors.textSecondary,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.colors.background;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={event.notes ? 'Edit notes' : 'Add notes'}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded transition-colors"
                  style={{
                    color: theme.colors.primary,
                    backgroundColor: isExpanded ? theme.colors.background : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.backgroundColor = theme.colors.background;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                  title={isExpanded ? 'Show less' : 'Show more'}
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
              </div>
            </div>
          </div>

          {isExpanded && (
            <div className="mt-3 space-y-3 pt-3 border-t" style={{ borderColor: theme.colors.border }}>
              {/* Time */}
              <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
                <span className="font-medium">Due:</span>{' '}
                {format(event.start, 'MMM d, yyyy h:mm a')}
              </div>

              {/* Description */}
              {event.description && (
                <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
                  <div className="whitespace-pre-wrap">
                    {parseDescription(event.description).map((part, idx) => {
                      if (typeof part === 'string') {
                        return <span key={idx}>{part}</span>;
                      }
                      return <React.Fragment key={idx}>{part}</React.Fragment>;
                    })}
                  </div>
                </div>
              )}

              {/* Location */}
              {event.location && (
                <div className="text-sm" style={{ color: theme.colors.textSecondary }}>
                  <span className="font-medium">Location:</span> {event.location}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

