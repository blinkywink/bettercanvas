import { useState } from 'react';
import { WorkoutSet } from '../types';
import { useTheme } from '../contexts/ThemeContext';

interface WorkoutSetsProps {
  sets: WorkoutSet[];
  defaultSetId: string | null;
  onSetsChange: (sets: WorkoutSet[]) => void;
  onDefaultSetChange: (setId: string | null) => void;
}

export function WorkoutSets({ sets, defaultSetId, onSetsChange, onDefaultSetChange }: WorkoutSetsProps) {
  const { currentTheme } = useTheme();
  const [editingSet, setEditingSet] = useState<WorkoutSet | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [newExercises, setNewExercises] = useState<string[]>(['', '', '']);

  const handleCreateSet = () => {
    if (newSetName.trim() && newExercises.filter(e => e.trim()).length >= 3) {
      const exercises = newExercises.filter(e => e.trim()).slice(0, 5);
      if (exercises.length < 3) {
        alert('A set must have at least 3 exercises');
        return;
      }
      const newSet: WorkoutSet = {
        id: `set-${Date.now()}`,
        name: newSetName.trim(),
        exercises,
      };
      onSetsChange([...sets, newSet]);
      setNewSetName('');
      setNewExercises(['', '', '']);
    } else {
      alert('Please provide a set name and at least 3 exercises');
    }
  };

  const handleEditSet = (set: WorkoutSet) => {
    setEditingSet(set);
    setNewSetName(set.name);
    setNewExercises([...set.exercises, '', '', ''].slice(0, 5));
  };

  const handleSaveEdit = () => {
    if (!editingSet) return;
    if (newSetName.trim() && newExercises.filter(e => e.trim()).length >= 3) {
      const exercises = newExercises.filter(e => e.trim()).slice(0, 5);
      if (exercises.length < 3) {
        alert('A set must have at least 3 exercises');
        return;
      }
      const updatedSets = sets.map(s => 
        s.id === editingSet.id 
          ? { ...s, name: newSetName.trim(), exercises }
          : s
      );
      onSetsChange(updatedSets);
      setEditingSet(null);
      setNewSetName('');
      setNewExercises(['', '', '']);
    } else {
      alert('Please provide a set name and at least 3 exercises');
    }
  };

  const handleDeleteSet = (setId: string) => {
    if (defaultSetId === setId) {
      alert('Cannot delete the default set. Please set a different default first.');
      return;
    }
    if (confirm('Are you sure you want to delete this set?')) {
      onSetsChange(sets.filter(s => s.id !== setId));
    }
  };

  const handleSetDefault = (setId: string) => {
    onDefaultSetChange(setId);
  };

  const addExerciseField = () => {
    if (newExercises.length < 5) {
      setNewExercises([...newExercises, '']);
    }
  };

  const removeExerciseField = (index: number) => {
    if (newExercises.length > 3) {
      setNewExercises(newExercises.filter((_, i) => i !== index));
    } else {
      alert('A set must have at least 3 exercises');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4" style={{ color: currentTheme.colors.text }}>
          Manage Workout Sets
        </h2>
        <p className="text-sm mb-6" style={{ color: currentTheme.colors.textSecondary }}>
          Create sets of 3-5 exercises. Set one as default to use in your daily workout.
        </p>
      </div>

      {/* Create/Edit Form */}
      <div 
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: currentTheme.colors.surface,
          borderColor: currentTheme.colors.border,
        }}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: currentTheme.colors.text }}>
          {editingSet ? 'Edit Set' : 'Create New Set'}
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: currentTheme.colors.text }}>
              Set Name
            </label>
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="e.g., Morning Routine"
              className="w-full px-4 py-2 border rounded-md"
              style={{
                backgroundColor: currentTheme.colors.background,
                borderColor: currentTheme.colors.border,
                color: currentTheme.colors.text,
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: currentTheme.colors.text }}>
              Exercises ({newExercises.filter(e => e.trim()).length}/3-5)
            </label>
            <div className="space-y-2">
              {newExercises.map((exercise, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={exercise}
                    onChange={(e) => {
                      const updated = [...newExercises];
                      updated[index] = e.target.value;
                      setNewExercises(updated);
                    }}
                    placeholder={`Exercise ${index + 1} (e.g., 10 jumping jacks)`}
                    className="flex-1 px-4 py-2 border rounded-md"
                    style={{
                      backgroundColor: currentTheme.colors.background,
                      borderColor: currentTheme.colors.border,
                      color: currentTheme.colors.text,
                    }}
                  />
                  {newExercises.length > 3 && (
                    <button
                      onClick={() => removeExerciseField(index)}
                      className="px-3 py-2 rounded-md text-white"
                      style={{ backgroundColor: currentTheme.colors.error }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {newExercises.length < 5 && (
              <button
                onClick={addExerciseField}
                className="mt-2 px-4 py-2 rounded-md text-sm"
                style={{
                  backgroundColor: currentTheme.colors.primary,
                  color: 'white',
                }}
              >
                Add Exercise
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={editingSet ? handleSaveEdit : handleCreateSet}
              className="px-4 py-2 rounded-md text-white"
              style={{ backgroundColor: currentTheme.colors.primary }}
            >
              {editingSet ? 'Save Changes' : 'Create Set'}
            </button>
            {editingSet && (
              <button
                onClick={() => {
                  setEditingSet(null);
                  setNewSetName('');
                  setNewExercises(['', '', '']);
                }}
                className="px-4 py-2 rounded-md"
                style={{
                  backgroundColor: currentTheme.colors.surface,
                  color: currentTheme.colors.text,
                  border: `1px solid ${currentTheme.colors.border}`,
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Existing Sets */}
      <div>
        <h3 className="text-lg font-semibold mb-4" style={{ color: currentTheme.colors.text }}>
          Your Sets
        </h3>
        {sets.length === 0 ? (
          <p className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
            No sets created yet. Create your first set above.
          </p>
        ) : (
          <div className="space-y-3">
            {sets.map((set) => (
              <div
                key={set.id}
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: currentTheme.colors.surface,
                  borderColor: defaultSetId === set.id ? currentTheme.colors.primary : currentTheme.colors.border,
                  borderWidth: defaultSetId === set.id ? '2px' : '1px',
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold" style={{ color: currentTheme.colors.text }}>
                      {set.name}
                      {defaultSetId === set.id && (
                        <span className="ml-2 text-xs px-2 py-1 rounded" style={{ backgroundColor: currentTheme.colors.primary, color: 'white' }}>
                          Default
                        </span>
                      )}
                    </h4>
                    <ul className="mt-2 space-y-1">
                      {set.exercises.map((exercise, idx) => (
                        <li key={idx} className="text-sm" style={{ color: currentTheme.colors.textSecondary }}>
                          • {exercise}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {defaultSetId !== set.id && (
                      <button
                        onClick={() => handleSetDefault(set.id)}
                        className="px-3 py-1 text-xs rounded-md"
                        style={{
                          backgroundColor: currentTheme.colors.primary,
                          color: 'white',
                        }}
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleEditSet(set)}
                      className="px-3 py-1 text-xs rounded-md"
                      style={{
                        backgroundColor: currentTheme.colors.background,
                        color: currentTheme.colors.text,
                        border: `1px solid ${currentTheme.colors.border}`,
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSet(set.id)}
                      className="px-3 py-1 text-xs rounded-md"
                      style={{
                        backgroundColor: currentTheme.colors.error,
                        color: 'white',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

