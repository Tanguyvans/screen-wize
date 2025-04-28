'use client';

import React, { useState, useCallback, ChangeEvent, DragEvent } from 'react';
import { UploadCloud, FileText, X, Loader2 } from 'lucide-react'; // Icons
import { cn } from "@/lib/utils"; // Utility for class names
import { Button } from '@/components/ui/button';

// Type for the parsed decision data we expect
export interface ParsedDecision {
  article_id: string;
  decision: 'include' | 'exclude' | 'maybe'; // Match DB enum
}

interface DecisionDropzoneProps {
  projectId: string | null; // Project context
  onDecisionsParsed: (decisions: ParsedDecision[], fileName: string) => void; // Callback with parsed data
  className?: string;
  disabled?: boolean;
}

export function DecisionDropzone({
  projectId,
  onDecisionsParsed,
  className,
  disabled = false
}: DecisionDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const parseContent = (content: string, name: string) => {
    console.log("Parsing decision file content...");
    setError(null);
    setProcessing(true);
    setFileName(name); // Store file name
    const parsed: ParsedDecision[] = [];
    const lines = content.split('\n');
    let lineNum = 0;

    try {
        for (const line of lines) {
            lineNum++;
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) continue; // Skip empty lines or comments

            // Expect format like "uuid: YES", "uuid:NO", "uuid : MAYBE" etc.
            const match = trimmedLine.match(/^([a-fA-F0-9-]+)\s*[:]\s*(YES|NO|MAYBE)\s*$/i);

            if (!match) {
                console.warn(`Skipping malformed line ${lineNum}: "${line}"`);
                continue; // Skip lines that don't match the expected format
            }

            const article_id = match[1];
            const decisionRaw = match[2].toUpperCase();
            let decision: ParsedDecision['decision'];

            // Convert decision to DB format
            if (decisionRaw === 'YES') decision = 'include';
            else if (decisionRaw === 'NO') decision = 'exclude';
            else if (decisionRaw === 'MAYBE') decision = 'maybe';
            else {
                 console.warn(`Skipping line ${lineNum} with invalid decision: "${match[2]}"`);
                 continue; // Should not happen with regex, but good practice
            }

            // Basic UUID validation (optional but good)
             const uuidRegex = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
             if (!uuidRegex.test(article_id)) {
                 console.warn(`Skipping line ${lineNum} with invalid Article ID format: "${article_id}"`);
                 continue;
             }

            parsed.push({ article_id, decision });
        }

        if (parsed.length === 0) {
            throw new Error("No valid 'article_id: DECISION' lines found in the file.");
        }

        console.log(`Successfully parsed ${parsed.length} decisions.`);
        onDecisionsParsed(parsed, name); // Pass parsed data up
        setError(null); // Clear error on success

    } catch (e: any) {
        console.error("Error parsing decisions file:", e);
        setError(`Error parsing file: ${e.message}`);
        onDecisionsParsed([], name); // Pass empty array on error
    } finally {
         setProcessing(false);
    }
  };


  const handleFileRead = (file: File) => {
    if (!file) return;
    if (file.type !== 'text/plain') {
      setError("Invalid file type. Please upload a .txt file.");
      return;
    }
    // Max size (e.g., 10MB) - adjust as needed
    if (file.size > 10 * 1024 * 1024) {
        setError("File is too large (max 10MB).");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
         parseContent(content, file.name);
      } else {
          setError("Could not read file content.");
      }
    };
    reader.onerror = () => {
        setError("Error reading file.");
    };
    reader.readAsText(file);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Optional: add visual cue for droppable area
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || !projectId) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileRead(files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
       handleFileRead(files[0]);
    }
     // Reset input value to allow selecting the same file again
     e.target.value = '';
  };

   const clearFile = () => {
        setError(null);
        setFileName(null);
        onDecisionsParsed([], ''); // Clear parsed data in parent
   };

  return (
    <div className={cn("mt-4", className)}>
      <label
        htmlFor="decision-dropzone-file"
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-background hover:bg-muted transition-colors",
          isDragging && "border-primary bg-muted",
          (disabled || !projectId) && "opacity-50 cursor-not-allowed",
          error && "border-destructive"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
          {fileName && !error && !processing ? (
             <>
                <FileText className="w-10 h-10 mb-3 text-green-600" />
                <p className="mb-2 text-sm font-semibold">{fileName}</p>
                <p className="text-xs text-muted-foreground">File ready for processing.</p>
                <Button variant="ghost" size="sm" onClick={clearFile} className="absolute top-2 right-2 p-1 h-auto">
                    <X className="w-4 h-4" />
                 </Button>
             </>
          ) : processing ? (
             <>
                <Loader2 className="w-10 h-10 mb-3 animate-spin" />
                <p className="text-sm text-muted-foreground">Processing...</p>
             </>
          ) : (
             <>
                <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Click to upload</span> or drag and drop AI decision file
                </p>
                <p className="text-xs text-muted-foreground">.txt file (e.g., ID: YES/NO/MAYBE per line)</p>
                {!projectId && <p className="text-xs text-destructive mt-1">Select a project first.</p>}
             </>
          )}
        </div>
        <input
          id="decision-dropzone-file"
          type="file"
          className="hidden"
          accept=".txt" // Accept only .txt files
          onChange={handleFileChange}
          disabled={disabled || !projectId}
        />
      </label>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
} 