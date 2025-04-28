'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils'; // For combining classNames

interface ArticleDropzoneProps {
  onFileRead: (content: string, projectId: string | null) => void; // <-- MODIFIED: Expect projectId
  projectId: string | null; // <-- MODIFIED: Allow null projectId (match dashboard state)
  className?: string; // Allow passing additional styles
  // Add disabled prop if you need to disable it like DecisionDropzone
  disabled?: boolean;
}

export function ArticleDropzone({ onFileRead, projectId, className, disabled = false }: ArticleDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return; // <-- Added check
    setIsDragging(true);
    setMessage('Drop the file here');
    setError(null);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
     if (disabled) return; // <-- Added check
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
     if (disabled) return; // <-- Added check
    setIsDragging(true); // Keep highlighting while dragging over
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
     if (disabled) return; // <-- Added check
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

      const reader = new FileReader();

      reader.onload = (loadEvent) => {
        const content = loadEvent.target?.result as string;
        if (content) {
          setMessage(`File "${file.name}" processed.`);
          onFileRead(content, projectId); // <-- MODIFIED: Pass projectId
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
  }, [onFileRead, projectId, disabled]); // Include projectId and disabled in dependencies

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
     if (disabled) return; // <-- Added check
    if (file) {
       // ... (file validation: type, size) ...
        if (!file.name.toLowerCase().endsWith('.txt')) {
            setError('Invalid file type. Please upload a .txt file.');
            setMessage(null);
            e.target.value = ''; // Clear input
            return;
        }

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const content = loadEvent.target?.result as string;
            if (content) {
                setMessage(`File "${file.name}" processed.`);
                onFileRead(content, projectId); // <-- MODIFIED: Pass projectId
            } else { setError('Could not read file content.'); }
        };
        reader.onerror = () => setError('Error reading file.');
        reader.readAsText(file);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };


  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "mt-4 p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-200 ease-in-out",
        isDragging && !disabled ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400', // <-- Added !disabled
        disabled && "opacity-50 cursor-not-allowed", // <-- Added disabled style
        className // Allow overriding styles
      )}
    >
       {/* Add an input for clicking */}
       <input
          type="file"
          accept=".txt"
          className="hidden" // Hide the default input
          id={`fileInput-${projectId || 'default'}`} // Ensure unique ID even if projectId is null initially
          onChange={handleFileChange}
          disabled={disabled} // <-- Added disabled attribute
       />
       <label htmlFor={`fileInput-${projectId || 'default'}`} className={cn("cursor-pointer", disabled && "cursor-not-allowed")}> {/* <-- Conditional cursor */}
           {/* Display different messages based on state */}
          {disabled ? (
             <p className="text-muted-foreground">Processing another upload...</p> // Example disabled message
          ) : isDragging ? (
               <p className="text-primary font-semibold">{message || 'Drop the file here'}</p>
          ) : error ? (
               <p className="text-destructive">{error}</p>
          ) : message ? (
               <p className="text-green-600">{message}</p>
          ) : (
               <p className="text-muted-foreground">Drag & drop a .txt file here, or click to select</p>
          )}
          {/* --- REMOVE OR COMMENT OUT THIS LINE --- */}
          {/* <p className="text-xs text-muted-foreground mt-1">Max 5MB</p> */}
      </label>
    </div>
  );
} 