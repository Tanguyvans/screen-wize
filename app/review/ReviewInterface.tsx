'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- Data Types ---
interface Project {
  id: string;
  name: string;
}

// Type for aggregated stats per user
interface UserReviewStats {
  userId: string;
  userEmail: string; // Display identifier
  includeCount: number;
  maybeCount: number;
  excludeCount: number;
  totalScreened: number;
}

// Type for a single decision linked to a user
interface Decision {
  user_id: string;
  decision: 'include' | 'exclude' | 'maybe';
  user_email?: string; // Optional: To store user email/identifier
}

// Type for an article on the review page, including its decisions and conflict status
interface ReviewArticle {
  id: string;
  pmid: string;
  title: string;
  decisions: Decision[];
  conflict: boolean; // Flag to indicate disagreement
}

// // Type for aggregated stats (Commented out for now, focus on conflicts)
// interface AggregatedStats {
//   totalArticles: number;
//   totalScreened: number;
//   totalInclude: number;
//   totalMaybe: number;
//   totalExclude: number;
// }

// --- Component ---
// No longer receives projectId as a prop
export default function ReviewInterface() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null); // State for selected project
  const [userStats, setUserStats] = useState<UserReviewStats[]>([]); // State for user stats
  const [conflictingArticles, setConflictingArticles] = useState<ReviewArticle[]>([]); // State for conflict list
  const [conflictCount, setConflictCount] = useState<number>(0); // State for total conflicts
  const [isLoadingProjects, setIsLoadingProjects] = useState(true); // Loading for projects
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(false); // Separate loading for review data
  const [error, setError] = useState<string | null>(null);

  // --- Fetch User ---
  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getUser();
  }, []);

  // --- Fetch User's Projects (Similar to Dashboard) ---
  const fetchProjects = useCallback(async (currentUserId: string | null) => {
    if (!currentUserId) {
       setProjects([]);
       setIsLoadingProjects(false);
       return;
    }
    setIsLoadingProjects(true);
    setError(null);
    console.log("Fetching projects for review page...");

    const { data: projectData, error: projectsError } = await supabase
      .from('project_members')
      .select('projects!inner( id, name )')
      .eq('user_id', currentUserId);

    if (projectsError) {
      console.error("Error fetching projects:", projectsError);
      setError(`Failed to load projects: ${projectsError.message}`);
      setProjects([]);
    } else {
        let userProjects: Project[] = [];
        if (projectData && Array.isArray(projectData)) {
            userProjects = projectData
                .map(pm => {
                    const project = pm?.projects;
                    if (project && typeof project === 'object' && 'id' in project && 'name' in project) {
                        return project as Project;
                    } return null;
                })
                .filter((p): p is Project => p !== null);
        }
        console.log("Fetched projects:", userProjects);
        setProjects(userProjects);
        // Don't auto-select here, let the user choose
    }
    setIsLoadingProjects(false);
  }, []);

  // Trigger project fetch when user is loaded
  useEffect(() => {
    if (user?.id) {
        fetchProjects(user.id);
    }
  }, [user?.id, fetchProjects]);


  // --- Fetch Review Data (Aggregates stats AND identifies conflicts) ---
  const fetchReviewData = useCallback(async () => {
    if (!selectedProjectId) {
        setUserStats([]);
        setConflictingArticles([]);
        setConflictCount(0);
        return;
    }

    setIsLoadingReviewData(true);
    setError(null);
    setUserStats([]); // Clear previous results
    setConflictingArticles([]);
    setConflictCount(0);
    console.log(`Fetching full review data for project: ${selectedProjectId}`);

    try {
        // 1. Fetch ALL screening decisions (raw)
        const { data: allDecisionsRaw, error: decisionError } = await supabase
            .from('screening_decisions')
            .select('article_id, user_id, decision')
            .eq('project_id', selectedProjectId)
            .in('decision', ['include', 'exclude', 'maybe']);

        if (decisionError) throw new Error(`Failed to get project decisions: ${decisionError.message}`);
        if (!allDecisionsRaw || allDecisionsRaw.length === 0) {
            console.log("No decisions found for this project.");
            setIsLoadingReviewData(false);
            return; // Nothing more to process
        }

        // 2. Get unique user IDs and fetch profiles (Two-Step)
        const userIds = [...new Set(allDecisionsRaw.map(d => d.user_id))];
        const userEmailMap = new Map<string, string>();
        if (userIds.length > 0) {
            const { data: profiles, error: profileError } = await supabase
              .from('profiles')
              .select('id, email')
              .in('id', userIds);
            if (profileError) { console.warn("Could not fetch user emails:", profileError.message); }
            else { profiles?.forEach(p => { if (p.id && p.email) { userEmailMap.set(p.id, p.email); } }); }
        }

        // 3. Process for User Stats AND Article Decisions simultaneously
        const statsByUser = new Map<string, UserReviewStats>();
        const decisionsByArticle = new Map<string, Decision[]>();

        allDecisionsRaw.forEach(rawDecision => {
            const userId = rawDecision.user_id;
            const articleId = rawDecision.article_id;
            const userIdentifier = userEmailMap.get(userId) || userId;

            // --- Update User Stats ---
            if (!statsByUser.has(userId)) {
                statsByUser.set(userId, { userId, userEmail: userIdentifier, includeCount: 0, maybeCount: 0, excludeCount: 0, totalScreened: 0 });
            }
            const currentUserStats = statsByUser.get(userId)!;
            if (rawDecision.decision === 'include') currentUserStats.includeCount++;
            else if (rawDecision.decision === 'maybe') currentUserStats.maybeCount++;
            else if (rawDecision.decision === 'exclude') currentUserStats.excludeCount++;
            currentUserStats.totalScreened++;
            statsByUser.set(userId, currentUserStats); // Update map

            // --- Update Decisions By Article ---
            const decisionForArticle: Decision = { user_id: userId, decision: rawDecision.decision, user_email: userIdentifier };
            const existingDecisions = decisionsByArticle.get(articleId) || [];
            decisionsByArticle.set(articleId, [...existingDecisions, decisionForArticle]);
        });

        // Set user stats state
        setUserStats(Array.from(statsByUser.values()));

        // 4. Fetch article details for articles that have decisions
        const articleIdsWithDecisions = Array.from(decisionsByArticle.keys());
        if (articleIdsWithDecisions.length === 0) {
             console.log("No articles have decisions yet.");
             setIsLoadingReviewData(false);
             return;
        }

        console.log('Article IDs for filtering:', articleIdsWithDecisions);
        console.log('Number of Article IDs:', articleIdsWithDecisions.length);

        // --- Temporarily replace the failing query ---
        console.log("Fetching ONE article details for review (TESTING)...");
        const { data: articlesData, error: articlesError } = await supabase
            .from('articles')
            .select('id, title, abstract') // Select needed fields
            .eq('project_id', selectedProjectId) // Ensure articles are from the correct project
            .limit(1); // <<<--- Just try to get one article
         // --------------------------------------------

        if (articlesError) {
             console.error("Supabase articles fetch error object (TESTING):", JSON.stringify(articlesError, null, 2));
            throw new Error(`Failed to fetch relevant project articles (TESTING): ${articlesError.message}`);
        }
        console.log("TESTING - Fetched article data:", articlesData) // See if this works

        // 5. Identify Conflicts and build final list
        let currentConflictCount = 0;
        const articlesForReview: ReviewArticle[] = (articlesData || []).map(article => {
             const decisions = decisionsByArticle.get(article.id) || []; // Should always have decisions here
             let conflict = false;
             if (decisions.length >= 2) {
                 const decisionSet = new Set(decisions.map(d => d.decision));
                 if (decisionSet.has('include') && decisionSet.has('exclude')) {
                     conflict = true;
                     currentConflictCount++;
                 }
                 // Add other conflict rules if desired
             }
             return { ...article, decisions, conflict };
         });

        // 6. Set State for conflicts
        setConflictingArticles(articlesForReview.filter(a => a.conflict));
        setConflictCount(currentConflictCount);

        console.log(`Processed decisions for ${statsByUser.size} users. Found ${currentConflictCount} conflicts.`);

    } catch (err: any) {
        console.error("Error fetching review data:", err);
        setError(`Failed to load review data: ${err.message}`);
        setUserStats([]);
        setConflictingArticles([]);
        setConflictCount(0);
    } finally {
        setIsLoadingReviewData(false);
    }
  }, [selectedProjectId]);

  // Trigger data fetch when selected project changes
  useEffect(() => {
    fetchReviewData();
  }, [fetchReviewData]); // fetchReviewData has selectedProjectId in its deps


  // --- Handle Project Selection Change ---
  const handleProjectSelect = (projectId: string) => {
    console.log("Review Project selected:", projectId);
    setSelectedProjectId(projectId);
    // Clear previous review results immediately
    setUserStats([]);
    // Data fetching will be triggered by the useEffect hook above
  };

  // --- Resolve Conflict Placeholder ---
  const handleResolveConflict = (articleId: string) => {
      console.log("TODO: Implement conflict resolution logic for article:", articleId);
      alert(`Resolve action triggered for article ${articleId}. (Implementation needed)`);
      // This would typically involve:
      // - Showing a modal/dedicated view for the specific article.
      // - Allowing a user (maybe admin/lead) to make a final decision.
      // - Updating the database (e.g., adding a 'resolved_decision' column or updating status).
      // - Refreshing the review data.
  };

  // --- Render Logic ---
  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || '';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Review Project</h1>
        <Link href="/dashboard">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      {/* General Error Display */}
      {error && !isLoadingProjects && !isLoadingReviewData && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Project Selection Area */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Select Project to Review</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingProjects ? (
             <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading projects...</span>
             </div>
          ) : projects.length > 0 ? (
            <Select value={selectedProjectId ?? ''} onValueChange={handleProjectSelect}>
              <SelectTrigger className="w-full md:w-[350px]">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-muted-foreground">You are not a member of any projects.</p>
          )}
        </CardContent>
      </Card>

      {/* Review Content Area (Conditional) */}
      {selectedProjectId && (
         <div className="mt-6 border-t pt-6">
             {/* Loading State for Review Data */}
            {isLoadingReviewData && (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

             {/* Data Display Area */}
            {!isLoadingReviewData && !error && (
              <>
                {/* === User Stats Section === */}
                <section className="mb-8">
                   <h2 className="text-xl font-semibold mb-4">User Decision Summary: {selectedProjectName}</h2>
                   {userStats.length > 0 ? (
                     <div className="space-y-4">
                       {userStats.map(stats => (
                         <Card key={stats.userId}>
                            <CardHeader className="pb-2">
                               <CardTitle className="text-lg">{stats.userEmail}</CardTitle>
                               <CardDescription>Total Screened: {stats.totalScreened}</CardDescription>
                             </CardHeader>
                             <CardContent>
                                <div className="grid grid-cols-3 gap-4 text-center pt-4">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Included</p>
                                        <p className="text-2xl font-bold text-green-700">{stats.includeCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Maybe</p>
                                        <p className="text-2xl font-bold text-yellow-700">{stats.maybeCount}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Excluded</p>
                                        <p className="text-2xl font-bold text-red-700">{stats.excludeCount}</p>
                                    </div>
                                </div>
                             </CardContent>
                         </Card>
                       ))}
                     </div>
                   ) : (
                     <p className="text-center text-muted-foreground">No screening decisions found for this project yet.</p>
                   )}
                </section>

                {/* === Conflicts Section === */}
                <section className="mt-8 border-t pt-6">
                   <h2 className="text-xl font-semibold mb-4">Conflicts: {selectedProjectName}</h2>
                   <p className="mb-4 text-lg">
                       Total Conflicts Found: <span className="font-semibold">{conflictCount}</span>
                   </p>

                   {conflictingArticles.length > 0 ? (
                     <div className="space-y-4">
                       {conflictingArticles.map(article => (
                         <Card key={article.id} className="border-l-4 border-red-500">
                            <CardHeader className="pb-2">
                               <CardTitle className="text-lg">{article.title}</CardTitle>
                               <CardDescription>PMID: {article.pmid}</CardDescription>
                            </CardHeader>
                            <CardContent>
                               <h4 className="text-sm font-semibold mb-2">Decisions:</h4>
                               <ul className="list-disc pl-5 space-y-1 text-sm">
                                 {article.decisions.map(decision => (
                                   <li key={decision.user_id}>
                                     <span className="font-medium">{decision.user_email || 'Unknown User'}:</span>
                                     <span className={`ml-2 font-semibold ${
                                         decision.decision === 'include' ? 'text-green-700' :
                                         decision.decision === 'exclude' ? 'text-red-700' :
                                         'text-yellow-700'
                                     }`}>
                                        {decision.decision.charAt(0).toUpperCase() + decision.decision.slice(1)}
                                      </span>
                                   </li>
                                 ))}
                               </ul>
                               {/* Resolve Button */}
                               <div className="mt-4 text-right">
                                   <Button variant="outline" size="sm" onClick={() => handleResolveConflict(article.id)}>
                                        Resolve Conflict...
                                   </Button>
                               </div>
                            </CardContent>
                         </Card>
                       ))}
                     </div>
                   ) : (
                     <p className="text-center text-muted-foreground mt-4">
                       No articles with conflicting decisions (Include vs Exclude) found.
                     </p>
                   )}
                </section>
              </>
            )}

            {/* Error loading review data */}
            {!isLoadingReviewData && error && (
                 <p className="text-center text-red-600 mt-8">Could not load review data.</p>
             )}
          </div>
      )}

      {/* Message if no project is selected */}
      {!selectedProjectId && !isLoadingProjects && projects.length > 0 && (
          <p className="text-center text-muted-foreground mt-8">Please select a project above to review.</p>
      )}
    </div>
  );
} 