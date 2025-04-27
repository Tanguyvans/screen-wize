'use client'; // Make this a Client Component

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Use client-side Supabase
import LogoutButton from './LogoutButton';
import { User } from '@supabase/supabase-js'; // Removed PostgrestError for now
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Shadcn Select
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Shadcn Card
import { CreateProjectDialog } from '@/components/CreateProjectDialog'; // Import Create dialog
import { InviteUserDialog } from '@/components/InviteUserDialog';   // Import Invite dialog
import { Button } from '@/components/ui/button'; // Import Button
import { ArticleDropzone } from '@/components/ArticleDropzone'; // <-- Import Dropzone
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For messages
import { Loader2 } from "lucide-react"; // Import Loader2
import Link from 'next/link'; // <-- Import Link for navigation
import { Progress } from "@/components/ui/progress"; // <-- Import Progress component
import { Separator } from "@/components/ui/separator"; // <-- Import Separator

// Define the screening decision type mirroring the enum
type ScreeningDecision = 'include' | 'exclude' | 'maybe' | 'unscreened';

interface Project {
  id: string;
  name: string;
}

// Keep ArticleDetail simple for parsed articles
interface ArticleDetail {
  pmid: string;
  title: string;
  abstract: string;
  id?: string; // Keep optional ID from parsing if needed elsewhere
}

// Type for data structure when saving articles
interface ArticleSaveData {
    project_id: string;
    pmid: string;
    title: string;
    abstract: string;
}

// Type for the screening stats we will fetch
interface ScreeningStats {
    totalArticles: number;
    userScreenedCount: number;
    includeCount: number;
    excludeCount: number;
    maybeCount: number;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // Page loading state
  const [error, setError] = useState<string | null>(null); // Page/fetch error state

  // State for file parsing and saving articles
  const [isProcessing, setIsProcessing] = useState(false); // Combined state for parsing/saving
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // State to hold the parsed articles before saving
  const [parsedArticles, setParsedArticles] = useState<ArticleDetail[]>([]);

  // --- State for Screening Statistics ---
  const [screeningStats, setScreeningStats] = useState<ScreeningStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false); // State for loading stats

  // --- Fetch User Projects ---
  const fetchProjects = useCallback(async (selectFirst = false) => {
    setLoading(true);
    setError(null);
    console.log("Fetching projects..."); // Debug log

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      console.error("Error fetching session or no user:", sessionError);
      setError("Could not fetch user session.");
      setUser(null); setProjects([]); setSelectedProjectId(null); setLoading(false);
      return;
    }

    const currentUser = session.user;
    setUser(currentUser);

    const { data: projectData, error: projectsError } = await supabase
      .from('project_members')
      .select('projects!inner( id, name )') // Use inner join to ensure project exists
      .eq('user_id', currentUser.id);

    if (projectsError) {
      console.error("Error fetching projects:", projectsError);
      setError(`Failed to load projects: ${projectsError.message}. Check RLS policies.`);
      setProjects([]); setSelectedProjectId(null);
    } else {
      // Let Supabase infer the type initially, then process safely
      let userProjects: Project[] = []; // Initialize as empty Project array

      // Check if projectData exists and is an array
      if (projectData && Array.isArray(projectData)) {
          userProjects = projectData
              .map(pm => {
                  // Access the nested 'projects' property safely
                  // Handle cases where 'projects' might be null, not an array, or an empty array
                  const project = pm?.projects;
                  // Check if 'project' is an object and has the required properties
                  if (project && typeof project === 'object' && 'id' in project && 'name' in project) {
                      // Cast to Project if structure matches
                      return project as Project;
                  }
                  return null; // Return null if structure doesn't match
              })
              // Filter out the nulls
              .filter((p): p is Project => p !== null);
      } else {
        // Handle case where projectData is null or not an array
        console.warn("projectData from Supabase is not in the expected format or is null:", projectData);
      }

      console.log("Fetched projects:", userProjects); // Debug log
      setProjects(userProjects);
      const currentSelectionValid = userProjects.some(p => p.id === selectedProjectId);

      if (selectFirst && userProjects.length > 0 && !selectedProjectId) {
         console.log("Selecting first project:", userProjects[0].id);
        setSelectedProjectId(userProjects[0].id);
      } else if (!currentSelectionValid) {
         const newSelection = userProjects.length > 0 ? userProjects[0].id : null;
         console.log("Current selection invalid, setting to:", newSelection);
         setSelectedProjectId(newSelection);
      }
    }
    setLoading(false);
  }, [selectedProjectId]);

  // --- Fetch Screening Statistics ---
  const fetchScreeningStats = useCallback(async (projectId: string | null, currentUserId: string | null) => {
    if (!projectId || !currentUserId) {
      setScreeningStats(null); return;
    }
    console.log(`Fetching screening stats for project ${projectId}, user ${currentUserId}...`);
    setLoadingStats(true); setError(null);

    try {
        // 1. Get total article count for the project (remains the same)
        const { count: totalCount, error: totalError } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId);

        if (totalError) throw new Error(`Failed to get total article count: ${totalError.message}`);

        // 2. Get ALL screening decisions made by the user for this project
        const { data: userDecisions, error: decisionError } = await supabase
            .from('screening_decisions')
            .select('decision') // Select only the decision column
            .eq('project_id', projectId)
            .eq('user_id', currentUserId)
            .in('decision', ['include', 'exclude', 'maybe']); // Only fetch actual decisions

        if (decisionError) throw new Error(`Failed to get user decisions: ${decisionError.message}`);

        // 3. Count the decisions client-side
        let includeCount = 0;
        let excludeCount = 0;
        let maybeCount = 0;

        userDecisions?.forEach(item => {
            if (item.decision === 'include') includeCount++;
            else if (item.decision === 'exclude') excludeCount++;
            else if (item.decision === 'maybe') maybeCount++;
        });

        const userScreenedCount = includeCount + excludeCount + maybeCount;

        // 4. Set the state with the calculated stats
        setScreeningStats({
            totalArticles: totalCount ?? 0,
            userScreenedCount: userScreenedCount,
            includeCount: includeCount,
            excludeCount: excludeCount,
            maybeCount: maybeCount,
        });
        console.log("Screening stats calculated:", { totalArticles: totalCount, userScreenedCount, includeCount, excludeCount, maybeCount });

    } catch (err: any) {
        console.error("Error fetching screening stats:", err);
        setError(`Failed to load screening stats: ${err.message}`);
        setScreeningStats(null);
    } finally {
        setLoadingStats(false);
    }
  }, []); // Dependency array remains empty

  // --- Initial Data Fetch & Auth Listener ---
  useEffect(() => {
    fetchProjects(true); // Fetch projects on initial mount

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("Auth event:", event); // Debug log
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (event === 'SIGNED_OUT') {
           setError(null); setProjects([]); setSelectedProjectId(null); setParsedArticles([]); setScreeningStats(null); // Clear everything on sign out
        } else if (event === 'SIGNED_IN') {
           fetchProjects(true); // Refetch projects on sign in
        }
      }
    );
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [fetchProjects]); // Depend on fetchProjects callback

  // --- Fetch Screening Stats when Project or User Changes ---
  useEffect(() => {
      if (selectedProjectId && user?.id) {
          fetchScreeningStats(selectedProjectId, user.id ?? null);
      } else {
          setScreeningStats(null); // Clear stats if project/user changes to null
      }
  }, [selectedProjectId, user, fetchScreeningStats]); // Depend on stats fetch function

  // --- Handle Project Selection Change ---
  const handleProjectSelect = (projectId: string) => {
    console.log("Project selected:", projectId);
    setSelectedProjectId(projectId);
    // Clear file processing state and parsed articles
    setProcessingMessage(null); setProcessingError(null); setIsProcessing(false); setParsedArticles([]);
    // Stats will be cleared/refetched by the useEffect hook above
  };

  // --- Refresh Projects List After Creation ---
  const refreshProjects = () => {
      console.log("Refreshing projects list..."); // Debug log
      fetchProjects(false); // Refetch projects, don't force selection change
  };

  // --- Handle File Content Parsing ---
  const handleFileContent = useCallback((content: string, projectId: string | null) => {
      if (!projectId) { /* ... handle error ... */ return; }
      setIsProcessing(true);
      setProcessingMessage("Parsing file content...");
      setProcessingError(null);
      setParsedArticles([]); // Clear previous results

      try {
          // ... (Parsing logic remains the same as previous version) ...
          const articlesFromFile: ArticleDetail[] = [];
          const records = content.split(/^\s*PMID-/gm).filter(record => record.trim().length > 0);

          if (records.length === 0) { throw new Error("Could not find any article records starting with PMID- in the file."); }
          setProcessingMessage(`Found ${records.length} potential article records. Parsing...`);

          records.forEach((recordText, index) => {
              const fullRecordText = "PMID-" + recordText;
              const lines = fullRecordText.split('\n');
              let currentPmid = '', currentTitle = '', currentAbstract = '', isParsingTitle = false, isParsingAbstract = false;

              lines.forEach(line => {
                  if (line.startsWith('PMID-')) { currentPmid = line.substring(6).trim(); isParsingTitle = false; isParsingAbstract = false; }
                  else if (line.startsWith('TI  -')) { currentTitle = line.substring(6).trim(); isParsingTitle = true; isParsingAbstract = false; }
                  else if (line.startsWith('AB  -')) { currentAbstract = line.substring(6).trim(); isParsingAbstract = true; isParsingTitle = false; }
                  else if (isParsingTitle && line.startsWith('      ')) { currentTitle += ' ' + line.trim(); }
                  else if (isParsingAbstract && line.startsWith('      ')) { currentAbstract += ' ' + line.trim(); }
                  else if (line.trim().length > 0 && !line.startsWith('      ')) { isParsingTitle = false; isParsingAbstract = false; }
              });

              if (currentPmid) {
                  articlesFromFile.push({ pmid: currentPmid, title: currentTitle || 'Title Not Found', abstract: currentAbstract || 'Abstract Not Found' });
              } else { console.warn(`Record ${index + 1} skipped, could not find PMID.`); }
          });

          if (articlesFromFile.length === 0) { throw new Error("Parsing complete, but no articles with PMIDs were extracted."); }

          setParsedArticles(articlesFromFile);
          setProcessingMessage(`Successfully parsed ${articlesFromFile.length} articles from the file. Click 'Save Articles' to add them to the project.`);

      } catch (err: any) {
          console.error("Error processing file:", err);
          setProcessingError(err.message || "An unknown error occurred during file parsing.");
          setProcessingMessage(null);
      } finally {
          setIsProcessing(false);
      }
  }, []); // End of handleFileContent


  // --- Save Parsed Articles to Supabase ---
  const handleSaveArticles = useCallback(async () => {
      if (!selectedProjectId || parsedArticles.length === 0) {
          alert("No project selected or no articles parsed to save.");
          return;
      }

      console.log(`Attempting to save ${parsedArticles.length} parsed articles to project ${selectedProjectId}...`);
      setIsProcessing(true);
      setProcessingMessage("Saving articles to database...");
      setProcessingError(null);

      // Prepare data for Supabase insert/upsert
      const articlesToSave: ArticleSaveData[] = parsedArticles.map(article => ({
          project_id: selectedProjectId,
          pmid: article.pmid,
          title: article.title,
          abstract: article.abstract,
      }));

      // ... (Batching and Upsert logic remains the same as previous version) ...
      const BATCH_SIZE = 500;
      let savedCount = 0; let errorCount = 0;

      try {
          for (let i = 0; i < articlesToSave.length; i += BATCH_SIZE) {
              const batch = articlesToSave.slice(i, i + BATCH_SIZE);
              setProcessingMessage(`Saving batch ${Math.floor(i / BATCH_SIZE) + 1}... (${i + batch.length}/${articlesToSave.length})`); // Update message

              const { error: saveError } = await supabase
                  .from('articles')
                  .upsert(batch, { onConflict: 'project_id, pmid', ignoreDuplicates: true });

              if (saveError) {
                  console.error(`Error saving batch starting at index ${i}:`, saveError);
                  errorCount += batch.length;
                  setProcessingError(`Error saving articles: ${saveError.message}. Some may not have been saved.`);
                  // break; // Optional: stop on first error
              } else {
                  savedCount += batch.length;
              }
          }

          if (errorCount === 0) {
             setProcessingMessage(`Successfully saved/updated ${savedCount} articles to the project.`);
             setParsedArticles([]); // Clear the parsed list after successful save
             await fetchScreeningStats(selectedProjectId, user?.id ?? null);
          } else {
              setProcessingMessage(`Finished saving. Processed ${savedCount} articles, but encountered errors for ${errorCount}. Some may need re-importing.`);
              await fetchScreeningStats(selectedProjectId, user?.id ?? null);
          }
           // TODO: Trigger a refresh of the *displayed* article list from DB if showing DB articles

      } catch (err: any) {
          console.error("Error saving articles:", err);
          setProcessingError(err.message || "An unknown error occurred while saving.");
          setProcessingMessage(null);
      } finally {
          setIsProcessing(false);
      }
  }, [parsedArticles, selectedProjectId, fetchScreeningStats, user?.id]); // Keep user?.id in dependencies

  // --- Render Logic ---
  if (loading) { return <div className="container mx-auto px-4 py-8 text-center">Loading dashboard...</div>; }
  if (!user) { return <div className="container mx-auto px-4 py-8 text-center">Redirecting to login...</div>; }

  const selectedProject = projects.find(p => p.id === selectedProjectId);
  // Calculate progress percentage
  const progressPercent = screeningStats && screeningStats.totalArticles > 0
    ? Math.round((screeningStats.userScreenedCount / screeningStats.totalArticles) * 100)
    : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* --- Header --- */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <CreateProjectDialog user={user} onProjectCreated={refreshProjects} />
          <LogoutButton />
        </div>
      </div>
      <p className="mb-4">Welcome, {user.email}!</p>

      {/* --- Project Selection --- */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Select Project</CardTitle>
            {selectedProjectId && user && ( <InviteUserDialog user={user} projectId={selectedProjectId} projectName={selectedProject?.name} /> )}
        </CardHeader>
        <CardContent>
             {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
            {projects.length > 0 ? (
              <Select value={selectedProjectId ?? ''} onValueChange={handleProjectSelect}>
                <SelectTrigger className="w-full md:w-[280px]"><SelectValue placeholder="Select a project..." /></SelectTrigger>
                <SelectContent>{projects.map((project) => ( <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem> ))}
                </SelectContent>
              </Select>
            ) : ( <p className="text-muted-foreground pt-2">You have no projects yet. Click "Create New Project" to start.</p> )}
        </CardContent>
      </Card>

      {/* --- Conditional Content Area --- */}
      <div className="mt-6 p-6 border border-gray-300 rounded-lg min-h-[300px]">
         {selectedProjectId ? (
           <div>
              <h2 className="text-xl font-semibold mb-4 text-center">
                 Project: {selectedProject?.name ?? 'Loading...'}
              </h2>

              {/* --- File Import Section --- */}
              <Card className="mb-6 bg-secondary/30">
                  <CardHeader><CardTitle className="text-lg">Import Articles (.txt)</CardTitle></CardHeader>
                  <CardContent>
                      <ArticleDropzone
                          projectId={selectedProjectId}
                          onFileRead={(content) => handleFileContent(content, selectedProjectId)}
                          className={isProcessing ? 'opacity-75 cursor-default' : ''}
                          />
                      {/* Display Processing Messages */}
                      {isProcessing && !processingMessage && !processingError && ( // Initial processing message
                          <Alert variant="default" className="mt-4"><AlertDescription>Processing file...</AlertDescription></Alert>
                      )}
                      {processingMessage && !processingError && (
                           <Alert variant={processingMessage.includes("Successfully") ? "default" : "default"} className="mt-4">
                               <AlertDescription>{processingMessage}</AlertDescription>
                           </Alert>
                      )}
                      {processingError && (
                           <Alert variant="destructive" className="mt-4">
                               <AlertTitle>Error</AlertTitle>
                               <AlertDescription>{processingError}</AlertDescription>
                           </Alert>
                      )}
                  </CardContent>
              </Card>

              {/* --- Parsed/Saved Articles Area --- */}
              <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Parsed Articles Preview ({parsedArticles.length})</h3>
                  {/* Save Button */}
                  {parsedArticles.length > 0 && !isProcessing && (
                       <Button onClick={handleSaveArticles} size="sm">
                           Save Articles to Project
                       </Button>
                   )}
                     {isProcessing && processingMessage?.startsWith("Saving") && (
                        <Button size="sm" disabled>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                         </Button>
                    )}
              </div>

              <div className="mt-4 space-y-3 max-h-[250px] overflow-y-auto pr-2 border rounded p-2 mb-6">
                  {parsedArticles.length > 0 ? (
                      parsedArticles.map((article, index) => (
                          <Card key={`${article.pmid}-${index}`} className="overflow-hidden">
                              <CardHeader className="p-3 bg-muted/50"><CardTitle className="text-base">{article.title}</CardTitle><p className="text-xs text-muted-foreground">PMID: {article.pmid}</p></CardHeader>
                              <CardContent className="p-3 text-sm"><p className="line-clamp-3">{article.abstract}</p></CardContent>
                          </Card>
                      ))
                  ) : (
                      <div className="p-4 border border-dashed border-gray-300 rounded-lg min-h-[100px] flex items-center justify-center">
                          <p className="text-center text-muted-foreground">
                              (Drop a file with PMIDs, Titles, Abstracts to see results here)
                          </p>
                      </div>
                  )}
              </div>

              {/* --- Screening Stats & Actions --- */}
                 <div className="mt-8 border-t pt-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">
                            Your Screening Progress
                        </h3>
                        {/* Show Start Screening button only if there are articles */}
                        {screeningStats && screeningStats.totalArticles > 0 && (
                            <Link href={`/screening/${selectedProjectId}`} passHref>
                                <Button size="sm">
                                    {screeningStats.userScreenedCount > 0 ? "Continue Screening" : "Start Screening"}
                                </Button>
                            </Link>
                        )}
                    </div>

                    {loadingStats ? (
                         <div className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : screeningStats ? (
                        <div>
                            {screeningStats.totalArticles > 0 ? (
                                <>
                                    <div className="mb-2 flex justify-between text-sm text-muted-foreground">
                                        <span>
                                            {screeningStats.userScreenedCount} / {screeningStats.totalArticles} articles screened
                                        </span>
                                        <span>{progressPercent}%</span>
                                    </div>
                                    <Progress value={progressPercent} className="w-full mb-4" />
                                    <Separator className="my-4" />
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Included</p>
                                            <p className="text-xl font-bold">{screeningStats.includeCount}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Maybe</p>
                                            <p className="text-xl font-bold">{screeningStats.maybeCount}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Excluded</p>
                                            <p className="text-xl font-bold">{screeningStats.excludeCount}</p>
                                        </div>
                                    </div>
                                </>
                             ) : (
                                 <p className="text-center text-muted-foreground py-4">
                                    No articles have been imported into this project yet.
                                 </p>
                             )}
                        </div>
                     ) : error ? ( // Display fetch error if stats couldn't load
                         <Alert variant="destructive">
                           <AlertDescription>{error}</AlertDescription>
                         </Alert>
                     ) : (
                         <p className="text-center text-muted-foreground py-4">
                            No screening data available.
                         </p>
                     )}
                 </div>
           </div>
         ) : (
            <div className="flex items-center justify-center h-full">
                 {/* Message when no project selected */}
                 <p className="text-center text-muted-foreground">
                   {projects.length > 0 ? "Please select a project above." : "Create or join a project."}
                 </p>
             </div>
         )}
      </div>
    </div>
  );
}
