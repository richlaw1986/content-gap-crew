'use client';

import { useState } from 'react';
import { Button } from './Button';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  details?: string;
  agent?: string;
  tool?: string;
  timestamp?: string;
  onRetry?: () => void;
  variant?: 'inline' | 'banner' | 'card';
}

export function ErrorDisplay({
  title = 'Error',
  message,
  details,
  agent,
  tool,
  timestamp,
  onRetry,
  variant = 'card',
}: ErrorDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const errorText = [
      `Error: ${title}`,
      `Message: ${message}`,
      agent && `Agent: ${agent}`,
      tool && `Tool: ${tool}`,
      timestamp && `Time: ${timestamp}`,
      details && `\nDetails:\n${details}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const baseStyles = {
    inline: 'px-3 py-2 text-sm',
    banner: 'px-4 py-3',
    card: 'p-4 rounded-lg',
  };

  return (
    <div
      className={`bg-red-50 border border-red-200 text-red-800 ${baseStyles[variant]}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-red-500 text-lg flex-shrink-0">❌</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{title}</span>
              {agent && (
                <span className="text-xs bg-red-100 px-2 py-0.5 rounded">
                  {agent}
                </span>
              )}
              {tool && (
                <span className="text-xs bg-red-100 px-2 py-0.5 rounded font-mono">
                  {tool}
                </span>
              )}
            </div>
            <p className="text-sm mt-1">{message}</p>
            
            {details && (
              <div className="mt-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                >
                  {isExpanded ? 'Hide details' : 'Show details'}
                </button>
                {isExpanded && (
                  <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                    {details}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleCopy}
            className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-100 transition-colors"
            title="Copy error details"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="border-red-300 text-red-700 hover:bg-red-100"
            >
              Retry
            </Button>
          )}
        </div>
      </div>

      {timestamp && (
        <div className="mt-2 text-xs text-red-500">
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
