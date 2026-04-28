import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../types';
import { format, isPast, isToday } from 'date-fns';
import { parseDescription } from '../utils/descriptionParser';
import { Theme } from '../hooks/useTheme';
import { isImportantAssessment } from '../utils/eventUtils';

interface EventCardProps {
  event: CalendarEvent;
  onToggleCompleted: (uid: string) => void;
  onUpdateNotes: (uid: string, notes: string) => void;
  onDelete?: (uid: string) => void;
  courseColor?: string;
  theme?: Theme;
}

export function EventCard({ event, onToggleCompleted, onUpdateNotes, onDelete, courseColor, theme }: EventCardProps) {
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(event.notes);

  const isOverdue = isPast(event.start) && !isToday(event.start) && !event.completed;
  const isTodayEvent = isToday(event.start);

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

  const defaultTheme = theme || {
    colors: {
      primary: '#3b82f6',
      secondary: '#06b6d4',
      accent: '#14b8a6',
      background: '#f0f9ff',
      surface: '#ffffff',
      text: '#111827',
      textSecondary: '#6b7280',
      border: '#e5e7eb',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      calendarBg: '#e0f2fe',
      calendarBorder: '#7dd3fc',
      calendarBorderOther: '#bae6fd',
    },
  };

  const getCardStyle = () => {
    if (event.completed) {
      return {
        backgroundColor: defaultTheme.colors.surface,
        borderColor: defaultTheme.colors.border,
        opacity: 0.6,
      };
    }
    if (isOverdue) {
      return {
        backgroundColor: defaultTheme.colors.error + '15',
        borderColor: defaultTheme.colors.error + '80',
      };
    }
    return {
      backgroundColor: defaultTheme.colors.surface,
      borderColor: courseColor && !isOverdue ? courseColor : defaultTheme.colors.border,
    };
  };

  return (
    <div
      className={`border-2 rounded-lg p-4 shadow-sm transition-all ${
        event.completed ? 'line-through' : ''
      }`}
      style={{
        ...getCardStyle(),
        ...(courseColor && !event.completed && isTodayEvent && {
          backgroundColor: courseColor + '20',
        }),
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            checked={event.completed}
            onChange={() => onToggleCompleted(event.uid)}
            className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isImportantAssessment(event.title) && (
                <span
                  className="text-xl font-bold"
                  style={{
                    color: defaultTheme.colors.error || '#ef4444',
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
                      className="font-semibold text-lg"
                      style={{
                        color: event.completed
                          ? defaultTheme.colors.textSecondary
                          : defaultTheme.colors.text,
                        opacity: event.completed ? 0.6 : 1,
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
                    <h3
                      className="font-semibold text-lg"
                      style={{
                        color: event.completed
                          ? defaultTheme.colors.textSecondary
                          : defaultTheme.colors.text,
                        opacity: event.completed ? 0.6 : 1,
                        textDecoration: event.completed ? 'line-through' : 'none',
                      }}
                    >
                      {event.title}
                    </h3>
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
                        color: courseColor || defaultTheme.colors.textSecondary,
                        backgroundColor: defaultTheme.colors.surface,
                        borderColor: defaultTheme.colors.border,
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
                        style={{ color: courseColor || defaultTheme.colors.textSecondary }}
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
                        color: defaultTheme.colors.error || '#ef4444',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = defaultTheme.colors.background;
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
                      color: defaultTheme.colors.textSecondary,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = defaultTheme.colors.background;
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
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="p-1 rounded transition-colors"
                    style={{
                      color: defaultTheme.colors.primary,
                      backgroundColor: showFullDescription ? defaultTheme.colors.background : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!showFullDescription) {
                        e.currentTarget.style.backgroundColor = defaultTheme.colors.background;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!showFullDescription) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                    title={showFullDescription ? 'Show less' : 'Show more'}
                  >
                    {showFullDescription ? '▲' : '▼'}
                  </button>
                </div>
              </div>
            </div>

            {showFullDescription && (
              <div className="mt-3 space-y-3 pt-3 border-t" style={{ borderColor: defaultTheme.colors.border }}>
                {/* Course and Date */}
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className="font-medium"
                    style={{
                      color: courseColor || defaultTheme.colors.primary || '#3b82f6',
                      opacity: event.completed ? 0.6 : 1,
                    }}
                  >
                    {event.course}
                  </span>
                  <span style={{ color: defaultTheme.colors.textSecondary }}>•</span>
                  <span
                    style={{
                      color: isOverdue && !event.completed
                        ? defaultTheme.colors.error
                        : isTodayEvent && !event.completed
                        ? defaultTheme.colors.primary
                        : defaultTheme.colors.textSecondary,
                      fontWeight: (isOverdue || isTodayEvent) && !event.completed ? '600' : 'normal',
                    }}
                  >
                    Due: {format(event.start, 'MMM d, yyyy h:mm a')}
                  </span>
                </div>

                {/* Location */}
                {event.location && (
                  <div className="text-sm" style={{ color: defaultTheme.colors.textSecondary }}>
                    <span className="font-medium">Location:</span> {event.location}
                  </div>
                )}

                {/* Description */}
                {event.description && (
                  <div className="text-sm" style={{ color: defaultTheme.colors.textSecondary }}>
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

              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
