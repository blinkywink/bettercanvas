import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type AnimationType = 'happy' | 'sad' | null;

interface AnimationContextType {
  triggerAnimation: (type: 'happy' | 'sad') => void;
  currentAnimation: AnimationType;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export function AnimationProvider({ children }: { children: ReactNode }) {
  const [currentAnimation, setCurrentAnimation] = useState<AnimationType>(null);

  const triggerAnimation = useCallback((type: 'happy' | 'sad') => {
    setCurrentAnimation(type);
    // Auto-clear after animation duration
    setTimeout(() => {
      setCurrentAnimation(null);
    }, 2000);
  }, []);

  return (
    <AnimationContext.Provider value={{ triggerAnimation, currentAnimation }}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimation() {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimation must be used within AnimationProvider');
  }
  return context;
}

