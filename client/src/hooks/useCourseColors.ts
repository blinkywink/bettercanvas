import { useState, useEffect, useCallback, useMemo } from 'react';

const DEFAULT_COLORS: Record<string, string> = {
  // Default colors for courses (lighter/pastel versions)
  'ENGR 110': '#60a5fa', // light blue - Transitions
  'ENGR 102': '#34d399', // light green - Design Engineering
  'MTH 251Z': '#f87171', // light red - Calculus
  'WR 121Z': '#a78bfa', // light purple - Writing
  'Other': '#94a3b8', // light gray - Other
};

export interface CourseColor {
  course: string;
  color: string;
  visible: boolean;
}

export function useCourseColors(courses: string[], profileId: string = 'default') {
  const [courseColors, setCourseColors] = useState<Record<string, CourseColor>>({});

  // Load saved colors, visibility, and order from server
  useEffect(() => {
    if (courses.length === 0) return;
    
    const loadData = async () => {
      try {
        let savedColors: Record<string, string> = {};
        let savedVisibility: Record<string, boolean> = {};
        let savedOrder: string[] = [];
        
        try {
          const [colorsResponse, visibilityResponse, orderResponse] = await Promise.all([
            fetch(`/api/user-state/course-colors?profile=${profileId}`),
            fetch(`/api/user-state/course-visibility?profile=${profileId}`),
            fetch(`/api/user-state/course-order?profile=${profileId}`),
          ]);
          
          if (colorsResponse.ok) {
            savedColors = await colorsResponse.json();
          }
          if (visibilityResponse.ok) {
            savedVisibility = await visibilityResponse.json();
          }
          if (orderResponse.ok) {
            savedOrder = await orderResponse.json();
          }
        } catch (error) {
          console.error('Error loading course colors:', error);
        }

        // Migrate old "My Events" to "My Tasks" in saved data
        if (savedColors['My Events']) {
          savedColors['My Tasks'] = savedColors['My Events'];
          delete savedColors['My Events'];
        }
        if (savedVisibility['My Events'] !== undefined) {
          savedVisibility['My Tasks'] = savedVisibility['My Events'];
          delete savedVisibility['My Events'];
        }
        const migratedOrder = savedOrder.map((c: string) => c === 'My Events' ? 'My Tasks' : c);

        // Filter out "My Events" from courses (old data)
        const filteredCourses = courses.filter(c => c !== 'My Events');

        // Initialize course colors
        const colors: Record<string, CourseColor> = {};
        
        // Sort courses by saved order, then alphabetically for new courses
        const sortedCourses = [...filteredCourses].sort((a, b) => {
          const aIndex = migratedOrder.indexOf(a);
          const bIndex = migratedOrder.indexOf(b);
          if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
          if (aIndex === -1) return 1;
          if (bIndex !== -1) return -1;
          return aIndex - bIndex;
        });
        
        sortedCourses.forEach((course) => {
          const savedColor = savedColors[course] || DEFAULT_COLORS[course];
          // Generate a default color if none exists
          const defaultColor = savedColor || generateColorForCourse(course);
          
          // Default to visible if not set (first time)
          const isVisible = savedVisibility[course] !== undefined 
            ? savedVisibility[course] 
            : true;
          
          colors[course] = {
            course,
            color: defaultColor,
            visible: isVisible,
          };
        });

        setCourseColors(colors);
      } catch (error) {
        console.error('Error loading course colors:', error);
      }
    };
    
    loadData();
  }, [courses, profileId]);

  // Update course color
  const updateCourseColor = useCallback((course: string, color: string) => {
    setCourseColors((prev) => {
      const updated = {
        ...prev,
        [course]: {
          ...prev[course],
          course,
          color,
        },
      };
      
      // Save to server
      const colorsToSave: Record<string, string> = {};
      Object.values(updated).forEach((cc) => {
        colorsToSave[cc.course] = cc.color;
      });
      
          const tabId = sessionStorage.getItem('bct-tab-id') || '';
          fetch(`/api/user-state/course-colors?profile=${profileId}`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'X-Tab-ID': tabId,
            },
            body: JSON.stringify(colorsToSave),
          })
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save course colors: ${response.status} ${errorText}`);
        }
        console.log('Successfully saved course colors');
      })
      .catch(error => {
        console.error('Error saving course colors:', error);
      });
      
      return updated;
    });
  }, [profileId]);

  // Toggle course visibility
  const toggleCourseVisibility = useCallback((course: string) => {
    setCourseColors((prev) => {
      const updated = {
        ...prev,
        [course]: {
          ...prev[course],
          course,
          visible: !prev[course]?.visible,
        },
      };
      
      // Save to server
      const visibilityToSave: Record<string, boolean> = {};
      Object.values(updated).forEach((cc) => {
        visibilityToSave[cc.course] = cc.visible;
      });
      
          const tabId = sessionStorage.getItem('bct-tab-id') || '';
          fetch(`/api/user-state/course-visibility?profile=${profileId}`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'X-Tab-ID': tabId,
            },
            body: JSON.stringify(visibilityToSave),
          })
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save course visibility: ${response.status} ${errorText}`);
        }
        console.log('Successfully saved course visibility');
      })
      .catch(error => {
        console.error('Error saving course visibility:', error);
      });
      
      return updated;
    });
  }, [profileId]);

  // Get color for a course
  const getCourseColor = useCallback((course: string): string => {
    return courseColors[course]?.color || generateColorForCourse(course);
  }, [courseColors]);

  // Get visible courses
  const visibleCourses = useMemo(() => {
    return Object.values(courseColors)
      .filter((cc) => cc.visible)
      .map((cc) => cc.course);
  }, [courseColors]);

  // Update course order
  const updateCourseOrder = useCallback((newOrder: string[]) => {
    // Save to server
        const tabId = sessionStorage.getItem('bct-tab-id') || '';
        fetch(`/api/user-state/course-order?profile=${profileId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'X-Tab-ID': tabId,
          },
          body: JSON.stringify(newOrder),
        })
    .then(async response => {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save course order: ${response.status} ${errorText}`);
      }
      console.log('Successfully saved course order:', newOrder);
    })
    .catch(error => {
      console.error('Error saving course order:', error);
    });
    
    // Force a re-render by updating state with a new object reference
    setCourseColors((prev) => {
      const updated = { ...prev };
      // Re-sort the courses based on new order
      const sorted = Object.values(updated).sort((a, b) => {
        // "My Tasks" always goes first
        if (a.course === 'My Tasks') return -1;
        if (b.course === 'My Tasks') return 1;
        // "Other" always goes last
        if (a.course === 'Other') return 1;
        if (b.course === 'Other') return -1;
        
        const aIndex = newOrder.indexOf(a.course);
        const bIndex = newOrder.indexOf(b.course);
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.course.localeCompare(b.course);
      });
      
      // Rebuild the colors object in the new order
      const newColors: Record<string, CourseColor> = {};
      sorted.forEach(cc => {
        newColors[cc.course] = cc;
      });
      return newColors;
    });
  }, [profileId]);

  // Real-time sync disabled - user will manually refresh if needed

  // Sort courses by saved order, but "My Tasks" always goes first and "Other" always goes last
  const sortedCourseColors = useMemo(() => {
    const courses = Object.values(courseColors);
    
    return courses.sort((a, b) => {
      // "My Tasks" always goes first
      if (a.course === 'My Tasks') return -1;
      if (b.course === 'My Tasks') return 1;
      // "Other" always goes last
      if (a.course === 'Other') return 1;
      if (b.course === 'Other') return -1;
      
      // Otherwise, sort alphabetically (order is maintained by state)
      return a.course.localeCompare(b.course);
    });
  }, [courseColors]);

  return {
    courseColors: sortedCourseColors,
    updateCourseColor,
    toggleCourseVisibility,
    getCourseColor,
    visibleCourses,
    updateCourseOrder,
  };
}

// Generate a color based on course name (deterministic) - lighter/pastel colors
function generateColorForCourse(course: string): string {
  const colors = [
    '#f87171', // light red
    '#fb923c', // light orange
    '#fbbf24', // light amber
    '#a3e635', // light lime
    '#34d399', // light green
    '#2dd4bf', // light teal
    '#38bdf8', // light cyan
    '#60a5fa', // light blue
    '#818cf8', // light indigo
    '#a78bfa', // light purple
    '#c084fc', // light fuchsia
    '#f472b6', // light pink
  ];
  
  // Hash the course name to get a consistent color
  let hash = 0;
  for (let i = 0; i < course.length; i++) {
    hash = course.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}
