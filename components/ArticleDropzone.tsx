'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils'; // For combining classNames

interface ArticleDropzoneProps {
  onFileRead: (content: string) => void; // Callback function with file content
  projectId: string; // Pass the selected project ID
  className?: string; // Allow passing additional styles
}

export function ArticleDropzone({ onFileRead, projectId, className }: ArticleDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setMessage('Drop the file here');
    setError(null);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if leaving the actual dropzone, not its children
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
    }
    setIsDragging(false);
    setMessage(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
    e.stopPropagation();
    setIsDragging(true); // Keep highlighting while dragging over
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setMessage(null);
    setError(null);

    const files = e.dataTransfer?.files;

    if (files && files.length > 0) {
      const file = files[0];

      // Basic validation (check for .txt extension)
      if (!file.name.toLowerCase().endsWith('.txt')) {
        setError('Invalid file type. Please drop a .txt file.');
        setMessage(null);
        return;
      }

      // Limit file size (e.g., 5MB)
      if (file.size > 5 * 1024 * 1024) {
         setError('File is too large. Maximum size is 5MB.');
         setMessage(null);
         return;
      }

      const reader = new FileReader();

      reader.onload = (loadEvent) => {
        const content = loadEvent.target?.result as string;
        if (content) {
          setMessage(`File "${file.name}" processed.`);
          onFileRead(content); // Call the callback with the file content
        } else {
          setError('Could not read file content.');
        }
      };

      reader.onerror = () => {
        setError('Error reading file.');
      };

      reader.readAsText(file); // Read the file as text
    } else {
         setError('No file detected in drop event.');
    }
  }, [onFileRead]); // Include onFileRead in dependencies

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "mt-4 p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-200 ease-in-out",
        isDragging ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400',
        className // Allow overriding styles
      )}
    >
       {/* Add an input for clicking */}
       <input
          type="file"
          accept=".txt"
          className="hidden" // Hide the default input
          id={`fileInput-${projectId}`} // Unique ID needed if multiple dropzones exist
          onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                  // Reuse the FileReader logic (could be extracted to a helper)
                  const reader = new FileReader();
                  reader.onload = (loadEvent) => { /* ... same onload logic as handleDrop ... */
                       const content = loadEvent.target?.result as string;
                        if (content) {
                          setMessage(`File "${file.name}" processed.`);
                          onFileRead(content);
                        } else { setError('Could not read file content.'); }
                  };
                  reader.onerror = () => setError('Error reading file.');
                  reader.readAsText(file);
              }
          }}
       />
       <label htmlFor={`fileInput-${projectId}`} className="cursor-pointer">
           {/* Display different messages based on state */}
          {isDragging ? (
               <p className="text-primary font-semibold">{message || 'Drop the file here'}</p>
          ) : error ? (
               <p className="text-destructive">{error}</p>
          ) : message ? (
               <p className="text-green-600">{message}</p>
          ) : (
               <p className="text-muted-foreground">Drag & drop a .txt file here, or click to select</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">Max 5MB</p>
      </label>
    </div>
  );
} 