import React from 'react';

// Parse Canvas-style links like [] (https://...) or regular markdown links
export function parseDescription(description: string): (string | React.ReactElement)[] {
  if (!description) return [];

  // First, normalize the description - remove line breaks and spaces within links
  // This handles cases where ICS files break links across lines or have spaces
  let normalizedDesc = description;
  
  // Step 1: Handle spaces between ] and ( - Canvas often uses "[] (https://...)"
  // Replace: ] ( or ]\n( or ]\n\n( with ](
  normalizedDesc = normalizedDesc.replace(/\]\s+\(/g, '](');
  
  // Step 2: Clean up any URLs that might have newlines (but keep the URL structure)
  // This matches ](url) and cleans the URL part by removing line breaks
  normalizedDesc = normalizedDesc.replace(/\]\(([^)]+)\)/g, (_match, urlPart) => {
    // Remove newlines and carriage returns, but preserve URL structure
    // URLs shouldn't have spaces, so we can safely remove them
    let cleanUrl = urlPart.replace(/\n/g, '').replace(/\r/g, '');
    // Remove any spaces that might have been introduced by line breaks
    cleanUrl = cleanUrl.replace(/\s+/g, '').trim();
    return `](${cleanUrl})`;
  });
  
  // Pattern for Canvas links: [] (https://...) or [text] (https://...)
  // After normalization, this should match properly
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = linkPattern.exec(normalizedDesc)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      const textBefore = normalizedDesc.substring(lastIndex, match.index);
      if (textBefore) {
        parts.push(textBefore);
      }
    }

    const linkText = match[1] || 'View in Canvas'; // Use "View in Canvas" if link text is empty (Canvas style)
    const linkUrl = match[2];
    
    // Check if it's a Canvas image file link (preview or download)
    // These are just images we can't display due to CORS/authentication
    // Skip them entirely - don't render anything
    const isCanvasImageLink = linkUrl.includes('canvas.oregonstate.edu') && 
      linkUrl.includes('/files/') && 
      (linkUrl.includes('/preview') || linkUrl.includes('/download'));
    
    // Skip Canvas image links - we can't display them, so just ignore them
    if (isCanvasImageLink) {
      // Update lastIndex to skip past this link, but don't add anything to parts
      lastIndex = match.index + match[0].length;
      // Continue to next iteration
      continue;
    }
    
    // Regular link - render it normally (not a Canvas image)
    parts.push(
      <a
        key={`link-${keyIndex++}`}
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 mx-1"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(linkUrl, '_blank', 'noopener,noreferrer');
        }}
      >
        {linkText}
        <svg
          className="w-3 h-3 inline"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < normalizedDesc.length) {
    const remainingText = normalizedDesc.substring(lastIndex);
    if (remainingText) {
      parts.push(remainingText);
    }
  }

  // If no links were found, return the original text
  if (parts.length === 0) {
    return [description];
  }

  return parts;
}
