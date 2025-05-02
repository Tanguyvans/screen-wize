'use client';

import React, { useState, useCallback, ChangeEvent, DragEvent } from 'react';
import { UploadCloud, FileText, X, Loader2 } from 'lucide-react'; // Icons
import { cn } from "@/lib/utils"; // Utility for class names
import { Button } from '@/components/ui/button';

// REMOVE ParsedDecision interface - no longer parsed here
// export interface ParsedDecision { ... }

interface DecisionDropzoneProps {
  projectId: string | null; // Keep project context if needed for disabling
  // CHANGED PROP: Expects a function taking file content string and filename
  onFileUpload: (content: string, fileName: string) => void;
  className?: string;
  disabled?: boolean;
}

export function DecisionDropzone({
  projectId,
  onFileUpload, // Use the updated prop name
  className,
  disabled = false
}: DecisionDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // RENAME processing to isLoading? Parent now handles processing.
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // REMOVE parseContent function entirely
  // const parseContent = (content: string, name: string) => { ... };

  // UPDATED file read handler
  const handleFileRead = (file: File) => {
    if (!file) return;
    // Basic checks remain
    if (!file.type.startsWith('text/')) { // Allow more flexible text types
      setError(`Invalid file type: ${file.type}. Please upload a text file (.txt, .csv, etc.).`);
      setFileName(null); // Clear filename on error
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError("File is too large (max 10MB).");
        setFileName(null);
        return;
    }

    setError(null); // Clear previous errors
    setIsLoading(true); // Indicate reading started
    setFileName(file.name); // Show filename immediately

    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (typeof content === 'string') {
         console.log(`File "${file.name}" read successfully. Calling onFileUpload.`);
         // *** CALL THE PARENT CALLBACK WITH RAW CONTENT ***
         onFileUpload(content, file.name);
         // Parent now handles success/failure/processing state based on its logic
         // We can clear loading here, or let the parent manage it via props if needed
         setIsLoading(false);
      } else {
          console.error("FileReader result was not a string.");
          setError("Could not read file content properly.");
          setFileName(null);
          setIsLoading(false);
      }
    };

    reader.onerror = (e) => {
        console.error("FileReader error:", e);
        setError("Error reading file.");
        setFileName(null);
        setIsLoading(false);
    };

    reader.readAsText(file); // Read as text
  };

  // Drag/Drop handlers remain largely the same, just call handleFileRead
  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => { /* ... */ };
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => { /* ... */ };
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => { /* ... */ };
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    // Check disabled status based on props
    if (disabled || !projectId) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileRead(files[0]); // Call updated handler
    }
  };

  // File input change handler remains largely the same
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
       handleFileRead(files[0]); // Call updated handler
    }
     e.target.value = ''; // Reset input
  };

   const clearFile = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault(); // Prevent label click
        e.stopPropagation();
        setError(null);
        setFileName(null);
        setIsLoading(false); // Ensure loading is stopped
        // Optionally call parent to clear its state if needed,
        // but handleSaveAiDecisions might handle this already.
        // onFileUpload('', ''); // Maybe send empty content? Or parent resets.
   };

  // Update JSX to reflect state changes and removed parsing logic
  return (
    <div className={cn("mt-4", className)}>
      <label
        htmlFor="decision-dropzone-file"
        className={cn(
            "relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted transition-colors",
            isDragging && "border-primary bg-muted",
            disabled && "opacity-50 cursor-not-allowed", // Use the disabled prop
            error && "border-destructive"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          {/* Show filename if selected and not loading/error */}
          {fileName && !isLoading && !error ? (
             <>
                <FileText className="w-10 h-10 mb-3 text-green-600" />
                <p className="mb-2 text-sm font-semibold">{fileName}</p>
                <p className="text-xs text-muted-foreground">File selected. Ready to process.</p>
                 {/* Add clear button */}
                 <Button variant="ghost" size="sm" onClick={clearFile} className="absolute top-2 right-2 p-1 h-auto z-10">
                    <X className="w-4 h-4" />
                 </Button>
             </>
           /* Show loading state */
          ) : isLoading ? (
             <>
                <Loader2 className="w-10 h-10 mb-3 animate-spin" />
                <p className="text-sm text-muted-foreground">Reading file...</p>
             </>
          /* Default prompt */
          ) : (
             <>
                <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag & drop
                </p>
                <p className="text-xs text-muted-foreground\">AI decision file (.txt)</p>
                 {/* Show disabled reason */}
                 {disabled && !projectId && <p className="text-xs text-destructive mt-1">Select a project first.</p>}
                 {disabled && projectId && <p className="text-xs text-destructive mt-1">Dropzone disabled.</p>}
             </>
          )}
        </div>
        <input
          id="decision-dropzone-file"
          type="file"
          className="hidden"
          accept="text/*,.txt" // More flexible text accept
          onChange={handleFileChange}
          disabled={disabled} // Use the disabled prop
        />
      </label>
      {/* Display error below the dropzone */}
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
} 