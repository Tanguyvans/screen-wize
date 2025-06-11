'use client'; // This IS a Client Component

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from 'next/link';
import { cn } from '@/lib/utils'; // Import cn for combining classes

// Define the screening decision type
type ScreeningDecision = 'include' | 'exclude' | 'maybe';

// Type for the article being screened
interface ScreeningArticle {
  id: string;
  pmid: string;
  title: string;
  abstract: string;
}

// Type for saving screening decisions
interface ScreeningDecisionSaveData {
    article_id: string;
    user_id: string;
    project_id: string;
    decision: ScreeningDecision;
}

// --- Component that receives projectId as a prop ---
export default function ScreeningInterface({ projectId }: { projectId: string }) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ScreeningArticle | null>(null);
  // Rename isLoading to isInitialLoading for the first load
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  // Keep isSaving for the button state during save/fetch cycle
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Fetch user effect (no change)
  useEffect(() => {
    const getUser = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        console.error("Error getting session:", sessionError);
        setError("Could not authenticate user.");
        // Optionally redirect, or rely on page-level auth guard
        // router.push('/login');
      } else {
        setUser(session.user);
      }
    };
    getUser();
  }, [router]); // Removed router dependency if not pushing

  // Fetch Next Unscreened Article (Modified for URL length fix)
  const fetchNextUnscreenedArticle = useCallback(async (initialFetch = false) => {
    if (!projectId || !user?.id) return;

    console.log("Fetching next unscreened article...");
    // Only set full loading state on the very first fetch
    if (initialFetch) {
        setIsInitialLoading(true);
        setCurrentArticle(null); // Clear article only on initial load
    } else {
        // For subsequent fetches (after saving), just use isSaving
        setIsSaving(true);
    }
    setError(null);
    setIsComplete(false);

    try {
         // NEW APPROACH: Use a more efficient query to avoid URL length limits
         // Instead of excluding all screened articles, we'll find the next unscreened article
         // using a LEFT JOIN approach via RPC or a more efficient query
         
         // Option 1: Use a simpler approach with pagination and filtering client-side for small batches
         // This is more efficient than sending hundreds of IDs in the URL
         
         const BATCH_SIZE = 50; // Fetch articles in small batches to check
         let foundArticle: ScreeningArticle | null = null;
         let offset = 0;
         const MAX_ITERATIONS = 100; // Prevent infinite loops
         let iterations = 0;

         while (!foundArticle && iterations < MAX_ITERATIONS) {
             // 1. Fetch a batch of articles ordered by creation date
             const { data: articleBatch, error: articleError } = await supabase
                 .from('articles')
                 .select('id, pmid, title, abstract')
                 .eq('project_id', projectId)
                 .order('created_at', { ascending: true })
                 .range(offset, offset + BATCH_SIZE - 1);

             if (articleError) throw articleError;
             
             if (!articleBatch || articleBatch.length === 0) {
                 // No more articles to check
                 console.log("No more articles found in the project.");
                 setIsComplete(true);
                 setCurrentArticle(null);
                 return;
             }

             // 2. Get screened article IDs for this batch only
             const batchArticleIds = articleBatch.map(a => a.id);
             const { data: screenedData, error: screenedError } = await supabase
                 .from('screening_decisions')
                 .select('article_id')
                 .eq('project_id', projectId)
                 .eq('user_id', user.id)
                 .in('article_id', batchArticleIds);

             if (screenedError) throw screenedError;

             const screenedArticleIds = new Set(screenedData?.map(d => d.article_id) || []);

             // 3. Find the first unscreened article in this batch
             foundArticle = articleBatch.find(article => !screenedArticleIds.has(article.id)) || null;

             if (!foundArticle) {
                 // Move to next batch
                 offset += BATCH_SIZE;
                 iterations++;
                 console.log(`No unscreened articles in batch ${iterations}, checking next batch...`);
             }
         }

         if (foundArticle) {
             console.log("Next article fetched:", foundArticle.id);
             setCurrentArticle(foundArticle);
             setIsComplete(false);
         } else {
             console.log("No more unscreened articles found after checking all batches.");
             setIsComplete(true);
             setCurrentArticle(null);
         }

    } catch (err: any) {
      console.error("Error fetching next unscreened article:", err);
      setError(`Failed to load next article: ${err.message}`);
    } finally {
      // Turn off loading indicators
      if (initialFetch) {
         setIsInitialLoading(false);
      }
      setIsSaving(false); // Always turn off saving state
    }
  }, [projectId, user?.id]);

  // Fetch first article (Pass true for initialFetch)
  useEffect(() => {
    if (user?.id && projectId) {
      fetchNextUnscreenedArticle(true); // <-- Indicate initial fetch
    }
    // Add projectId to dependencies if it could change without remounting
  }, [user?.id, projectId, fetchNextUnscreenedArticle]);

  // Handle Screening Decision (Modified to only set isSaving)
  const handleScreeningDecision = useCallback(async (decision: ScreeningDecision) => {
    // Added !isSaving check
    if (!projectId || !user?.id || !currentArticle?.id || isSaving) {
        setError("Cannot save decision: missing data or already saving.");
        return;
    }
    console.log(`Saving decision '${decision}' for article ${currentArticle.id}`);
    setIsSaving(true); // Set saving state immediately
    setError(null);
    const decisionData: ScreeningDecisionSaveData = { article_id: currentArticle.id, user_id: user.id, project_id: projectId, decision: decision, };

    try {
      const { error: upsertError } = await supabase.from('screening_decisions').upsert(decisionData, { onConflict: 'user_id, article_id, project_id' });
      if (upsertError) {
          console.error("Supabase upsert error:", upsertError); // Log the upsert error
          throw upsertError;
      }
      else {
        console.log("Decision saved successfully. Fetching next article.");
        // Fetch next article WITHOUT marking as initialFetch
        // fetchNextUnscreenedArticle will handle setting isSaving to false
        await fetchNextUnscreenedArticle(false);
      }
    } catch (err: any) {
        console.error("Error saving screening decision:", err);
        setError(`Failed to save decision: ${err.message}`);
        setIsSaving(false); // Ensure saving is turned off on error
    }
    // No finally block needed here, fetchNext handles isSaving=false
  }, [projectId, user?.id, currentArticle?.id, fetchNextUnscreenedArticle, isSaving]); // Added isSaving dependency

  // Render Logic (Modified)
  return (
     <div className="container mx-auto px-4 py-8 max-w-3xl">
       <div className="flex justify-between items-center mb-6"> <h1 className="text-3xl font-bold">Screening</h1> <Link href="/dashboard"> <Button variant="outline">Back to Dashboard</Button> </Link> </div>
       {error && ( <Alert variant="destructive" className="mb-4"> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert> )}

       {/* Show full page loader ONLY on initial load */}
       {isInitialLoading && ( <div className="flex justify-center items-center py-16"><Loader2 className="h-12 w-12 animate-spin text-muted-foreground" /></div> )}

       {/* Show completion message */}
       {!isInitialLoading && isComplete && ( <Card className="text-center"> <CardHeader> <CardTitle>Screening Complete!</CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground mb-4">You have screened all available articles for this project.</p> <Link href="/dashboard"> <Button variant="secondary">Return to Dashboard</Button> </Link> </CardContent> </Card> )}

       {/* Show article card if not initial loading and not complete */}
       {!isInitialLoading && !isComplete && (
          <Card className={cn(isSaving && "opacity-75")}>
             {currentArticle ? (
                <>
                   {/* --- NEW: Wrapper for Header + Abstract with Fixed Height & Scroll --- */}
                   {/* Adjust h-[55vh] or h-[60vh] as needed for your layout */}
                   <div className="h-[60vh] overflow-y-auto">
                       <CardHeader>
                          <CardTitle className="text-xl">{currentArticle.title}</CardTitle>
                          <CardDescription>PMID: {currentArticle.pmid}</CardDescription>
                       </CardHeader>
                       <CardContent className="pt-0"> {/* Remove default CardContent padding-top */}
                         <h4 className="font-semibold mb-2 text-sm">Abstract</h4>
                         {/* Original abstract container - remove max-h */}
                         <div className="min-h-[30vh] mb-6"> {/* Keep min-height for structure */}
                             <p className="text-sm text-muted-foreground pr-2"> {/* Removed max-h */}
                                {currentArticle.abstract || 'No abstract available.'}
                             </p>
                         </div>
                       </CardContent>
                   </div>
                   {/* --- End of Fixed Height Wrapper --- */}

                   {/* --- Button Area (Outside the fixed height wrapper) --- */}
                   <CardContent className="pt-0"> {/* Use CardContent again for consistent padding */}
                       <div className="flex justify-center items-center gap-4 pt-4 border-t relative">
                           {/* Show spinner overlay when isSaving */}
                           {isSaving && (
                              <div className="absolute inset-0 flex justify-center items-center bg-background/50 backdrop-blur-sm rounded-b-lg">
                                 <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                           )}
                           {/* Buttons are disabled by isSaving */}
                           <Button size="lg" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleScreeningDecision('include')} disabled={isSaving} > Include </Button>
                           <Button size="lg" variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950" onClick={() => handleScreeningDecision('maybe')} disabled={isSaving} > Maybe </Button>
                           <Button size="lg" variant="destructive" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleScreeningDecision('exclude')} disabled={isSaving} > Exclude </Button>
                       </div>
                   </CardContent>
                   {/* --- End of Button Area --- */}
                </>
             ) : (
                // Loading placeholder inside the card structure to maintain height
                 <div className="h-[60vh] flex items-center justify-center"> {/* Match fixed height */}
                    {!error && <p className="text-muted-foreground">Loading next article...</p>}
                 </div>
             )}
          </Card>
       )}

       {/* Fallback message if loading finished but no article and not complete and no error */}
       {!isInitialLoading && !isComplete && !currentArticle && !error && ( <p className="text-center text-muted-foreground p-8">Could not load article data. Please try refreshing.</p> )}
     </div>
  );
} 