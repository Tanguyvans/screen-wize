'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Download } from "lucide-react";
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResolveConflictModal } from '@/components/ResolveConflictModal';

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

// --- NEW: Type for aggregated stats per agent ---
interface AgentReviewStats {
    agentId: string;
    agentName: string; // Display identifier
    includeCount: number;
    maybeCount: number;
    excludeCount: number;
    totalScreened: number;
}

// Type for a single decision linked to a user OR an agent
export interface Decision {
  user_id: string | null;
  agent_id: string | null;
  decision: 'include' | 'exclude' | 'maybe';
  exclusion_reason?: string | null;
  user_email?: string;
  agent_name?: string;
}

// Type for an article on the review page, including its decisions and conflict status
export interface ReviewArticle {
  id: string;
  pmid: string;
  title: string;
  abstract: string;
  decisions: Decision[];
  conflict: boolean; // Flag to indicate disagreement
  resolved_decision?: ScreeningDecision | null; // Re-add resolved_decision
}

// Add ScreeningDecision type if not imported globally
type ScreeningDecision = 'include' | 'exclude' | 'maybe';

// --- NEW: Type for Resolved Articles display (Updated) ---
interface FinalizedArticle {
    id: string;
    pmid: string;
    title: string;
    abstract: string;
    final_decision: ScreeningDecision;
    finalized_at: string;
    resolver_id: string | null;
    finalizing_agent_id: string | null;
    final_exclusion_reason: string | null;
    original_decisions: Decision[];
}
// ---------------------------------------------

// --- Component ---
// No longer receives projectId as a prop
export default function ReviewInterface() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null); // State for selected project
  const [userStats, setUserStats] = useState<UserReviewStats[]>([]); // State for user stats
  const [agentStats, setAgentStats] = useState<AgentReviewStats[]>([]); // <-- NEW State for Agent Stats
  const [conflictingArticles, setConflictingArticles] = useState<ReviewArticle[]>([]); // State for conflict list
  const [conflictCount, setConflictCount] = useState<number>(0); // State for total conflicts
  const [isLoadingProjects, setIsLoadingProjects] = useState(true); // Loading for projects
  const [isLoadingReviewData, setIsLoadingReviewData] = useState(false); // Separate loading for review data
  const [error, setError] = useState<string | null>(null);
  const [finalizedArticles, setFinalizedArticles] = useState<FinalizedArticle[]>([]); // <-- NEW State
  const [userEmailMap, setUserEmailMap] = useState<Map<string, string>>(new Map()); // <-- NEW State for the map
  const [agentNameMap, setAgentNameMap] = useState<Map<string, string>>(new Map());

  // --- Re-add Modal State ---
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [selectedArticleForResolution, setSelectedArticleForResolution] = useState<ReviewArticle | null>(null);
  // ---------------------

  // --- NEW State for Resolved Download ---
  const [isDownloadingFinalized, setIsDownloadingFinalized] = useState(false);
  const [downloadFinalizedError, setDownloadFinalizedError] = useState<string | null>(null);
  // --------------------------------------

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


  // --- Fetch Review Data (Store userEmailMap in state) ---
  const fetchReviewData = useCallback(async () => {
    if (!selectedProjectId) {
        setUserStats([]);
        setAgentStats([]);
        setConflictingArticles([]);
        setConflictCount(0);
        setFinalizedArticles([]);
        setUserEmailMap(new Map()); // <-- Clear map state
        return;
    }

    setIsLoadingReviewData(true);
    setError(null);
    setUserStats([]);
    setAgentStats([]);
    setConflictingArticles([]);
    setConflictCount(0);
    setFinalizedArticles([]);
    setUserEmailMap(new Map()); // <-- Clear map state
    console.log(`Fetching full review data for project: ${selectedProjectId}`);

    try {
        // --- Step 1: Fetch User and Agent Stats (Still needed separately for now) ---
        // Fetch ALL decisions just for calculating stats (could potentially be optimized further)
        let allDecisionsRaw: any[] = [];
        let currentOffset = 0;
        const BATCH_DECISION_SIZE = 1000; // Supabase default limit, can adjust
        let fetchMore = true;
        console.log("Fetching ALL decisions in batches...");

        while (fetchMore) {
            const { data: batchDecisions, error: decisionError } = await supabase
                .from('screening_decisions')
                .select('article_id, user_id, agent_id, decision')
                .eq('project_id', selectedProjectId)
                .in('decision', ['include', 'exclude', 'maybe'])
                .range(currentOffset, currentOffset + BATCH_DECISION_SIZE - 1); // Fetch in batches

            if (decisionError) {
                 console.error(`Failed to get decisions batch (offset ${currentOffset}):`, decisionError);
                 throw new Error(`Failed to get decisions batch: ${decisionError.message}`);
            }

            if (batchDecisions && batchDecisions.length > 0) {
                // Add type assertion if needed, or ensure Supabase types are robust
                allDecisionsRaw = allDecisionsRaw.concat(batchDecisions as any);
                currentOffset += batchDecisions.length;
                if (batchDecisions.length < BATCH_DECISION_SIZE) {
                    fetchMore = false; // Reached the end
                }
                 console.log(`Fetched batch, total decisions now: ${allDecisionsRaw.length}`);
            } else {
                fetchMore = false; // No more decisions found
            }
        }
        console.log(`Total decisions fetched for project: ${allDecisionsRaw.length}`);
        // --- End of Stats Calculation ---

        if (allDecisionsRaw.length === 0) {
            console.log("No decisions found for this project.");
            setIsLoadingReviewData(false);
            return; // Nothing more to process
        }

        // 2. Get unique user IDs AND agent IDs & Fetch names/emails
        const userIds = [...new Set(allDecisionsRaw.map(d => d.user_id).filter(id => id !== null))] as string[];
        const agentIds = [...new Set(allDecisionsRaw.map(d => d.agent_id).filter(id => id !== null))] as string[];

        // --- Create local map ---
        const localUserEmailMap = new Map<string, string>();
        if (userIds.length > 0) {
            const { data: profiles, error: profileError } = await supabase
              .from('profiles')
              .select('id, email')
              .in('id', userIds);
            if (profileError) { console.warn("Could not fetch user emails:", profileError.message); }
             // --- Populate local map ---
            else { profiles?.forEach(p => { if (p.id && p.email) { localUserEmailMap.set(p.id, p.email); } }); }
        }

        const localAgentNameMap = new Map<string, string>();
        if (agentIds.length > 0) {
             console.log("Fetching agent names for IDs:", agentIds);
            const { data: agents, error: agentError } = await supabase
                .from('ai_agents')
                .select('id, name')
                .in('id', agentIds);
            if (agentError) { console.warn("Could not fetch agent names:", agentError.message); }
            else { agents?.forEach(a => { if (a.id && a.name) { localAgentNameMap.set(a.id, a.name); } }); }
        }
        console.log("Local User Email Map:", localUserEmailMap);
        console.log("Local Agent Name Map:", localAgentNameMap);
        // --------------------------------

        // 3. Process for User Stats, AGENT Stats, AND Article Decisions
        const statsByUser = new Map<string, UserReviewStats>();
        const statsByAgent = new Map<string, AgentReviewStats>(); // <-- NEW Map for Agent Stats
        const decisionsByArticle = new Map<string, Decision[]>();

        allDecisionsRaw.forEach(rawDecision => {
            const articleId = rawDecision.article_id;

            // --- Update User Stats (Only if user_id is present) ---
            if (rawDecision.user_id) {
                const userId = rawDecision.user_id;
                const userIdentifier = localUserEmailMap.get(userId) || userId;
                if (!statsByUser.has(userId)) {
                    statsByUser.set(userId, { userId, userEmail: userIdentifier, includeCount: 0, maybeCount: 0, excludeCount: 0, totalScreened: 0 });
                }
                const currentUserStats = statsByUser.get(userId)!;
                if (rawDecision.decision === 'include') currentUserStats.includeCount++;
                else if (rawDecision.decision === 'maybe') currentUserStats.maybeCount++;
                else if (rawDecision.decision === 'exclude') currentUserStats.excludeCount++;
                currentUserStats.totalScreened++;
                statsByUser.set(userId, currentUserStats);
            }
            // --- NEW: Update Agent Stats (Only if agent_id is present) ---
            else if (rawDecision.agent_id) {
                const agentId = rawDecision.agent_id;
                const agentIdentifier = localAgentNameMap.get(agentId) || agentId; // Use name or ID
                if (!statsByAgent.has(agentId)) {
                    statsByAgent.set(agentId, { agentId, agentName: agentIdentifier, includeCount: 0, maybeCount: 0, excludeCount: 0, totalScreened: 0 });
                }
                const currentAgentStats = statsByAgent.get(agentId)!;
                if (rawDecision.decision === 'include') currentAgentStats.includeCount++;
                else if (rawDecision.decision === 'maybe') currentAgentStats.maybeCount++;
                else if (rawDecision.decision === 'exclude') currentAgentStats.excludeCount++;
                currentAgentStats.totalScreened++;
                statsByAgent.set(agentId, currentAgentStats); // Update map
            }

            // --- Update Decisions By Article (Populate with name/email) ---
            const decisionForArticle: Decision = {
                 user_id: rawDecision.user_id, // Keep the ID
                 agent_id: rawDecision.agent_id, // Keep the ID
                 decision: rawDecision.decision,
                 // Look up email if user_id exists
                 user_email: rawDecision.user_id ? (localUserEmailMap.get(rawDecision.user_id) || undefined) : undefined,
                 // Look up agent name if agent_id exists
                 agent_name: rawDecision.agent_id ? (localAgentNameMap.get(rawDecision.agent_id) || undefined) : undefined,
            };
            const existingDecisions = decisionsByArticle.get(articleId) || [];
            decisionsByArticle.set(articleId, [...existingDecisions, decisionForArticle]);
        });

        // Set user stats state
        setUserStats(Array.from(statsByUser.values()));
        setAgentStats(Array.from(statsByAgent.values())); // <-- Set agent stats state
        setUserEmailMap(localUserEmailMap); // <-- Store the populated map in state
        setAgentNameMap(localAgentNameMap); // <<< Store agent names in state
        // --------------------------------

        // --- Step 2: Fetch ONLY Conflicting Articles using RPC ---
        console.log("Fetching conflicting articles via RPC...");
        const { data: conflictsData, error: conflictRpcError } = await supabase
            .rpc('get_conflicting_articles', { p_project_id: selectedProjectId }); // Call the function

        if (conflictRpcError) {
            console.error("Error calling get_conflicting_articles RPC:", conflictRpcError);
            throw conflictRpcError;
        }

        console.log(`RPC returned ${conflictsData?.length || 0} conflicting articles.`);

        // --- Process RPC results ---
        if (conflictsData) {
            // The data should already be in the ReviewArticle format (mostly)
            // We might need to parse the decisions JSON if needed by the component
            const formattedConflicts: ReviewArticle[] = conflictsData.map((conflict: any) => ({
                id: conflict.id,
                pmid: conflict.pmid,
                title: conflict.title,
                abstract: conflict.abstract,
                // Decisions might already be correctly formatted JSON from the function
                // If not, parse here: decisions: JSON.parse(conflict.decisions || '[]'),
                decisions: conflict.decisions || [], // Assuming direct use is ok
                conflict: true, // They are conflicts by definition from the RPC
                resolved_decision: null // RPC only returns unresolved
            }));
            setConflictingArticles(formattedConflicts);
            setConflictCount(formattedConflicts.length);
        } else {
            setConflictingArticles([]);
            setConflictCount(0);
        }
        // --- End of RPC processing ---

        // --- Fetch Finalized Articles via RPC ---
        console.log("Fetching finalized articles via RPC (v5 expected)...");
        const { data: finalizedData, error: finalizedRpcError } = await supabase
            .rpc('get_finalized_articles', { p_project_id: selectedProjectId });

        if (finalizedRpcError) {
            console.error("Error calling get_finalized_articles RPC:", finalizedRpcError);
            setError(prev => prev ? `${prev}; Failed to fetch finalized articles: ${finalizedRpcError.message}` : `Failed to fetch finalized articles: ${finalizedRpcError.message}`);
            setFinalizedArticles([]);
        } else {
             console.log(`RPC returned ${finalizedData?.length || 0} finalized articles.`);
             // Data should now match the updated FinalizedArticle interface
             setFinalizedArticles(finalizedData as FinalizedArticle[] || []);
        }

    } catch (err: any) { // Catch errors from conflict fetch primarily
        console.error("Error fetching review data:", err);
        setError(`Failed to load review data: ${err.message}`);
        // Clear all state on error
        setUserStats([]);
        setAgentStats([]);
        setConflictingArticles([]);
        setConflictCount(0);
        setFinalizedArticles([]);
        setUserEmailMap(new Map()); // <-- Clear map on error
    } finally {
        setIsLoadingReviewData(false);
    }
  }, [selectedProjectId]);

  // Trigger data fetch when selected project changes
  useEffect(() => {
    if (selectedProjectId) {
        fetchReviewData();
    } else {
        // Clear data if project is deselected
        setUserStats([]);
        setAgentStats([]);
        setConflictingArticles([]);
        setConflictCount(0);
        setError(null);
    }
  }, [selectedProjectId, fetchReviewData]);


  // --- Handle Project Selection Change (Clear map state) ---
  const handleProjectSelect = (projectId: string) => {
    console.log("Review Project selected:", projectId);
    setSelectedProjectId(projectId);
    setUserStats([]);
    setAgentStats([]);
    setConflictingArticles([]);
    setFinalizedArticles([]);
    setConflictCount(0);
    setError(null);
    setUserEmailMap(new Map());
    setAgentNameMap(new Map()); // <<< Clear agent map on project change
    setDownloadFinalizedError(null);
  };

  // --- Re-implement handler to OPEN the Modal ---
  const handleResolveConflict = (article: ReviewArticle) => {
      console.log("Opening resolve modal for article:", article.id);
      setSelectedArticleForResolution(article);
      setIsResolveModalOpen(true);
  };

  // --- Re-add handler to CLOSE the Modal ---
  const handleCloseResolveModal = () => {
      setIsResolveModalOpen(false);
      setSelectedArticleForResolution(null);
  };

  // --- Handle Resolution Saved (Optimistic + Refetch Finalized) ---
  const handleResolutionSaved = () => {
      if (!selectedArticleForResolution) return;

      const resolvedArticleId = selectedArticleForResolution.id;
      console.log(`Conflict resolved for ${resolvedArticleId}, updating conflict list optimistically...`);

      // Optimistic update for conflict list
      setConflictingArticles(prevArticles =>
          prevArticles.filter(article => article.id !== resolvedArticleId)
      );
      setConflictCount(prevCount => Math.max(0, prevCount - 1));

      handleCloseResolveModal(); // Close the modal

      // --- Fetch ONLY the finalized articles again to update that list ---
      // Avoids refetching everything
      const fetchJustFinalized = async () => {
           if (!selectedProjectId) return;
           console.log("Refreshing finalized articles list...");
           const { data: finalizedData, error: finalizedRpcError } = await supabase
               .rpc('get_finalized_articles', { p_project_id: selectedProjectId });
           if (finalizedRpcError) {
                console.error("Error refreshing finalized articles:", finalizedRpcError);
           } else {
                setFinalizedArticles(finalizedData as FinalizedArticle[] || []);
           }
      }
      fetchJustFinalized();
      // ---------------------------------------------------------------
  };

  // --- RENAME and UPDATE Download Handler ---
  const handleDownloadFinalized = useCallback(async () => {
    if (!selectedProjectId || isDownloadingFinalized) return;

    setIsDownloadingFinalized(true);
    setDownloadFinalizedError(null);
    console.log("Downloading finalized articles...");

    try {
        // Fetch fresh finalized data using the NEW RPC
        const { data: finalizedData, error: rpcError } = await supabase
            .rpc('get_finalized_articles', { p_project_id: selectedProjectId });

        if (rpcError) throw new Error(`Failed to fetch finalized articles: ${rpcError.message}`);
        if (!finalizedData || finalizedData.length === 0) {
            setDownloadFinalizedError("No finalized articles found to download.");
            setIsDownloadingFinalized(false); return;
        }

        // Format data for TXT/TSV file
        let fileContent = "PMID\tTitle\tAbstract\tFinalDecision\tResolverID\tFinalizedAt\tOriginalDecisions\n"; // Header
        finalizedData.forEach((article: FinalizedArticle) => {
            const pmid = article.pmid?.replace(/[\n\t]/g, ' ') || 'N/A';
            const title = article.title?.replace(/[\n\t]/g, ' ') || 'N/A';
            const abstract = article.abstract?.replace(/[\n\t]/g, ' ') || 'N/A';
            const decision = article.final_decision?.toUpperCase() || 'N/A';
            const resolver = article.resolver_id || 'N/A'; // Was unanimous or resolved by unknown
            const finalizedTime = article.finalized_at ? new Date(article.finalized_at).toISOString() : 'N/A';

            // Format original decisions into a simple string for the TSV
            let originalDecisionsStr = "N/A";
            if (article.original_decisions && article.original_decisions.length > 0) {
                 originalDecisionsStr = article.original_decisions.map((dec: Decision) => {
                     let name = dec.agent_id ? (dec.agent_name || `Agent:${dec.agent_id.substring(0,6)}`) : (dec.user_id ? (userEmailMap.get(dec.user_id) || `User:${dec.user_id.substring(0,6)}`) : 'Unknown');
                     return `${name}:${dec.decision.toUpperCase()}`;
                 }).join('; '); // Join with semicolon
            }
            originalDecisionsStr = originalDecisionsStr.replace(/[\n\t]/g, ' '); // Sanitize

            fileContent += `${pmid}\t${title}\t${abstract}\t${decision}\t${resolver}\t${finalizedTime}\t${originalDecisionsStr}\n`;
        });

        // Trigger browser download
        const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const currentProject = projects.find(p => p.id === selectedProjectId);
        const projectName = currentProject?.name || selectedProjectId.substring(0,8);
        link.download = `project_${projectName}_finalized_articles.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        console.log("Finalized articles download initiated as .txt");

    } catch (err: any) {
        console.error("Error downloading finalized articles:", err);
        setDownloadFinalizedError(err.message || "An unknown error occurred during download.");
    } finally {
        setIsDownloadingFinalized(false);
    }
  }, [selectedProjectId, projects, isDownloadingFinalized, userEmailMap]);

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

                {/* === NEW: Agent Stats Section === */}
                <section className="mb-8 border-t pt-6">
                   <h2 className="text-xl font-semibold mb-4">AI Agent Decision Summary: {selectedProjectName}</h2>
                   {agentStats.length > 0 ? (
                     <div className="space-y-4">
                       {agentStats.map(stats => (
                         <Card key={stats.agentId}>
                            <CardHeader className="pb-2">
                               <CardTitle className="text-lg">{stats.agentName}</CardTitle>
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
                     <p className="text-center text-muted-foreground">No screening decisions found for AI agents in this project yet.</p>
                   )}
                </section>

                {/* === Conflicts Section === */}
                <section className="mt-8 border-t pt-6">
                   <h2 className="text-xl font-semibold mb-4">Conflicts: {selectedProjectName}</h2>
                   <p className="mb-4 text-lg">
                       Total Conflicts Found: <span className="font-semibold">{conflictCount}</span>
                   </p>

                   {conflictingArticles.length > 0 ? (
                     <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                       {conflictingArticles.map(article => (
                         <Card key={article.id} className="border-l-4 border-red-500">
                            <CardHeader className="pb-2">
                               <CardTitle className="text-lg">{article.title}</CardTitle>
                               <CardDescription>PMID: {article.pmid}</CardDescription>
                            </CardHeader>
                            <CardContent>
                               <h4 className="text-sm font-semibold mb-2">Decisions:</h4>
                               <ul className="list-disc pl-5 space-y-1 text-sm">
                                 {article.decisions.map((decision, index) => {
                                     // Determine the display name
                                     let displayName = 'Unknown Source'; // Default fallback
                                     if (decision.agent_id) {
                                         // Prioritize Agent Name
                                         displayName = decision.agent_name || `Agent (${decision.agent_id.substring(0,6)}...)`; // Clearer fallback
                                     } else if (decision.user_id) {
                                         // Otherwise use User Email
                                         displayName = decision.user_email || `User (${decision.user_id.substring(0,6)}...)`; // Clearer fallback
                                     }

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
                               {/* --- Update Button onClick --- */}
                               <div className="mt-4 text-right">
                                   <Button variant="outline" size="sm" onClick={() => handleResolveConflict(article)}>
                                        Resolve Conflict...
                                   </Button>
                               </div>
                            </CardContent>
                         </Card>
                       ))}
                     </div>
                   ) : (
                     <p className="text-center text-muted-foreground mt-4">
                       No unresolved articles with conflicting decisions found.
                     </p>
                   )}
                </section>

                {/* === NEW: Finalized Articles Section (Added Download Button) === */}
                <section className="mt-8 border-t pt-6">
                   <div className="flex justify-between items-center mb-4"> {/* Wrapper for title and button */}
                       <h2 className="text-xl font-semibold">Finalized Articles: {selectedProjectName}</h2>
                       {/* --- Download Button --- */}
                       <Button
                           variant="outline"
                           size="sm"
                           onClick={handleDownloadFinalized}
                           disabled={isDownloadingFinalized || !selectedProjectId || finalizedArticles.length === 0}
                       >
                          {isDownloadingFinalized ? (
                             <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                             <Download className="mr-2 h-4 w-4" />
                          )}
                          Download Finalized Data (.txt)
                       </Button>
                       {/* ----------------------- */}
                   </div>
                    {/* Display download error */}
                    {downloadFinalizedError && (
                        <Alert variant="destructive" className="mb-4">
                           <AlertTitle>Download Error</AlertTitle>
                           <AlertDescription>{downloadFinalizedError}</AlertDescription>
                        </Alert>
                    )}

                   {finalizedArticles.length > 0 ? (
                     <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                       {finalizedArticles.map(article => {
                           // Determine final decision color
                           let decisionColor = 'text-gray-700';
                           if (article.final_decision === 'include') decisionColor = 'text-green-700';
                           else if (article.final_decision === 'exclude') decisionColor = 'text-red-700';
                           else if (article.final_decision === 'maybe') decisionColor = 'text-yellow-700';

                           // --- Determine Resolver/Finalizer Display Name ---
                           let finalizerDisplay = 'Unanimous / System'; // Default
                           if (article.resolver_id) {
                               // Resolved by a user
                               finalizerDisplay = userEmailMap.get(article.resolver_id) || `User (${article.resolver_id.substring(0, 8)}...)`;
                           } else if (article.finalizing_agent_id) {
                               // Unanimous decision by an agent
                               finalizerDisplay = agentNameMap.get(article.finalizing_agent_id) || `Agent (${article.finalizing_agent_id.substring(0, 8)}...)`;
                           }
                           // Potential TODO: Handle unanimous user decisions if needed
                           // -------------------------------------------------

                           return (
                             <Card key={article.id} className="border-l-4 border-green-500">
                                <CardHeader className="pb-2">
                                   <div className="flex justify-between items-start gap-4"> {/* Added gap */}
                                        {/* Left Side: Title/PMID/Reason */}
                                        <div className="flex-grow">
                                            <CardTitle className="text-lg">{article.title}</CardTitle>
                                            <CardDescription>PMID: {article.pmid}</CardDescription>
                                             {/* --- Display Exclusion Reason --- */}
                                             {article.final_decision === 'exclude' && article.final_exclusion_reason && !article.resolver_id && (
                                                 <p className="text-xs text-red-600 mt-1 italic">
                                                     Reason: {article.final_exclusion_reason.replace(/_/g, ' ')}
                                                 </p>
                                             )}
                                             {/* ---------------------------- */}
                                        </div>
                                        {/* Right Side: Decision/Finalizer/Time */}
                                        <div className="text-right flex-shrink-0">
                                             <p className={`text-lg font-bold ${decisionColor}`}>
                                                Final: {article.final_decision.charAt(0).toUpperCase() + article.final_decision.slice(1)}
                                             </p>
                                             <p className="text-xs text-muted-foreground mt-1">
                                                 By: {finalizerDisplay}
                                             </p>
                                             <p className="text-xs text-muted-foreground">
                                                 On: {new Date(article.finalized_at).toLocaleString()}
                                             </p>
                                        </div>
                                   </div>
                                </CardHeader>
                                {/* Optional: Expand to show original decisions */}
                                {/* <CardContent> ... </CardContent> */}
                             </Card>
                           );
                       })}
                     </div>
                   ) : (
                     <p className="text-center text-muted-foreground mt-4">
                       No articles have reached a final decision (resolved or unanimous) yet.
                     </p>
                   )}
                </section>
                {/* === End Finalized Articles Section === */}
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

      {/* --- Re-add Modal Rendering --- */}
      <ResolveConflictModal
           isOpen={isResolveModalOpen}
           onClose={handleCloseResolveModal}
           article={selectedArticleForResolution}
           user={user} // Pass the logged-in user
           onResolved={handleResolutionSaved}
      />
    </div>
  );
} 