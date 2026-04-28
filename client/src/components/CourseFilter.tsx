import { useState } from 'react';
import { CourseColor } from '../hooks/useCourseColors';
import { useTheme } from '../contexts/ThemeContext';

interface CourseFilterProps {
  courses: CourseColor[];
  onColorChange: (course: string, color: string) => void;
  onVisibilityToggle: (course: string) => void;
}

export function CourseFilter({ courses, onColorChange, onVisibilityToggle }: CourseFilterProps) {
  const [colorPickerOpen, setColorPickerOpen] = useState<string | null>(null);
  const { currentTheme } = useTheme();

  return (
    <div
      className="mb-4 p-4 rounded-lg shadow-sm"
      style={{
        backgroundColor: currentTheme.colors.surface,
        border: `1px solid ${currentTheme.colors.border}`,
      }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: currentTheme.colors.text }}>
        Filter Classes
      </h3>
      <div className="flex flex-wrap gap-3">
        {courses.map((courseColor) => (
          <div
            key={courseColor.course}
            className="flex items-center gap-2 px-3 py-2 rounded-md border"
            style={{
              borderColor: currentTheme.colors.border,
              backgroundColor: currentTheme.colors.background,
            }}
          >
            <input
              type="checkbox"
              checked={courseColor.visible}
              onChange={() => onVisibilityToggle(courseColor.course)}
              className="w-4 h-4 rounded"
              style={{
                borderColor: currentTheme.colors.border,
                accentColor: currentTheme.colors.primary,
              }}
            />
            <div className="relative">
              <button
                onClick={() =>
                  setColorPickerOpen(
                    colorPickerOpen === courseColor.course ? null : courseColor.course
                  )
                }
                className="w-6 h-6 rounded border-2"
                style={{
                  backgroundColor: courseColor.color,
                  borderColor: currentTheme.colors.border,
                }}
                title="Change color"
              />
              {colorPickerOpen === courseColor.course && (
                <div
                  className="absolute top-8 left-0 z-50 p-2 rounded-md shadow-lg border"
                  style={{
                    backgroundColor: currentTheme.colors.surface,
                    borderColor: currentTheme.colors.border,
                  }}
                >
                  <input
                    type="color"
                    value={courseColor.color}
                    onChange={(e) => {
                      onColorChange(courseColor.course, e.target.value);
                      setColorPickerOpen(null);
                    }}
                    className="w-12 h-8 cursor-pointer"
                  />
                </div>
              )}
            </div>
            <span
              className="text-sm font-medium"
              style={{
                color: courseColor.visible
                  ? courseColor.color
                  : 'gray',
                opacity: courseColor.visible ? 1 : 0.5,
              }}
            >
              {courseColor.course}
            </span>
          </div>
        ))}
      </div>
      {colorPickerOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setColorPickerOpen(null)}
        />
      )}
    </div>
  );
}
