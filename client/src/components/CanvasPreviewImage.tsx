import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface CanvasPreviewImageProps {
  src: string;
  alt?: string;
  linkText?: string;
}

export function CanvasPreviewImage({ src, alt }: CanvasPreviewImageProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const { currentTheme } = useTheme();

  // Try to load the Canvas image directly
  // If it works, display it inline; if it fails (CORS/authentication), don't show anything
  if (imageError) {
    // Image failed to load - Canvas images likely require authentication/CORS
    // Don't render anything since we can't display it
    return null;
  }

  // Render image - it will either load successfully or trigger onError
  return (
    <div className="my-2 inline-block">
      {!imageLoaded && (
        <div className="text-xs italic mb-1" style={{ color: currentTheme.colors.textSecondary }}>
          Loading image...
        </div>
      )}
      <img
        src={src}
        alt={alt || 'Canvas preview'}
        className="max-w-full h-auto rounded"
        style={{ 
          maxWidth: '600px',
          display: imageLoaded ? 'block' : 'none',
          border: `1px solid ${currentTheme.colors.border}`,
        }}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
        title={alt || 'Canvas preview image'}
        loading="lazy"
      />
    </div>
  );
}
