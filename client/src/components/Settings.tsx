import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface Profile {
  id: string;
  name: string;
  createdAt: string;
}

interface SettingsProps {
  currentProfileId: string;
  onProfileChange: (profileId: string) => void;
  onHardReset: () => void;
  courses?: string[];
  updateCourseOrder?: (order: string[]) => void;
}

export function Settings({ currentProfileId, onProfileChange, onHardReset, courses = [], updateCourseOrder }: SettingsProps) {
  const { currentTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingProfileName, setEditingProfileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [preserveState, setPreserveState] = useState(true);
  const [newProfileName, setNewProfileName] = useState('');
  const [isNewProfile, setIsNewProfile] = useState(true);
  const [draggedCourse, setDraggedCourse] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [localCourseOrder, setLocalCourseOrder] = useState<string[]>([]);
  const [passwordAuthEnabled, setPasswordAuthEnabled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load saved order from localStorage
  useEffect(() => {
    if (isOpen && courses.length > 0) {
      const STORAGE_KEY_ORDER = 'canvas-planner-course-order';
      const savedOrder = JSON.parse(localStorage.getItem(STORAGE_KEY_ORDER) || '[]');
      // Filter to only include courses that exist
      const filteredOrder = savedOrder.filter((c: string) => courses.includes(c));
      // Add any courses not in the saved order
      const unorderedCourses = courses.filter(c => !filteredOrder.includes(c) && c !== 'My Tasks' && c !== 'My Events' && c !== 'Other');
      setLocalCourseOrder([...filteredOrder, ...unorderedCourses]);
    }
  }, [isOpen, courses]);
  
  // Filter out "My Tasks", "My Events" (old name), and "Other" from reorderable courses
  // Use localCourseOrder if available, otherwise use courses
  const reorderableCourses = localCourseOrder.length > 0 
    ? localCourseOrder.filter(c => c !== 'My Tasks' && c !== 'My Events' && c !== 'Other' && courses.includes(c))
    : courses.filter(c => c !== 'My Tasks' && c !== 'My Events' && c !== 'Other');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowUpload(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      loadProfiles();
      fetch('/api/auth/status')
        .then((r) => (r.ok ? r.json() : { enabled: false }))
        .then((d) => setPasswordAuthEnabled(!!d.enabled))
        .catch(() => setPasswordAuthEnabled(false));
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadProfiles = async () => {
    try {
      const response = await fetch('/api/profiles');
      if (response.ok) {
        const data = await response.json();
        setProfiles(data);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.ics')) {
      setUploadError('Please select a .ics file');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formData = new FormData();
      formData.append('icsFile', file);
      formData.append('profileId', isNewProfile ? `profile-${Date.now()}` : currentProfileId);
      formData.append('profileName', newProfileName || (isNewProfile ? `Profile ${Date.now()}` : currentProfileId));
      formData.append('isUpdate', (!isNewProfile).toString());

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result = await response.json();
      setUploadSuccess(result.message);
      
      // Reload profiles and switch to the new/updated profile
      await loadProfiles();
      if (result.profileId) {
        onProfileChange(result.profileId);
      }
      
      // Reset form
      setNewProfileName('');
      setIsNewProfile(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // If not preserving state, clear profile-specific localStorage
      if (!preserveState) {
        const profileId = result.profileId || currentProfileId;
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes(`canvas-planner-${profileId}-`) || (profileId === 'default' && key.startsWith('canvas-planner-') && !key.includes('-profile-')))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
      
      // Reload the page to refresh events
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRenameProfile = async (profileId: string, newName: string) => {
    if (!newName.trim()) {
      return;
    }

    try {
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rename profile');
      }

      await loadProfiles();
      setEditingProfileId(null);
      setEditingProfileName('');
    } catch (error) {
      console.error('Failed to rename profile:', error);
      alert(error instanceof Error ? error.message : 'Failed to rename profile');
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      const response = await fetch(`/api/profiles/${profileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete profile');
      }

      await loadProfiles();
      setShowDeleteConfirm(null);

      // If we deleted the current profile, switch to default
      if (profileId === currentProfileId) {
        onProfileChange('default');
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
      alert('Failed to delete profile');
    }
  };

  const handleHardReset = async () => {
    if (confirm('Are you sure you want to reset everything? This will clear all completed assignments, notes, settings, and delete all profiles including the default.')) {
      // Load profiles first to make sure we have the latest list
      try {
        const response = await fetch('/api/profiles');
        if (response.ok) {
          const profilesToDelete = await response.json();
          
          // Delete all profiles including default
          for (const profile of profilesToDelete) {
            try {
              await fetch(`/api/profiles/${profile.id}`, {
                method: 'DELETE',
              });
            } catch (error) {
              console.error(`Error deleting profile ${profile.id}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Error loading/deleting profiles:', error);
      }
      
      localStorage.clear();
      onHardReset();
      window.location.reload();
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md transition-colors"
        style={{ color: currentTheme.colors.textSecondary }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = currentTheme.colors.background;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="Settings"
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
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-96 rounded-lg shadow-lg border z-50 p-4 max-h-[80vh] overflow-y-auto"
          style={{
            backgroundColor: currentTheme.colors.surface,
            borderColor: currentTheme.colors.border,
          }}
        >
          <h3 className="text-lg font-semibold mb-4" style={{ color: currentTheme.colors.text }}>
            Settings
          </h3>

          {/* Profile Management */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold" style={{ color: currentTheme.colors.text }}>
                Profiles
              </h4>
              <button
                onClick={() => {
                  setShowUpload(true);
                  setIsNewProfile(true);
                  setNewProfileName('');
                }}
                className="px-3 py-1 text-xs rounded-md transition-colors"
                style={{
                  backgroundColor: currentTheme.colors.primary,
                  color: '#ffffff',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                + New Profile
              </button>
            </div>

            <div className="space-y-2 mb-3">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between p-2 rounded border"
                  style={{
                    borderColor: currentTheme.colors.border,
                    backgroundColor:
                      profile.id === currentProfileId
                        ? currentTheme.colors.background
                        : 'transparent',
                  }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="radio"
                      checked={profile.id === currentProfileId}
                      onChange={() => onProfileChange(profile.id)}
                      className="w-4 h-4 flex-shrink-0"
                      style={{ accentColor: currentTheme.colors.primary }}
                    />
                    {editingProfileId === profile.id ? (
                      <input
                        type="text"
                        value={editingProfileName}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.length <= 16) {
                            setEditingProfileName(value);
                          }
                        }}
                        onBlur={() => {
                          if (editingProfileName.trim()) {
                            handleRenameProfile(profile.id, editingProfileName);
                          } else {
                            setEditingProfileId(null);
                            setEditingProfileName('');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                          if (e.key === 'Escape') {
                            setEditingProfileId(null);
                            setEditingProfileName('');
                          }
                        }}
                        maxLength={16}
                        className="text-sm px-2 py-1 rounded border flex-1 min-w-0"
                        style={{
                          backgroundColor: currentTheme.colors.background,
                          borderColor: currentTheme.colors.border,
                          color: currentTheme.colors.text,
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <span 
                          className="text-sm truncate cursor-pointer flex-1 min-w-0" 
                          style={{ color: currentTheme.colors.text }}
                          onDoubleClick={() => {
                            setEditingProfileId(profile.id);
                            setEditingProfileName(profile.name);
                          }}
                          title="Double-click to rename"
                        >
                          {profile.name}
                        </span>
                        {profile.id === currentProfileId && (
                          <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: currentTheme.colors.primary + '20', color: currentTheme.colors.primary }}>
                            Active
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingProfileId !== profile.id && (
                      <>
                        <button
                          onClick={() => {
                            setShowUpload(true);
                            setIsNewProfile(false);
                            setNewProfileName(profile.name);
                          }}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{
                            color: currentTheme.colors.primary,
                            backgroundColor: currentTheme.colors.background,
                          }}
                          title="Update this profile"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(profile.id)}
                          className="text-xs px-2 py-1 rounded transition-colors"
                          style={{
                            color: currentTheme.colors.error || '#ef4444',
                            backgroundColor: currentTheme.colors.background,
                          }}
                          title="Delete profile"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Course Reordering */}
            {reorderableCourses.length > 0 && updateCourseOrder && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold mb-3" style={{ color: currentTheme.colors.text }}>
                  Reorder Classes
                </h4>
                <p className="text-xs mb-3" style={{ color: currentTheme.colors.textSecondary }}>
                  Drag to reorder classes. "My Tasks" will always appear first and "Other" will always appear last.
                </p>
                <div className="space-y-2">
                  {reorderableCourses.map((course, index) => (
                    <div
                      key={course}
                      draggable
                      onDragStart={(e) => {
                        setDraggedCourse(course);
                        e.dataTransfer.effectAllowed = 'move';
                        if (e.dataTransfer) {
                          e.dataTransfer.setData('text/plain', course);
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverIndex(index);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragOverIndex(index);
                      }}
                      onDragLeave={(e) => {
                        // Only clear if we're leaving the element (not entering a child)
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX;
                        const y = e.clientY;
                        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                          setDragOverIndex(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverIndex(null);
                        if (draggedCourse && draggedCourse !== course && updateCourseOrder) {
                          const newOrder = [...reorderableCourses];
                          const draggedIndex = newOrder.indexOf(draggedCourse);
                          const targetIndex = newOrder.indexOf(course);
                          if (draggedIndex !== -1 && targetIndex !== -1) {
                            newOrder.splice(draggedIndex, 1);
                            newOrder.splice(targetIndex, 0, draggedCourse);
                            // Update local state immediately for visual feedback
                            setLocalCourseOrder(newOrder);
                            // Update the global order
                            updateCourseOrder(newOrder);
                          }
                        }
                        setDraggedCourse(null);
                      }}
                      onDragEnd={() => {
                        setDraggedCourse(null);
                        setDragOverIndex(null);
                      }}
                      className="flex items-center gap-2 p-2 rounded border cursor-move transition-all"
                      style={{
                        borderColor: dragOverIndex === index 
                          ? currentTheme.colors.primary 
                          : currentTheme.colors.border,
                        backgroundColor: dragOverIndex === index
                          ? currentTheme.colors.primary + '20'
                          : currentTheme.colors.background,
                        opacity: draggedCourse === course ? 0.5 : 1,
                        transform: dragOverIndex === index ? 'translateX(4px)' : 'translateX(0)',
                        borderWidth: dragOverIndex === index ? '2px' : '1px',
                      }}
                    >
                      <svg
                        className="w-4 h-4"
                        style={{ color: currentTheme.colors.textSecondary }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                      <span className="text-sm flex-1" style={{ color: currentTheme.colors.text }}>
                        {course}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Section */}
            {showUpload && (
              <div
                className="mt-4 p-3 rounded border"
                style={{
                  borderColor: currentTheme.colors.border,
                  backgroundColor: currentTheme.colors.background,
                }}
              >
                <h5 className="text-sm font-semibold mb-2" style={{ color: currentTheme.colors.text }}>
                  {isNewProfile ? 'Create New Profile' : 'Update Profile'}
                </h5>
                {isNewProfile && (
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 16) {
                        setNewProfileName(value);
                      }
                    }}
                    maxLength={16}
                    placeholder="Profile name (optional, max 16 chars)"
                    className="w-full px-2 py-1 mb-2 text-sm rounded border"
                    style={{
                      backgroundColor: currentTheme.colors.surface,
                      borderColor: currentTheme.colors.border,
                      color: currentTheme.colors.text,
                    }}
                  />
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ics"
                  onChange={handleFileUpload}
                  className="w-full mb-2 text-sm"
                  disabled={uploading}
                />
                <label className="flex items-center gap-2 text-xs mb-2" style={{ color: currentTheme.colors.textSecondary }}>
                  <input
                    type="checkbox"
                    checked={preserveState}
                    onChange={(e) => setPreserveState(e.target.checked)}
                    disabled={uploading}
                  />
                  Preserve completed assignments and notes
                </label>
                {uploadError && (
                  <div className="text-xs p-2 rounded mb-2" style={{ backgroundColor: (currentTheme.colors.error || '#ef4444') + '20', color: currentTheme.colors.error || '#ef4444' }}>
                    {uploadError}
                  </div>
                )}
                {uploadSuccess && (
                  <div className="text-xs p-2 rounded mb-2" style={{ backgroundColor: (currentTheme.colors.success || '#10b981') + '20', color: currentTheme.colors.success || '#10b981' }}>
                    {uploadSuccess}
                  </div>
                )}
                {uploading && (
                  <div className="text-xs" style={{ color: currentTheme.colors.textSecondary }}>
                    Uploading...
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowUpload(false);
                    setUploadError(null);
                    setUploadSuccess(null);
                  }}
                  className="text-xs mt-2"
                  style={{ color: currentTheme.colors.textSecondary }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Delete Confirmation */}
            {showDeleteConfirm && (
              <div
                className="mt-4 p-3 rounded border"
                style={{
                  borderColor: currentTheme.colors.error || '#ef4444',
                  backgroundColor: currentTheme.colors.background,
                }}
              >
                <p className="text-sm mb-3" style={{ color: currentTheme.colors.text }}>
                  Are you sure you want to delete this profile? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDeleteProfile(showDeleteConfirm!)}
                    className="px-3 py-1 text-xs rounded transition-colors"
                    style={{
                      backgroundColor: currentTheme.colors.error || '#ef4444',
                      color: '#ffffff',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="px-3 py-1 text-xs rounded transition-colors"
                    style={{
                      backgroundColor: currentTheme.colors.border,
                      color: currentTheme.colors.text,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {passwordAuthEnabled && (
            <div className="border-t pt-4" style={{ borderColor: currentTheme.colors.border }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                    window.location.href = '/';
                  } catch {
                    window.location.href = '/';
                  }
                }}
                className="w-full px-3 py-2 text-sm rounded transition-colors"
                style={{
                  backgroundColor: currentTheme.colors.border,
                  color: currentTheme.colors.text,
                }}
              >
                Lock (sign out)
              </button>
              <p className="text-xs mt-2" style={{ color: currentTheme.colors.textSecondary }}>
                Clears this browser’s session cookie; you’ll be asked for the password again.
              </p>
            </div>
          )}

          {/* Hard Reset */}
          <div className="border-t pt-4" style={{ borderColor: currentTheme.colors.border }}>
            <button
              onClick={handleHardReset}
              className="w-full px-3 py-2 text-sm rounded transition-colors"
              style={{
                backgroundColor: currentTheme.colors.error || '#ef4444',
                color: '#ffffff',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Hard Reset (Clear Everything)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

