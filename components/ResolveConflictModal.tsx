'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { ReviewArticle, Decision } from '@/app/review/ReviewInterface'; // Adjust path if needed

interface ResolveConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  article: ReviewArticle | null; // Article to resolve
  user: User | null; // The user performing the resolution
  onResolved: () => void; // Callback after successful resolution
}

// Define the decision type locally or import if shared
type ScreeningDecision = 'include' | 'exclude' | 'maybe';

export function ResolveConflictModal({
  isOpen,
  onClose,
  article,
  user,
  onResolved
}: ResolveConflictModalProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalDecision = async (finalDecisionValue: ScreeningDecision) => {
    if (!article || !user || isSaving) return;

    setIsSaving(true);
    setError(null);
    console.log(`Resolver ${user.id} making final decision '${finalDecisionValue}' for article ${article.id}`);

    try {
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          resolved_decision: finalDecisionValue,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', article.id); // Target the specific article

      if (updateError) {
        console.error("Error updating article resolution:", updateError);
        throw updateError;
      }

      console.log(`Conflict resolved for article ${article.id}`);
      onResolved(); // Trigger refresh on the parent page
      // onClose(); // Let onResolved handle closing if needed, or close directly

    } catch (err: any) {
      // --- Add more detailed logging ---
      console.error("Modal Error Type:", typeof err);
      console.error("Modal Error Object:", err);
      console.error("Modal Detailed Error Saving:", JSON.stringify(err, null, 2));
      setError(`Failed to save final decision: ${err.message || 'Unknown error occurred'} (Code: ${err.code || 'N/A'})`);
      // ----------------------------------
    } finally {
      setIsSaving(false);
    }
  };

  if (!article) return null; // Don't render if no article is selected

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] md:max-w-[800px] lg:max-w-[1000px]"> {/* Wider modal */}
        <DialogHeader>
          <DialogTitle>Resolve Conflict: {article.title}</DialogTitle>
          <DialogDescription>
            PMID: {article.pmid}. Review the abstract and make the final screening decision.
          </DialogDescription>
        </DialogHeader>

        {/* Display original conflicting decisions for context (optional) */}
        <div className="my-4 p-3 border rounded bg-muted/50">
             <h4 className="text-sm font-semibold mb-2">Original Decisions:</h4>
             <ul className="list-disc pl-5 space-y-1 text-xs">
                 {article.decisions.map((decision: Decision, index: number) => {
                     let displayName = 'Unknown';
                     if (decision.agent_id) displayName = decision.agent_name || `Agent (${decision.agent_id?.substring(0,6)}...)`;
                     else if (decision.user_id) displayName = decision.user_email || `User (${decision.user_id?.substring(0,6)}...)`;
                     return (
                         <li key={`${decision.agent_id || decision.user_id}-${index}`}>
                           <span className="font-medium">{displayName}:</span>
                           <span className={`ml-2 font-semibold ${
                               decision.decision === 'include' ? 'text-green-700' :
                               decision.decision === 'exclude' ? 'text-red-700' :
                               'text-yellow-700'
                           }`}>
                              {decision.decision.charAt(0).toUpperCase() + decision.decision.slice(1)}
                           </span>
                         </li>
                     );
                 })}
             </ul>
        </div>

        {/* Abstract */}
        <div className="mb-4 max-h-[40vh] overflow-y-auto pr-2 border rounded p-3">
           <h4 className="font-semibold mb-2 text-sm">Abstract</h4>
           <p className="text-sm text-muted-foreground">
              {article.abstract || 'No abstract available.'}
           </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:justify-center"> {/* Center buttons */}
          {isSaving && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
          <Button
             size="lg"
             variant="default"
             className="bg-green-600 hover:bg-green-700 text-white"
             onClick={() => handleFinalDecision('include')}
             disabled={isSaving}
           >
             Final: Include
           </Button>
          <Button
            size="lg"
            variant="secondary"
            className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950"
            onClick={() => handleFinalDecision('maybe')}
            disabled={isSaving}
          >
            Final: Maybe
          </Button>
          <Button
            size="lg"
            variant="destructive"
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => handleFinalDecision('exclude')}
            disabled={isSaving}
          >
            Final: Exclude
          </Button>
           <DialogClose asChild>
               <Button type="button" variant="outline" disabled={isSaving}>
                 Cancel
               </Button>
           </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 