'use client'; // This IS a Client Component

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation'; // Use router, not params here
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from 'next/link';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Fetch the current user (same as before)
  useEffect(() => {
    const getUser = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        console.error("Error getting session:", sessionError);
        setError("Could not authenticate user.");
        router.push('/login');
      } else {
        setUser(session.user);
      }
    };
    getUser();
  }, [router]);

  // Fetch Next Unscreened Article (uses projectId prop)
  const fetchNextUnscreenedArticle = useCallback(async () => {
    if (!projectId || !user?.id) return;

    console.log("Fetching next unscreened article...");
    setIsLoading(true); setError(null); setCurrentArticle(null); setIsComplete(false);

    try {
      // 1. Fetch IDs of already screened articles first
      const { data: screenedData, error: screenedError } = await supabase
        .from('screening_decisions')
        .select('article_id')
        .eq('project_id', projectId)
        .eq('user_id', user.id);

      if (screenedError) throw screenedError;

      const screenedArticleIds = screenedData?.map(d => d.article_id) || [];
      console.log("Screened article IDs:", screenedArticleIds); // Debugging

      // 2. Build the query to fetch the next article
      let query = supabase
        .from('articles')
        .select('id, pmid, title, abstract')
        .eq('project_id', projectId);

      // 3. Conditionally add the .not() filter ONLY if there are screened IDs
      if (screenedArticleIds.length > 0) {
        query = query.not('id', 'in', `(${screenedArticleIds.join(',')})`); // Use join directly here
      }

      // 4. Add ordering, limit, and execute
      const { data: nextArticleData, error: nextArticleError } = await query
        .order('created_at', { ascending: true }) // Or random()
        .limit(1)
        .single(); // Expect only one or null

      // 5. Process results (same as before)
      if (nextArticleError) {
        if (nextArticleError.code === 'PGRST116') {
           console.log("No more unscreened articles found.");
           setIsComplete(true); setCurrentArticle(null);
        } else {
           throw nextArticleError;
        }
      } else if (nextArticleData) {
         setCurrentArticle(nextArticleData);
      } else {
          console.log("No next article data returned, assuming complete.");
          setIsComplete(true);
      }

    } catch (err: any) {
      console.error("Error fetching next unscreened article:", err);
      setError(`Failed to load next article: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, user?.id]);

  // Fetch first article (same as before, depends on projectId prop)
  useEffect(() => {
    if (user?.id && projectId) {
      fetchNextUnscreenedArticle();
    }
  }, [user, projectId, fetchNextUnscreenedArticle]);

  // Handle Screening Decision (uses projectId prop)
  const handleScreeningDecision = useCallback(async (decision: ScreeningDecision) => {
    if (!projectId || !user?.id || !currentArticle?.id) { setError("Cannot save decision: missing user, project, or article ID."); return; }
    console.log(`Saving decision '${decision}' for article ${currentArticle.id}`);
    setIsSaving(true); setError(null);
    const decisionData: ScreeningDecisionSaveData = { article_id: currentArticle.id, user_id: user.id, project_id: projectId, decision: decision, };
    try {
      const { error: upsertError } = await supabase.from('screening_decisions').upsert(decisionData, { onConflict: 'user_id, article_id, project_id' });
      if (upsertError) { throw upsertError; }
      else { console.log("Decision saved successfully. Fetching next article."); await fetchNextUnscreenedArticle(); }
    } catch (err: any) { console.error("Error saving screening decision:", err); setError(`Failed to save decision: ${err.message}`); }
    finally { setIsSaving(false); }
  }, [projectId, user?.id, currentArticle?.id, fetchNextUnscreenedArticle]); // Use projectId prop

  // Render Logic (The entire JSX return statement from the previous page.tsx)
  return (
     <div className="container mx-auto px-4 py-8 max-w-3xl">
       <div className="flex justify-between items-center mb-6"> <h1 className="text-3xl font-bold">Screening</h1> <Link href="/dashboard"> <Button variant="outline">Back to Dashboard</Button> </Link> </div>
       {error && ( <Alert variant="destructive" className="mb-4"> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert> )}
       {isLoading && ( <div className="flex justify-center items-center py-16"><Loader2 className="h-12 w-12 animate-spin text-muted-foreground" /></div> )}
       {!isLoading && isComplete && ( <Card className="text-center"> <CardHeader> <CardTitle>Screening Complete!</CardTitle> </CardHeader> <CardContent> <p className="text-muted-foreground mb-4">You have screened all available articles for this project.</p> <Link href="/dashboard"> <Button variant="secondary">Return to Dashboard</Button> </Link> </CardContent> </Card> )}
       {!isLoading && !isComplete && currentArticle && ( <Card> <CardHeader> <CardTitle className="text-xl">{currentArticle.title}</CardTitle> <CardDescription>PMID: {currentArticle.pmid}</CardDescription> </CardHeader> <CardContent> <h4 className="font-semibold mb-2 text-sm">Abstract</h4> <p className="text-sm text-muted-foreground mb-6 max-h-[40vh] overflow-y-auto pr-2"> {currentArticle.abstract} </p> <div className="flex justify-center items-center gap-4 pt-4 border-t"> {isSaving && <Loader2 className="h-5 w-5 animate-spin" />} <Button size="lg" variant="default" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleScreeningDecision('include')} disabled={isSaving} > Include </Button> <Button size="lg" variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-yellow-950" onClick={() => handleScreeningDecision('maybe')} disabled={isSaving} > Maybe </Button> <Button size="lg" variant="destructive" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleScreeningDecision('exclude')} disabled={isSaving} > Exclude </Button> </div> </CardContent> </Card> )}
       {!isLoading && !isComplete && !currentArticle && !error && ( <p className="text-center text-muted-foreground">Could not load article data.</p> )}
     </div>
  );
} 