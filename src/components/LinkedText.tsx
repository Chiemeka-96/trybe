import { useMemo } from 'react';
import type { TextSegment } from '../lib/urlUtils';
import { segmentText } from '../lib/urlUtils';

interface LinkedTextProps {
  text: string;
  className?: string;
}

/**
 * Renders text with URLs automatically converted to clickable links.
 * URLs are styled and open in a new tab.
 */
export default function LinkedText({ text, className = '' }: LinkedTextProps) {
  const segments: TextSegment[] = useMemo(() => segmentText(text), [text]);

  return (
    <p className={`whitespace-pre-wrap ${className}`}>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.content}
            target="_blank"
            rel="noopener noreferrer"
            className="text-trybe-600 hover:text-trybe-500 underline underline-offset-2 decoration-trybe-300/60 hover:decoration-trybe-500/80 transition-colors duration-200 break-all"
          >
            {seg.content}
          </a>
        ) : (
          <span key={i}>{seg.content}</span>
        )
      )}
    </p>
  );
}
