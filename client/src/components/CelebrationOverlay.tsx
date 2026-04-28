import { useEffect, useState } from 'react';
import { useAnimation } from '../contexts/AnimationContext';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
}

export function CelebrationOverlay() {
  const { currentAnimation } = useAnimation();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [containerHeight, setContainerHeight] = useState(window.innerHeight);

  // Update container height to match document height
  useEffect(() => {
    const updateHeight = () => {
      const height = Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight,
        document.body.scrollHeight,
        document.body.offsetHeight,
        window.innerHeight
      );
      setContainerHeight(height);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.addEventListener('scroll', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('scroll', updateHeight);
    };
  }, []);

  useEffect(() => {
    if (currentAnimation === 'happy') {
      // Create confetti particles
      const newParticles: Particle[] = [];
      const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];
      
      for (let i = 0; i < 50; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * window.innerWidth,
          y: -10,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * 3 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: Math.random() * 8 + 4,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
        });
      }
      
      setParticles(newParticles);

      // Animate particles
      const interval = setInterval(() => {
        setParticles((prev) =>
          prev
            .map((p) => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
              rotation: p.rotation + p.rotationSpeed,
              vy: p.vy + 0.1, // gravity
            }))
            .filter((p) => {
              const pageHeight = Math.max(
                document.documentElement.scrollHeight,
                document.documentElement.offsetHeight,
                document.body.scrollHeight,
                document.body.offsetHeight,
                window.innerHeight
              );
              return p.y < pageHeight + 100;
            })
        );
      }, 16);

      return () => clearInterval(interval);
    } else if (currentAnimation === 'sad') {
      // Create subtle fade particles for sad
      const newParticles: Particle[] = [];
      
      for (let i = 0; i < 20; i++) {
        newParticles.push({
          id: i,
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          color: '#6b7280',
          size: Math.random() * 4 + 2,
          rotation: 0,
          rotationSpeed: 0,
        });
      }
      
      setParticles(newParticles);

      // Fade out particles
      const interval = setInterval(() => {
        setParticles((prev) =>
          prev
            .map((p) => ({
              ...p,
              x: p.x + p.vx,
              y: p.y + p.vy,
            }))
            .filter((_p, idx) => idx < prev.length * 0.95) // Gradually remove particles
        );
      }, 50);

      return () => clearInterval(interval);
    } else {
      setParticles([]);
    }
  }, [currentAnimation]);

  if (!currentAnimation) return null;

  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{
        top: 0,
        left: 0,
        width: '100%',
        height: `${containerHeight}px`,
        overflow: 'visible',
      }}
    >
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute"
          style={{
            left: `${particle.x}px`,
            top: `${particle.y}px`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            borderRadius: currentAnimation === 'happy' ? '50%' : '0',
            transform: `rotate(${particle.rotation}deg)`,
            opacity: currentAnimation === 'sad' ? 0.3 : 1,
            pointerEvents: 'none',
          }}
        />
      ))}
    </div>
  );
}

