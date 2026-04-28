import { useState, useMemo, useEffect } from 'react';
import { useEvents } from './hooks/useEvents';
import { useCourseColors } from './hooks/useCourseColors';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { CalendarView } from './components/CalendarView';
import { CourseFilter } from './components/CourseFilter';
import { Settings } from './components/Settings';
import { CreateEventModal } from './components/CreateEventModal';
import { CalendarEvent } from './types';

function AppContent({ profileId }: { profileId: string }) {
  const { currentTheme } = useTheme();
  const [currentProfileId, setCurrentProfileId] = useState<string>(profileId);
  
  // Update when profileId prop changes
  useEffect(() => {
    setCurrentProfileId(profileId);
  }, [profileId]);
  
  const { events, loading, error, refresh, toggleCompleted, updateNotes } = useEvents(currentProfileId);
  
  const handleDeleteEvent = async (uid: string) => {
    if (!uid.startsWith('custom-')) return;
    
    try {
      const tabId = sessionStorage.getItem('bct-tab-id') || '';
      const response = await fetch(`/api/custom-events/${uid}?profile=${currentProfileId}`, {
        method: 'DELETE',
        headers: {
          'X-Tab-ID': tabId,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete event');
      }
      
      // Refresh events to remove the deleted one
      refresh();
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete task');
    }
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  // Get unique courses
  const courses = useMemo(() => {
    const courseSet = new Set(events.map((e) => e.course));
    return Array.from(courseSet).sort();
  }, [events]);

  // Course colors and filtering
  const {
    courseColors,
    updateCourseColor,
    toggleCourseVisibility,
    getCourseColor,
    visibleCourses,
    updateCourseOrder,
  } = useCourseColors(courses, currentProfileId);

  // Filter and search events
  const filteredEvents = useMemo(() => {
    let filtered: CalendarEvent[] = events;

    // Filter by visible courses (class filter)
    filtered = filtered.filter((e) => visibleCourses.includes(e.course));

    // Filter by completed
    if (hideCompleted) {
      filtered = filtered.filter((e) => !e.completed);
    }

    // Filter by course (legacy filter, can be removed if using class filter)
    if (selectedCourse !== 'all') {
      filtered = filtered.filter((e) => e.course === selectedCourse);
    }

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.course.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [events, selectedCourse, searchQuery, hideCompleted, visibleCourses]);


  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: currentTheme.colors.background }}
      >
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: currentTheme.colors.primary }}
          ></div>
          <p style={{ color: currentTheme.colors.textSecondary }}>Loading events...</p>
        </div>
      </div>
    );
  }

  if (error && error !== 'Failed to load events') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: currentTheme.colors.background }}
      >
        <div className="text-center">
          <p className="mb-4" style={{ color: currentTheme.colors.error }}>
            Error: {error}
          </p>
          <button
            onClick={refresh}
            className="px-4 py-2 rounded-md text-white transition-opacity"
            style={{ backgroundColor: currentTheme.colors.primary }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Show message if no events and not loading (likely no profile)
  if (!loading && events.length === 0 && !error) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: currentTheme.colors.background }}>
        {/* Navbar */}
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
                <h1
                  className="text-xl font-bold"
                  style={{ color: currentTheme.colors.text }}
                >
                  Better Calendar Tasks
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <Settings
                  currentProfileId={currentProfileId}
                  onProfileChange={async (profileId) => {
                    setCurrentProfileId(profileId);
                    // Save to server
                    await fetch('/api/user-state/profile', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ profileId }),
                    }).catch(console.error);
                    // Reload page to refresh theme and all data
                    window.location.reload();
                  }}
                  onHardReset={async () => {
                    setCurrentProfileId('default');
                    // Save to server
                    await fetch('/api/user-state/profile', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ profileId: 'default' }),
                    }).catch(console.error);
                    // Reload page
                    window.location.reload();
                  }}
                />
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <p className="mb-4 text-lg" style={{ color: currentTheme.colors.text }}>
              No profile found. Please upload an ICS file to get started.
            </p>
            <p className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
              Click the settings icon in the top right to upload a new profile.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: currentTheme.colors.background }}>
      {/* Navbar */}
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
              <h1
                className="text-xl font-bold"
                style={{ color: currentTheme.colors.text }}
              >
                Better Calendar Tasks
              </h1>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateEventModal(true)}
                  className="p-1 rounded-md transition-colors"
                  style={{
                    color: currentTheme.colors.textSecondary,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = currentTheme.colors.background;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Create custom event"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Settings
                currentProfileId={currentProfileId}
                onProfileChange={async (profileId) => {
                  setCurrentProfileId(profileId);
                  // Save to server
                  await fetch('/api/user-state/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId }),
                  }).catch(console.error);
                  // Reload page to refresh theme and all data
                  window.location.reload();
                }}
                onHardReset={async () => {
                  setCurrentProfileId('default');
                  // Save to server
                  await fetch('/api/user-state/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId: 'default' }),
                  }).catch(console.error);
                  // Reload page
                  window.location.reload();
                }}
                courses={courses}
                updateCourseOrder={updateCourseOrder}
              />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CalendarView
          events={filteredEvents}
          onToggleCompleted={toggleCompleted}
          onUpdateNotes={updateNotes}
          onDelete={handleDeleteEvent}
          getCourseColor={getCourseColor}
          theme={currentTheme}
          courseOrder={courseColors.map(cc => cc.course).filter(c => c !== 'My Tasks' && c !== 'Other')}
          onDateSelect={setSelectedCalendarDate}
        />

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowFiltersPanel((v) => !v)}
            className="px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              backgroundColor: currentTheme.colors.surface,
              border: `1px solid ${currentTheme.colors.border}`,
              color: currentTheme.colors.text,
            }}
          >
            <span>{showFiltersPanel ? 'Hide filters' : 'Show filters'}</span>
            <span style={{ color: currentTheme.colors.textSecondary }}>{showFiltersPanel ? '▲' : '▼'}</span>
          </button>

          {showFiltersPanel && (
            <div className="mt-4 space-y-4">
              {courseColors.length > 0 && (
                <CourseFilter
                  courses={courseColors}
                  onColorChange={updateCourseColor}
                  onVisibilityToggle={toggleCourseVisibility}
                />
              )}

              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search events by title, course, or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 pl-10 border rounded-md shadow-sm"
                    style={{
                      backgroundColor: currentTheme.colors.surface,
                      borderColor: currentTheme.colors.border,
                      color: currentTheme.colors.text,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = currentTheme.colors.primary;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = currentTheme.colors.border;
                    }}
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-5 w-5"
                    style={{ color: currentTheme.colors.textSecondary }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" style={{ color: currentTheme.colors.text }}>
                      Course:
                    </label>
                    <select
                      value={selectedCourse}
                      onChange={(e) => setSelectedCourse(e.target.value)}
                      className="px-3 py-1 border rounded-md shadow-sm text-sm"
                      style={{
                        backgroundColor: currentTheme.colors.surface,
                        borderColor: currentTheme.colors.border,
                        color: currentTheme.colors.text,
                      }}
                    >
                      <option value="all">All Courses</option>
                      {courses.map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideCompleted}
                      onChange={(e) => setHideCompleted(e.target.checked)}
                      className="w-4 h-4 rounded"
                      style={{
                        borderColor: currentTheme.colors.border,
                        accentColor: currentTheme.colors.primary,
                      }}
                    />
                    <span className="text-sm font-medium" style={{ color: currentTheme.colors.text }}>
                      Hide completed
                    </span>
                  </label>

                  <div className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
                    Showing {filteredEvents.length} of {events.length} events
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <CreateEventModal
        isOpen={showCreateEventModal}
        defaultDate={selectedCalendarDate || undefined}
        onClose={() => setShowCreateEventModal(false)}
        onCreate={async (eventData) => {
          try {
            const tabId = sessionStorage.getItem('bct-tab-id') || '';
            const response = await fetch(`/api/custom-events?profile=${currentProfileId}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Tab-ID': tabId,
              },
              body: JSON.stringify(eventData),
            });

            if (!response.ok) {
              throw new Error('Failed to create event');
            }

            const created = await response.json();

            // If user entered a description, also save it into Notes for this event
            // so it appears in the same notes UI used by other events.
            const descriptionText = eventData.description?.trim();
            const createdUid = created?.event?.uid as string | undefined;
            if (descriptionText && createdUid) {
              try {
                const notesResponse = await fetch(`/api/user-state/notes?profile=${currentProfileId}`);
                const existingNotes = notesResponse.ok ? await notesResponse.json() : {};
                const updatedNotes = {
                  ...existingNotes,
                  [createdUid]: descriptionText,
                };

                await fetch(`/api/user-state/notes?profile=${currentProfileId}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Tab-ID': tabId,
                  },
                  body: JSON.stringify(updatedNotes),
                });
              } catch (noteError) {
                console.error('Created event, but failed to save description to notes:', noteError);
              }
            }

            // Refresh events to show the new one
            refresh();
          } catch (error) {
            console.error('Error creating event:', error);
            alert('Failed to create event');
          }
        }}
      />
    </div>
  );
}

function App() {
  const [currentProfileId, setCurrentProfileId] = useState<string>('default');
  const [profileLoaded, setProfileLoaded] = useState(false);
  
  // Load profile from server on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await fetch('/api/user-state/profile');
        if (response.ok) {
          const data = await response.json();
          if (data.profileId) {
            setCurrentProfileId(data.profileId);
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setProfileLoaded(true);
      }
    };
    loadProfile();
  }, []);

  if (!profileLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f9ff' }}>
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <ThemeProvider profileId={currentProfileId}>
      <AppContent profileId={currentProfileId} />
    </ThemeProvider>
  );
}

export default App;
