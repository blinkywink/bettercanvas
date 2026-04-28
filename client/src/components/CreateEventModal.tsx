import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  onCreate: (event: {
    title: string;
    description: string;
    start: Date;
    end?: Date;
    location?: string;
  }) => void;
}

// Helper function to get today's date in local timezone (YYYY-MM-DD format)
const getTodayLocal = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function CreateEventModal({ isOpen, onClose, defaultDate, onCreate }: CreateEventModalProps) {
  const { currentTheme } = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getTodayLocal());

  // Reset form and set default date when modal opens
  useEffect(() => {
    if (isOpen) {
      setDate(defaultDate || getTodayLocal());
      setTitle('');
      setDescription('');
    }
  }, [isOpen, defaultDate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    const startDateTime = new Date(`${date}T00:00:00`);

    onCreate({
      title: title.trim(),
      description: description.trim(),
      start: startDateTime,
    });

    // Reset form
    setTitle('');
    setDescription('');
    setDate(getTodayLocal());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg p-6 max-w-md w-full mx-4"
        style={{
          backgroundColor: currentTheme.colors.surface,
          border: `1px solid ${currentTheme.colors.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: currentTheme.colors.text }}>
            Create Event
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: currentTheme.colors.textSecondary }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = currentTheme.colors.background;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: currentTheme.colors.text }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 rounded border"
              style={{
                backgroundColor: currentTheme.colors.background,
                borderColor: currentTheme.colors.border,
                color: currentTheme.colors.text,
              }}
              placeholder="Event title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: currentTheme.colors.text }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded border"
              style={{
                backgroundColor: currentTheme.colors.background,
                borderColor: currentTheme.colors.border,
                color: currentTheme.colors.text,
              }}
              placeholder="Event description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: currentTheme.colors.text }}>
              Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 rounded border"
              style={{
                backgroundColor: currentTheme.colors.background,
                borderColor: currentTheme.colors.border,
                color: currentTheme.colors.text,
              }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: currentTheme.colors.background,
                color: currentTheme.colors.text,
                border: `1px solid ${currentTheme.colors.border}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = currentTheme.colors.border;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = currentTheme.colors.background;
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity"
              style={{ backgroundColor: currentTheme.colors.primary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

