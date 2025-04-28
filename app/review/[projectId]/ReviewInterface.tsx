'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from 'next/link';

// --- Data Types (Define as needed) ---
interface ReviewArticle {
  id: string;
  pmid: string;
  title: string;
  // Add decisions later: decisions: { userId: string; userEmail?: string; decision: string }[];
  // Add conflict status later: conflict: boolean;
}

// --- Component ---
export default function ReviewInterface({ projectId }: { projectId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [articles, setArticles] = useState<ReviewArticle[]>([]); // Will hold articles with conflict info
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('Project'); // State for project name

  // --- Fetch User ---
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getUser();
  }, []);

  // --- Fetch Project Data (Articles, Decisions, Conflicts) ---
  const fetchReviewData = useCallback(async () => {
    if (!projectId || !user?.id) return;

    setIsLoading(true);
    setError(null);
    console.log(`Fetching review data for project: ${projectId}`);

    try {
        // Fetch project name first (optional, could be passed from server)
        const { data: projectData, error: nameError } = await supabase
            .from('projects')
            .select('name')
            .eq('id', projectId)
            .single();

        if (nameError) throw new Error(`Failed to fetch project name: ${nameError.message}`);
        setProjectName(projectData?.name || 'Project');

        // --- Placeholder for fetching articles and decisions ---
        // In the next step, we'll fetch 'articles' and 'screening_decisions'
        // for this project, then process them to identify conflicts.
        console.log("TODO: Fetch articles and decisions, identify conflicts.");
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
        setArticles([]); // Set to empty for now

        // Example of setting state after processing:
        // const processedArticles = processConflicts(fetchedArticles, fetchedDecisions);
        // setArticles(processedArticles);

    } catch (err: any) {
        console.error("Error fetching review data:", err);
        setError(`Failed to load review data: ${err.message}`);
        setArticles([]);
    } finally {
        setIsLoading(false);
    }
  }, [projectId, user?.id]);

  // Trigger data fetch when component mounts or dependencies change
  useEffect(() => {
    fetchReviewData();
  }, [fetchReviewData]);


  // --- Render Logic ---
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Review Conflicts: {projectName}</h1>
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-16">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Content Area (Placeholder) */}
      {!isLoading && !error && (
        <div>
          <p className="text-center text-muted-foreground mt-8">
            Review interface placeholder. Conflict list will appear here.
          </p>
          {/* TODO: Add tabs/filters (Conflicts, Agreements) */}
          {/* TODO: Render the list of articles with conflict details */}
          {articles.length === 0 && <p className="text-center mt-4">(No articles to review yet)</p>}
        </div>
      )}
    </div>
  );
} 