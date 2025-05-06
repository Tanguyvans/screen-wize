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
import { DecisionDropzone } from '@/components/DecisionDropzone'; // <-- Import DecisionDropzone
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // For messages
import { Loader2, Download, UploadCloud } from "lucide-react"; // Added Download
import Link from 'next/link'; // <-- Import Link for navigation
import { Progress } from "@/components/ui/progress"; // <-- Import Progress component
import { Separator } from "@/components/ui/separator"; // <-- Import Separator
import { Badge } from "@/components/ui/badge"; // For invitation status later if needed
import { ReloadIcon } from "@radix-ui/react-icons"; // For loading spinners on buttons
import { CreateAgentDialog } from '@/components/CreateAgentDialog'; // <-- Import Agent Dialog
import { Label } from "@/components/ui/label"; // <-- Import Label for dropdown

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

// Interface for a pending invitation
interface PendingInvitation {
  id: string; // Invitation ID
  project_id: string;
  project_name: string; // We'll fetch this
  // inviter_email: string; // Keep commented out or remove
  created_at: string;
}

// Type for handling accept/decline actions
type InvitationActionStatus = {
  [invitationId: string]: 'loading' | 'error' | null;
};

// Type for saving screening decisions (ensure it exists)
interface ScreeningDecisionSaveData {
    article_id: string;
    user_id?: string | null; // <-- Make optional/nullable
    agent_id?: string | null; // <-- Add optional/nullable agent_id
    project_id: string;
    decision: 'include' | 'exclude' | 'maybe';
}

// Interface for fetched AI Agent data
interface AiAgent {
    id: string;
    name: string;
    project_id: string;
    // Add other fields if needed
}

// NEW: Interface for AI Agent specific screening stats
interface AgentScreeningStats extends ScreeningStats {
    agentId: string;
    agentName: string;
}

// Ensure exclusionReasons are defined or imported
const exclusionReasons = [
    "off topic", "review/survey", "wrong imaging modality",
    "wrong application focus", "animal/pre-clinical", "abstract/editorial/letter",
    "insufficient technical detail", "technique mismatch", "other"
];

// Helper to map YES/NO/MAYBE and potential reasons (v3 - More Robust Parsing)
const mapDecisionAndReason = (decisionInput: string): { decision: ScreeningDecision | null; reason: string | null } => {
    const trimmedInput = decisionInput.trim();
    const upperInput = trimmedInput.toUpperCase(); // Work with uppercase for comparisons

    console.log(`mapDecisionAndReason received input: "${trimmedInput}" (Upper: "${upperInput}")`);

    // --- Check for "NO:" first, as it includes a reason ---
    const noReasonIndex = upperInput.indexOf("NO:");
    if (noReasonIndex !== -1) {
        // Extract reason text after "NO:"
        // Use original case string (trimmedInput) for substring to preserve reason case if needed,
        // but generally lowercase is safer for matching.
        let reason = trimmedInput.substring(noReasonIndex + 3).trim().toLowerCase();
        console.log(`  -> Detected "NO:", extracted raw reason: "${reason}"`);

        // Normalize if not a standard reason
        if (!exclusionReasons.includes(reason)) {
            console.warn(`  -> Unknown exclusion reason "${reason}". Normalizing to "other".`);
            reason = "other";
        } else {
             console.log(`  -> Reason "${reason}" is valid.`);
        }
        return { decision: 'exclude', reason: reason };
    }

    // --- Check for core decision words (YES/INCLUDE, NO, MAYBE) ---
    // Look for the words anywhere in the uppercase string
    if (upperInput.includes("YES") || upperInput.includes("INCLUDE")) {
        console.log(`  -> Detected "YES" or "INCLUDE" within "${trimmedInput}"`);
        return { decision: 'include', reason: null };
    } else if (upperInput.includes("NO")) { // Check plain "NO" after "NO:"
        console.log(`  -> Detected "NO" within "${trimmedInput}"`);
        return { decision: 'exclude', reason: null };
    } else if (upperInput.includes("MAYBE")) {
        console.log(`  -> Detected "MAYBE" within "${trimmedInput}"`);
        return { decision: 'maybe', reason: null };
    } else {
        // If none of the above patterns match
        console.error(`  -> Unknown decision format after checks: "${trimmedInput}"`);
        return { decision: null, reason: null }; // Invalid format
    }
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // Page loading state
  const [error, setError] = useState<string | null>(null); // Page/fetch error state

  // --- Calculate selectedProject EARLY ---
  // Find the project object based on the selected ID. Do this before hooks that might use it.
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // State for file parsing and saving articles
  const [isProcessingTxt, setIsProcessingTxt] = useState(false);
  const [processingTxtMessage, setProcessingTxtMessage] = useState<string | null>(null);
  const [processingTxtError, setProcessingTxtError] = useState<string | null>(null);
  const [parsedTxtArticles, setParsedTxtArticles] = useState<ArticleDetail[]>([]);

  // State for Screening Statistics
  const [screeningStats, setScreeningStats] = useState<ScreeningStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // State for Pending Invitations
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationActionStatus, setInvitationActionStatus] = useState<InvitationActionStatus>({});

  // --- NEW State for AI Download/Upload ---
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false); // Saving AI decisions
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // --- NEW State for AI Agents ---
  const [projectAgents, setProjectAgents] = useState<AiAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // --- NEW State for Agent Statistics ---
  const [agentStats, setAgentStats] = useState<AgentScreeningStats[]>([]);
  const [loadingAgentStats, setLoadingAgentStats] = useState(false);
  const [agentStatsError, setAgentStatsError] = useState<string | null>(null);

  // --- Add state for saving indicator if not present ---
  const [isSaving, setIsSaving] = useState(false); // Or rename if you already have one like isUploadingDecisions
  const [uploadDecisionProgress, setUploadDecisionProgress] = useState(0);
  const [uploadDecisionError, setUploadDecisionError] = useState<string | null>(null);
  const [isUploadingDecisions, setIsUploadingDecisions] = useState(false); // Assuming this exists

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

  // --- Fetch Pending Invitations ---
  const fetchPendingInvitations = useCallback(async (currentUserId: string | null, currentUserEmail: string | null) => {
    if (!currentUserId || !currentUserEmail) {
      setPendingInvitations([]);
      return;
    }
    console.log(`Fetching pending invitations for user ${currentUserEmail}...`);
    setLoadingInvitations(true);
    setInvitationError(null);

    // Define an interface for the raw Supabase response structure
    interface InvitationWithProject {
        id: string;
        project_id: string;
        created_at: string;
        projects: { name: string } | { name: string }[] | null; // Explicitly allow object, array, or null
    }

    try {
      // Explicitly type the response data from Supabase
      const { data, error } = await supabase
        .from('project_invitations')
        .select(`
          id,
          project_id,
          created_at,
          projects ( name )
        `)
        .eq('invited_user_email', currentUserEmail)
        .eq('status', 'pending')
        .returns<InvitationWithProject[]>(); // <-- Tell TS the expected return type

      if (error) throw error;

      // Format the data
      const formattedInvitations: PendingInvitation[] = data
        ?.map(inv => {
          let projectName: string | null = null;

          // Check if inv.projects exists and get the name
          if (inv.projects) {
              if (Array.isArray(inv.projects) && inv.projects.length > 0) {
                  // It's an array, take name from first element
                  projectName = inv.projects[0]?.name ?? null;
              } else if (!Array.isArray(inv.projects)) {
                  // It's a single object (handle this case just in case)
                  projectName = inv.projects.name ?? null;
              }
          }

          if (!projectName) {
            console.warn(`Invitation ${inv.id} skipped, project name missing or malformed. projects data:`, inv.projects); // Log the projects data
            return null;
          }
          return {
            id: inv.id,
            project_id: inv.project_id,
            project_name: projectName, // Use the extracted name
            created_at: inv.created_at,
          };
        })
        .filter((inv): inv is PendingInvitation => inv !== null);

      console.log("Fetched pending invitations:", formattedInvitations);
      setPendingInvitations(formattedInvitations);

    } catch (err: any) {
      // Enhanced logging:
      console.error("Detailed error fetching pending invitations:", JSON.stringify(err, null, 2));
      // Log specific properties if they exist
      if (err.message) console.error("Error message:", err.message);
      if (err.details) console.error("Error details:", err.details);
      if (err.code) console.error("Error code:", err.code);

      setInvitationError(`Failed to load invitations: ${err.message || 'Unknown error'}`); // Use message if available
      setPendingInvitations([]);
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  // --- Handle Invitation Actions ---
  const handleInvitationAction = useCallback(async (action: 'accept' | 'decline', invitation: PendingInvitation) => {
      if (!user?.id) {
          setInvitationError("User not logged in.");
          return;
      }

      setInvitationActionStatus(prev => ({ ...prev, [invitation.id]: 'loading' }));
      setInvitationError(null);

      try {
          if (action === 'accept') {
              console.log(`Accepting invitation ${invitation.id} for project ${invitation.project_id}...`);

              // 1. Add user to project_members
              const { error: memberError } = await supabase
                  .from('project_members')
                  .insert({ user_id: user.id, project_id: invitation.project_id });

              // Check for specific duplicate key error on project_members insert
              if (memberError) {
                  // Check if the error message indicates a duplicate key violation for project_members
                  const isDuplicateMemberError = memberError.message.includes('duplicate key value violates unique constraint') &&
                                                 memberError.message.includes('project_members'); // Check it relates to the right table/constraint

                  if (isDuplicateMemberError) {
                      // User is already a member, log a warning but don't throw.
                      console.warn(`User ${user.id} is already a member of project ${invitation.project_id}. Proceeding to update invitation status.`);
                  } else {
                      // It's a different insertion error, re-throw it.
                      throw new Error(`Failed to add to project members: ${memberError.message}`);
                  }
              }

              // 2. Update invitation status (Only runs if no critical error occurred above)
              console.log('Attempting to update invitation status...'); // Add log
              const { error: updateError } = await supabase
                  .from('project_invitations')
                  .update({ status: 'accepted' }) // Using the version without 'accepted_at' based on previous step
                  .eq('id', invitation.id);

              if (updateError) {
                 // Log the specific update error
                 console.error("Error updating invitation status:", updateError);
                 throw new Error(`Failed to update invitation status: ${updateError.message}`);
              }

              console.log("Invitation accepted/status updated. Refreshing projects and invitations...");
              await fetchProjects(); // Refresh user's project list
              await fetchPendingInvitations(user.id, user.email ?? null);

          } else { // Decline logic remains the same
              console.log(`Declining invitation ${invitation.id}...`);
              const { error } = await supabase
                  .from('project_invitations')
                  .update({ status: 'declined' })
                  .eq('id', invitation.id);

              if (error) throw error;
              console.log("Invitation declined. Refreshing invitations...");
              await fetchPendingInvitations(user.id, user.email ?? null);
          }
          // Clear loading status for this specific invitation on success
          setInvitationActionStatus(prev => ({ ...prev, [invitation.id]: null }));
      } catch (err: any) {
          console.error(`Error handling invitation ${action}:`, err);
          setInvitationError(`Failed to ${action} invitation: ${err.message}`);
          // Set error status for this specific invitation
          setInvitationActionStatus(prev => ({ ...prev, [invitation.id]: 'error' }));
      }
  }, [user, fetchProjects, fetchPendingInvitations]); // Dependencies remain the same

  // --- Initial Data Fetch & Auth Listener ---
  useEffect(() => {
    // Fetch projects and potentially select first
    fetchProjects(true);

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("Auth event:", event);
        const currentUser = session?.user ?? null;
        const currentEmail = session?.user?.email ?? null;
        setUser(currentUser);

        if (currentUser && currentEmail) {
          // Fetch invitations when user is available
          fetchPendingInvitations(currentUser.id, currentEmail);
        } else {
          setPendingInvitations([]); // Clear invitations if logged out
        }

        if (event === 'SIGNED_OUT') {
           // Clear everything on sign out
           setError(null); setProjects([]); setSelectedProjectId(null); setParsedTxtArticles([]); setScreeningStats(null); setPendingInvitations([]); setInvitationError(null); setUploadedFileName(null);
        } else if (event === 'SIGNED_IN' && currentUser && currentEmail) {
           // Refetch projects and invitations on sign in
           fetchProjects(true);
           fetchPendingInvitations(currentUser.id, currentEmail);
        }
      }
    );
    return () => {
      authListener?.subscription.unsubscribe();
    };
    // Add fetchPendingInvitations to dependency array
  }, [fetchProjects, fetchPendingInvitations]);

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
    // Clear file processing state and parsed articles/decisions
    setProcessingTxtMessage(null); setProcessingTxtError(null); setIsProcessingTxt(false); setParsedTxtArticles([]);
    setUploadMessage(null); setUploadError(null); setIsUploading(false); setUploadedFileName(null);
    setDownloadError(null); // Clear download error too
    // Stats will be cleared/refetched by the useEffect hook above
    setProjectAgents([]);
    setSelectedAgentId(null);
    setAgentError(null);
  };

  // --- Refresh Projects List After Creation ---
  const refreshProjects = () => {
      console.log("Refreshing projects list..."); // Debug log
      fetchProjects(false); // Refetch projects, don't force selection change
  };

  // --- Handle TXT File Content Parsing ---
  const handleTxtFileContent = useCallback((content: string, projectId: string | null) => {
      if (!projectId) { /* ... handle error ... */ return; }
      setIsProcessingTxt(true);
      setProcessingTxtMessage("Parsing articles...");
      setProcessingTxtError(null);
      setParsedTxtArticles([]); // Clear previous results

      try {
          const articlesFromFile: ArticleDetail[] = [];
          const records = content.split(/^\s*PMID-/gm).filter(record => record.trim().length > 0);

          if (records.length === 0) { throw new Error("No records starting with PMID- found."); }
          setProcessingTxtMessage(`Found ${records.length} records. Parsing...`);

          records.forEach((recordText) => {
              const fullRecordText = "PMID-" + recordText;
              const lines = fullRecordText.split('\n');
              let pmid = '', title = '', abstract = '', isTI = false, isAB = false;

              lines.forEach(line => {
                  if (line.startsWith('PMID-')) { pmid = line.substring(6).trim(); isTI=false; isAB=false; }
                  else if (line.startsWith('TI  -')) { title = line.substring(6).trim(); isTI=true; isAB=false; }
                  else if (line.startsWith('AB  -')) { abstract = line.substring(6).trim(); isAB=true; isTI=false; }
                  else if (isTI && line.startsWith('      ')) { title += ' ' + line.trim(); }
                  else if (isAB && line.startsWith('      ')) { abstract += ' ' + line.trim(); }
                  else if (line.trim().length > 0 && !line.startsWith('      ')) { isTI=false; isAB=false; }
              });

              if (pmid) {
                  articlesFromFile.push({ pmid, title: title || 'N/A', abstract: abstract || 'N/A' });
              } else { console.warn(`Record skipped, could not find PMID.`); }
          });

          if (articlesFromFile.length === 0) { throw new Error("No articles with PMIDs extracted."); }

          setParsedTxtArticles(articlesFromFile);
          setProcessingTxtMessage(`Parsed ${articlesFromFile.length} articles. Click 'Save Articles'.`);

      } catch (err: any) {
          console.error("Error parsing TXT:", err);
          setProcessingTxtError(err.message);
          setProcessingTxtMessage(null);
      } finally {
          setIsProcessingTxt(false);
      }
  }, []);

  // --- Save Parsed TXT Articles to Supabase ---
  const handleSaveTxtArticles = useCallback(async () => {
      if (!selectedProjectId || parsedTxtArticles.length === 0) { return; }
      console.log(`Saving ${parsedTxtArticles.length} articles to project ${selectedProjectId}...`);
      setIsProcessingTxt(true);
      setProcessingTxtMessage("Saving to DB...");
      setProcessingTxtError(null);
      const articlesToSave: ArticleSaveData[] = parsedTxtArticles.map(a => ({ project_id: selectedProjectId, pmid: a.pmid, title: a.title, abstract: a.abstract }));
      const BATCH_SIZE = 500;
      let saved = 0;
      let errorOccurred = false;

      try {
          for (let i = 0; i < articlesToSave.length; i += BATCH_SIZE) {
              const batch = articlesToSave.slice(i, i + BATCH_SIZE);
              setProcessingTxtMessage(`Saving batch ${Math.floor(i / BATCH_SIZE) + 1}... (${i + batch.length}/${articlesToSave.length})`);
              const { error: saveError } = await supabase.from('articles').upsert(batch, { onConflict: 'project_id, pmid', ignoreDuplicates: true });
              if (saveError) {
                  console.error(`Batch save error (index ${i}):`, saveError);
                  errorOccurred = true;
                  setProcessingTxtError(`Save error: ${saveError.message}`);
              } else {
                  saved += batch.length;
              }
          }
          if (!errorOccurred) {
              setProcessingTxtMessage(`Successfully saved ${saved} articles.`);
              setParsedTxtArticles([]);
              await fetchScreeningStats(selectedProjectId, user?.id ?? null);
          } else {
              setProcessingTxtMessage(`Finished with errors. Saved ${saved} before error.`);
          }
      } catch (err: any) {
          console.error("Error saving articles:", err);
          setProcessingTxtError(err.message);
          setProcessingTxtMessage(null);
      } finally {
          setIsProcessingTxt(false);
      }
  }, [parsedTxtArticles, selectedProjectId, fetchScreeningStats, user?.id]);

  // --- NEW: Download Articles for AI (with Batching) ---
  const handleDownloadArticles = useCallback(async () => {
      if (!selectedProjectId) { setDownloadError("Please select a project first."); return; }
      setIsDownloading(true);
      setDownloadError(null);
      console.log(`Downloading ALL articles for AI, project: ${selectedProjectId}`);

      const BATCH_DOWNLOAD_SIZE = 1000; // Fetch 1000 at a time (Supabase default limit)
      let allArticles: { id: string; title: string | null; abstract: string | null }[] = [];
      let currentOffset = 0;
      let fetchMore = true;

      // We need the project name for the filename, recalculate inside if needed, or depend on 'projects' state
      const currentSelectedProject = projects.find(p => p.id === selectedProjectId);

      try {
          while (fetchMore) {
              console.log(`Fetching articles from offset ${currentOffset}...`);
              const { data: batchArticles, error: fetchError } = await supabase
                  .from('articles')
                  .select('id, title, abstract')
                  .eq('project_id', selectedProjectId)
                  .range(currentOffset, currentOffset + BATCH_DOWNLOAD_SIZE - 1); // Fetch in batches

              if (fetchError) throw fetchError;

              if (batchArticles && batchArticles.length > 0) {
                  allArticles = allArticles.concat(batchArticles);
                  currentOffset += batchArticles.length;
                  // If we fetched less than the batch size, we've reached the end
                  if (batchArticles.length < BATCH_DOWNLOAD_SIZE) {
                      fetchMore = false;
                  }
              } else {
                  // No more articles found
                  fetchMore = false;
              }
          } // End while loop

          if (allArticles.length === 0) throw new Error("No articles found in this project to download.");

          console.log(`Total articles fetched for download: ${allArticles.length}`);

          // Format data (using the complete 'allArticles' array)
          let fileContent = "";
          allArticles.forEach((article, index) => {
              fileContent += `ID: ${article.id}\n`;
              fileContent += `TI: ${article.title || 'N/A'}\n`;
              fileContent += `AB: ${article.abstract || 'N/A'}\n`;
              if (index < allArticles.length - 1) {
                  fileContent += "---\n";
              }
          });

          // Create blob and trigger download (same as before)
          const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `project_${currentSelectedProject?.name || selectedProjectId}_articles.txt`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          console.log("Article data download initiated for all articles.");

      } catch (err: any) {
          console.error("Error downloading articles:", err);
          setDownloadError(`Download failed: ${err.message}`);
      } finally {
          setIsDownloading(false);
      }
  }, [selectedProjectId, projects]);

  // --- NEW: Fetch Statistics for All AI Agents in Project (with Batching for Decisions) ---
  const fetchAgentStats = useCallback(async (projectId: string | null) => {
    if (!projectId) {
        setAgentStats([]); // Clear stats if no project selected
        return;
    }
    console.log(`Fetching stats for all AI agents in project ${projectId}...`);
    setLoadingAgentStats(true);
    setAgentStatsError(null);
    setAgentStats([]); // Clear previous stats

    try {
        // 1. Fetch total article count for the project
        const { count: totalCount, error: totalError } = await supabase
            .from('articles')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId);

        if (totalError) throw new Error(`Failed to get total article count: ${totalError.message}`);
        const totalArticles = totalCount ?? 0;

        // 2. Fetch all AI agents for the project
        const { data: agents, error: agentsError } = await supabase
            .from('ai_agents')
            .select('id, name')
            .eq('project_id', projectId);

        if (agentsError) throw new Error(`Failed to fetch AI agents: ${agentsError.message}`);
        if (!agents || agents.length === 0) {
            console.log("No AI agents found for this project.");
            setAgentStats([]);
            setLoadingAgentStats(false);
            return;
        }

        // 3. Fetch ALL decisions made by ANY agent for this project (IN BATCHES)
        let allAgentDecisions: { agent_id: string | null; decision: string }[] = [];
        let currentOffset = 0;
        const BATCH_DECISION_SIZE = 1000; // Supabase limit
        let fetchMore = true;

        console.log("Fetching all agent decisions in batches...");
        while (fetchMore) {
            const { data: batchDecisions, error: decisionError } = await supabase
                .from('screening_decisions')
                .select('agent_id, decision')
                .eq('project_id', projectId)
                .not('agent_id', 'is', null)
                .in('decision', ['include', 'exclude', 'maybe'])
                .range(currentOffset, currentOffset + BATCH_DECISION_SIZE - 1); // Fetch in batches

            if (decisionError) throw new Error(`Failed to get agent decisions batch: ${decisionError.message}`);

            if (batchDecisions && batchDecisions.length > 0) {
                allAgentDecisions = allAgentDecisions.concat(batchDecisions as { agent_id: string | null; decision: string }[]); // Add type assertion
                currentOffset += batchDecisions.length;
                if (batchDecisions.length < BATCH_DECISION_SIZE) {
                    fetchMore = false; // Reached the end
                }
            } else {
                fetchMore = false; // No more decisions found
            }
        }
        console.log(`Total agent decisions fetched: ${allAgentDecisions.length}`);


        // 4. Process the decisions and aggregate stats per agent (using allAgentDecisions)
        const statsMap = new Map<string, AgentScreeningStats>();

        // Initialize stats map for each agent found
        agents.forEach(agent => {
            statsMap.set(agent.id, {
                agentId: agent.id,
                agentName: agent.name,
                totalArticles: totalArticles,
                userScreenedCount: 0,
                includeCount: 0,
                excludeCount: 0,
                maybeCount: 0,
            });
        });

        // Aggregate counts from fetched decisions
        allAgentDecisions.forEach(item => { // Iterate over the complete list
            if (item.agent_id) {
                const agentStat = statsMap.get(item.agent_id);
                if (agentStat) {
                    if (item.decision === 'include') agentStat.includeCount++;
                    else if (item.decision === 'exclude') agentStat.excludeCount++;
                    else if (item.decision === 'maybe') agentStat.maybeCount++;
                    agentStat.userScreenedCount = agentStat.includeCount + agentStat.excludeCount + agentStat.maybeCount;
                } else {
                     console.warn(`Found decision for unknown agent_id: ${item.agent_id}`);
                }
            }
        });

        // Convert map values to array and set state
        const calculatedStats = Array.from(statsMap.values());
        setAgentStats(calculatedStats);
        console.log("Agent stats calculated (full):", calculatedStats);

    } catch (err: any) {
        console.error("Error fetching agent stats:", err);
        setAgentStatsError(`Failed to load agent stats: ${err.message}`);
        setAgentStats([]);
    } finally {
        setLoadingAgentStats(false);
    }
  }, []); // Depends only on supabase client

  // --- NEW: Save Parsed AI Decisions to Supabase (Restored Batch Logic) ---
  const handleSaveAiDecisions = useCallback(async (fileContent: string, uploadedFileName: string) => {
    if (typeof fileContent !== 'string') { /* ... type check ... */ return; }
    console.log(`handleSaveAiDecisions processing file: ${uploadedFileName}`);
    if (!selectedProjectId || !selectedAgentId) { /* ... checks ... */ return; }
    if (!fileContent) { /* ... check ... */ return; }

    // Reset state
    setIsUploadingDecisions(true);
    setIsSaving(true);
    setUploadDecisionProgress(0);
    setUploadError(null);
    setUploadMessage(`Processing file: ${uploadedFileName}...`);

    const lines = fileContent.trim().split('\n');
    const decisionsToInsert: Array<{
        project_id: string;
        article_id: string;
        agent_id: string;
        decision: ScreeningDecision;
        exclusion_reason: string | null;
    }> = [];
    const errors: string[] = [];

    console.log(`--- Parsing ${lines.length} lines for AI agent ${selectedAgentId} ---`);

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i]; // Keep original for logging
        const line = originalLine.trim();
        if (!line) {
            console.log(`Line ${i + 1}: Skipped empty line.`);
            continue;
        }

        console.log(`Processing Line ${i + 1}: "${line}"`);

        // --- Revised Splitting Logic ---
        const colonIndex = line.indexOf(':');
        let articleId: string | null = null;
        let decisionInput: string | null = null;

        if (colonIndex === -1) {
            const errorMsg = `Line ${i + 1}: Invalid format. No colon found. Line: "${originalLine}"`;
            console.error(errorMsg);
            errors.push(errorMsg);
            continue; // Skip line
        }

        articleId = line.substring(0, colonIndex).trim();
        decisionInput = line.substring(colonIndex + 1).trim(); // Get everything after the first colon

        if (!articleId) {
            const errorMsg = `Line ${i + 1}: Invalid format. UUID part is empty. Line: "${originalLine}"`;
            console.error(errorMsg);
            errors.push(errorMsg);
            continue; // Skip line
        }
        if (!decisionInput) {
            const errorMsg = `Line ${i + 1}: Invalid format. Decision part is empty. Line: "${originalLine}"`;
            console.error(errorMsg);
            errors.push(errorMsg);
            continue; // Skip line
        }
        // --- End Revised Splitting Logic ---

        console.log(`  -> Split: UUID="${articleId}", DecisionInput="${decisionInput}"`);

        // Validate UUID format
        if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(articleId)) {
             const errorMsg = `Line ${i + 1}: Invalid UUID format "${articleId}"`;
             console.error(errorMsg);
             errors.push(errorMsg);
             continue;
        }

        // Use the helper function to parse decision and reason
        const { decision, reason } = mapDecisionAndReason(decisionInput); // Pass the extracted decision part

        if (decision === null) {
            const errorMsg = `Line ${i + 1}: Could not map decision from input "${decisionInput}". Original line: "${originalLine}"`;
            console.error(errorMsg);
            errors.push(errorMsg);
            continue; // Skip this invalid decision
        }

        const decisionObject = {
            project_id: selectedProjectId,
            article_id: articleId,
            agent_id: selectedAgentId,
            decision: decision,
            exclusion_reason: reason
        };
        console.log(`  -> Valid decision parsed. Prepared for insert:`, decisionObject);
        decisionsToInsert.push(decisionObject);
    }
    console.log(`--- Finished Parsing. Found ${errors.length} errors. Preparing to insert ${decisionsToInsert.length} valid decisions. ---`);


    if (errors.length > 0 && decisionsToInsert.length === 0) { // If ONLY errors occurred
       setUploadError(`Failed to parse any valid lines. Found ${errors.length} errors (see console). Please check file format near reported lines.`);
       setIsUploadingDecisions(false);
       setIsSaving(false);
       setUploadDecisionProgress(0);
       setUploadMessage(null);
       return;
    }
    // Optional: Handle cases where some lines parsed, some failed
     if (errors.length > 0 && decisionsToInsert.length > 0) {
         console.warn(`Parsed ${decisionsToInsert.length} decisions, but encountered ${errors.length} errors (see console). Only valid decisions will be saved.`);
         // Decide if you want to proceed or force user to fix errors
         // setUploadError(`Warning: ${errors.length} lines could not be parsed (see console). Saving ${decisionsToInsert.length} valid decisions.`); // Example warning
     }


    if (decisionsToInsert.length === 0) { // Should be caught above, but double-check
        setUploadError("No valid decisions found after parsing.");
        setIsUploadingDecisions(false);
        setIsSaving(false);
        setUploadMessage(null);
        return;
    }

    setUploadMessage(`Parsed ${decisionsToInsert.length} decisions. Saving to database...`);

    // ... (rest of the saving logic: batch insert, try/catch, finally) ...
    // Ensure the try/catch/finally block for Supabase insert is present
    let insertedCount = 0;
    let updatedCount = 0; // Keep track of updates if needed
    try {
        const BATCH_SIZE = 500;
        for (let i = 0; i < decisionsToInsert.length; i += BATCH_SIZE) {
            const batch = decisionsToInsert.slice(i, i + BATCH_SIZE);
            console.log(`Upserting batch ${Math.floor(i / BATCH_SIZE) + 1}...`);

            // *** CHANGE insert TO upsert ***
            const { error: upsertError, data: upsertData } = await supabase
                .from('screening_decisions')
                .upsert(batch, {
                    onConflict: 'project_id, article_id, agent_id', // Specify columns for conflict detection
                    // ignoreDuplicates: false // Default is false, ensures updates happen
                });

            if (upsertError) throw upsertError; // Throw error to be caught below

            // Supabase upsert doesn't easily tell inserts vs updates in the response.
            // We assume the operation succeeded for the batch size.
            insertedCount += batch.length; // Count all processed in batch for progress
            setUploadDecisionProgress((insertedCount / decisionsToInsert.length) * 100);
        }

         console.log("Successfully upserted all AI decisions.");
         setUploadDecisionProgress(100);
         // Updated message to reflect upsert
         setUploadMessage(`Successfully processed (inserted/updated) ${insertedCount} decisions from ${uploadedFileName}.`);
         fetchAgentStats(selectedProjectId); // Refresh stats

    } catch (dbError: any) {
         console.error("Database error during AI decision upsert:", dbError);
         let userFriendlyError = `Database error processing batch: ${dbError.message}`;
         if (dbError.code === '42P10' || dbError.message.includes('constraint') && dbError.message.includes('does not exist')) {
             userFriendlyError = `Database Error: The unique constraint on (project_id, article_id, agent_id) might be missing or misspelled in the 'screening_decisions' table. Please add it via the Supabase dashboard. (Details: ${dbError.message})`;
         }
         // ... other specific DB error code handling ...
         setUploadError(userFriendlyError);
         setUploadMessage(null);
         setUploadDecisionProgress( (insertedCount / decisionsToInsert.length) * 100 );
    } finally {
        setIsUploadingDecisions(false);
        setIsSaving(false);
    }


}, [selectedProjectId, selectedAgentId, supabase, fetchAgentStats, isSaving]);

  // --- NEW: Fetch AI Agents for Project ---
  const fetchProjectAgents = useCallback(async (projectId: string | null) => {
      if (!projectId) {
          setProjectAgents([]);
          setSelectedAgentId(null); // Clear selection if project changes
          return;
      }
      console.log(`Fetching AI agents for project ${projectId}...`);
      setLoadingAgents(true);
      setAgentError(null);
      try {
          const { data, error } = await supabase
              .from('ai_agents')
              .select('id, name, project_id') // Select necessary fields
              .eq('project_id', projectId)
              .order('name', { ascending: true }); // Order alphabetically

          if (error) throw error;

          setProjectAgents(data || []);
          // Reset agent selection when agents are refetched for a project
          // You could optionally try to keep selection if the agent still exists
          setSelectedAgentId(null);
          console.log("Fetched AI agents:", data);

      } catch (err: any) {
          console.error("Error fetching AI agents:", err);
          setAgentError(`Failed to load AI agents: ${err.message}`);
          setProjectAgents([]);
          setSelectedAgentId(null);
      } finally {
          setLoadingAgents(false);
      }
  }, []); // Depends only on supabase client

  // --- NEW: Fetch AI Agents when Project Changes ---
  useEffect(() => {
      fetchProjectAgents(selectedProjectId);
  }, [selectedProjectId, fetchProjectAgents]);

  // --- Fetch AI Agents when Project Changes (existing) ---
  useEffect(() => {
      fetchProjectAgents(selectedProjectId);
      // Also fetch agent stats when project changes
      fetchAgentStats(selectedProjectId);
  }, [selectedProjectId, fetchProjectAgents, fetchAgentStats]);

  // --- Refresh AI Agents List After Creation (update to also refresh stats) ---
  const refreshAgents = () => {
      console.log("Refreshing AI agents list and stats...");
      fetchProjectAgents(selectedProjectId); // Refetch agents
      fetchAgentStats(selectedProjectId);  // Refetch agent stats
  };

  // --- Render Logic ---
  if (loading) { return <div className="container mx-auto px-4 py-8 text-center">Loading dashboard...</div>; }
  if (!user) { return <div className="container mx-auto px-4 py-8 text-center">Redirecting to login...</div>; }

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

      {/* --- Pending Invitations Section --- */}
      {pendingInvitations.length > 0 && (
        <Card className="mb-6 border-blue-500 border-2">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-blue-700">
              Pending Project Invitations ({pendingInvitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingInvitations && <Loader2 className="h-5 w-5 animate-spin" />}
            {invitationError && <Alert variant="destructive"><AlertDescription>{invitationError}</AlertDescription></Alert>}
            {pendingInvitations.map((inv) => {
                const isLoadingAction = invitationActionStatus[inv.id] === 'loading';
                const hasErrorAction = invitationActionStatus[inv.id] === 'error';
                 return (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                        <div>
                            <p className="font-semibold">{inv.project_name}</p>
                            <p className="text-sm text-muted-foreground">
                                {/* You'd need to fetch inviter email/name separately if needed */}
                                Invited {/* by [Inviter Name/Email] */} on {new Date(inv.created_at).toLocaleDateString()}
                            </p>
                             {hasErrorAction && <p className="text-xs text-red-500 mt-1">Action failed. Please try again.</p>}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleInvitationAction('accept', inv)}
                                disabled={isLoadingAction}
                            >
                                {isLoadingAction ? <ReloadIcon className="h-4 w-4 animate-spin" /> : 'Accept'}
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleInvitationAction('decline', inv)}
                                disabled={isLoadingAction}
                            >
                               {isLoadingAction ? <ReloadIcon className="h-4 w-4 animate-spin" /> : 'Decline'}
                            </Button>
                        </div>
                    </div>
                 );
            })}
          </CardContent>
        </Card>
      )}

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
           <div className="space-y-8">
              <h2 className="text-xl font-semibold mb-4 text-center">
                 Project: {selectedProject?.name ?? 'Loading...'}
              </h2>

              {/* --- TXT File Import Section (Existing) --- */}
              <section>
                <Card className="bg-secondary/30">
                    <CardHeader><CardTitle className="text-lg">Import Articles (PMID Format TXT)</CardTitle></CardHeader>
                    <CardContent>
                        <ArticleDropzone
                            projectId={selectedProjectId}
                            onFileRead={handleTxtFileContent}
                            className={isProcessingTxt ? 'opacity-75 cursor-default' : ''}
                            disabled={isProcessingTxt}
                            />
                        {/* Display Processing Messages */}
                        {isProcessingTxt && !processingTxtMessage && !processingTxtError && ( <Alert variant="default" className="mt-4"><AlertDescription>Processing file...</AlertDescription></Alert> )}
                        {processingTxtMessage && !processingTxtError && ( <Alert variant={"default"} className="mt-4"><AlertDescription>{processingTxtMessage}</AlertDescription></Alert> )}
                        {processingTxtError && ( <Alert variant="destructive" className="mt-4"><AlertTitle>Error</AlertTitle><AlertDescription>{processingTxtError}</AlertDescription></Alert> )}
                    </CardContent>
                </Card>
                {/* Parsed TXT Articles Preview & Save */}
                {parsedTxtArticles.length > 0 && (
                    <div className="mt-4">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-md font-semibold">Parsed Articles Preview ({parsedTxtArticles.length})</h3>
                            {!isProcessingTxt && ( <Button onClick={handleSaveTxtArticles} size="sm"> Save Articles to Project </Button> )}
                            {isProcessingTxt && processingTxtMessage?.startsWith("Saving") && ( <Button size="sm" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving... </Button> )}
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 border rounded p-2">
                            {parsedTxtArticles.map((a, i) => ( <div key={i} className="text-xs p-1 bg-muted/40 rounded truncate"><strong>{a.pmid}:</strong> {a.title}</div> ))}
                        </div>
                    </div>
                )}
              </section>

              <Separator />

              {/* --- MODIFIED AI Screening Data Section --- */}
              <section>
                  <CardHeader className='px-0'>
                     <CardTitle className="text-lg flex items-center justify-between">
                        <span>AI Agent Screening Data</span>
                         {/* Agent Management Buttons */}
                         <div className="flex items-center gap-2">
                             <CreateAgentDialog
                                projectId={selectedProjectId}
                                user={user}
                                onAgentCreated={refreshAgents} // Pass the refresh callback
                              />
                             {/* Optional: Add button to view/edit agents */}
                             <Button variant="outline" size="sm" onClick={handleDownloadArticles} disabled={isDownloading || !selectedProjectId}>
                                 {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                 Download Articles for AI
                             </Button>
                         </div>
                     </CardTitle>
                     <p className="text-sm text-muted-foreground pt-1">
                        Upload screening decisions made by a defined AI agent for this project.
                     </p>
                 </CardHeader>
                 {downloadError && <Alert variant="destructive" className="mb-4"><AlertDescription>{downloadError}</AlertDescription></Alert>}
                 {agentError && <Alert variant="destructive" className="mb-4"><AlertTitle>Agent Error</AlertTitle><AlertDescription>{agentError}</AlertDescription></Alert>}

                 {/* --- NEW: AI Agent Selection Dropdown --- */}
                 <div className="mb-4 grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="ai-agent-select">Select AI Agent for Upload</Label>
                     {loadingAgents ? (
                         <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading agents...</div>
                     ) : projectAgents.length > 0 ? (
                         <Select
                             value={selectedAgentId ?? ''}
                             onValueChange={(value) => setSelectedAgentId(value || null)}
                             disabled={isUploading} // Disable while uploading decisions
                         >
                             <SelectTrigger id="ai-agent-select">
                                 <SelectValue placeholder="Select an agent..." />
                             </SelectTrigger>
                             <SelectContent>
                                 {projectAgents.map((agent) => (
                                     <SelectItem key={agent.id} value={agent.id}>
                                         {agent.name}
                                     </SelectItem>
                                 ))}
                             </SelectContent>
                         </Select>
                     ) : (
                         <p className="text-sm text-muted-foreground">No AI agents created for this project yet. Use "Create AI Agent".</p>
                     )}
                 </div>

                 {/* AI Decision Upload Dropzone (existing) */}
                  <DecisionDropzone
                      projectId={selectedProjectId}
                      onFileUpload={handleSaveAiDecisions}
                      disabled={!selectedProjectId || !selectedAgentId || isUploadingDecisions || isSaving}
                  />
                  {/* Tooltip/message if agent not selected */}
                  {!selectedAgentId && !loadingAgents && projectAgents.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Please select an AI agent above before uploading.</p>
                  )}

                  {/* Display Upload Processing/Error Messages */}
                  {/* Show progress bar during upload */}
                  {(isUploadingDecisions || isSaving) && uploadDecisionProgress > 0 && (
                       <div className="mt-4">
                           <Progress value={uploadDecisionProgress} className="w-full h-2" />
                           <p className="text-sm text-muted-foreground text-center mt-1">{uploadMessage || "Processing..."}</p>
                       </div>
                  )}
                  {/* Show final message/error *after* processing is done */}
                   {!isUploadingDecisions && !isSaving && (uploadMessage || uploadError) && (
                       <Alert variant={uploadError ? "destructive" : "default"} className="mt-4">
                            {uploadError && <AlertTitle>Upload Error</AlertTitle>}
                            <AlertDescription>{uploadError || uploadMessage}</AlertDescription>
                       </Alert>
                   )}

              </section>

              <Separator />

              {/* --- NEW: AI Agents Screening Progress Section --- */}
              <section>
                  <h3 className="text-lg font-semibold mb-4">
                      AI Agents Screening Progress
                  </h3>
                  {loadingAgentStats ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                  ) : agentStatsError ? (
                      <Alert variant="destructive"><AlertTitle>Error Loading Agent Stats</AlertTitle><AlertDescription>{agentStatsError}</AlertDescription></Alert>
                  ) : agentStats.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {agentStats.map((stats) => {
                              const agentProgress = stats.totalArticles > 0
                                  ? Math.round((stats.userScreenedCount / stats.totalArticles) * 100)
                                  : 0;
                              return (
                                  <Card key={stats.agentId} className="flex flex-col">
                                      <CardHeader className="pb-2">
                                          <CardTitle className="text-base font-medium">{stats.agentName}</CardTitle>
                                      </CardHeader>
                                      <CardContent className="flex-grow flex flex-col justify-between pt-2">
                                        {stats.totalArticles > 0 ? (
                                            <>
                                                <div>
                                                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                                                        <span>{stats.userScreenedCount} / {stats.totalArticles} screened</span>
                                                        <span>{agentProgress}%</span>
                                                    </div>
                                                    <Progress value={agentProgress} className="w-full h-2 mb-3" />
                                                </div>
                                                <div className="grid grid-cols-3 gap-2 text-center text-xs mt-auto">
                                                    <div>
                                                        <p className="text-muted-foreground">Included</p>
                                                        <p className="text-lg font-bold">{stats.includeCount}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground">Maybe</p>
                                                        <p className="text-lg font-bold">{stats.maybeCount}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-muted-foreground">Excluded</p>
                                                        <p className="text-lg font-bold">{stats.excludeCount}</p>
                                                    </div>
                                                </div>
                                            </>
                                          ) : (
                                            <p className="text-center text-sm text-muted-foreground py-4">No articles in project.</p>
                                          )}
                                      </CardContent>
                                  </Card>
                              );
                          })}
                      </div>
                  ) : (
                      <p className="text-center text-muted-foreground py-4">
                          {agentError ? agentError : "No screening data available for AI agents in this project."}
                      </p>
                  )}
              </section>

              <Separator />

              {/* --- Screening Stats & Actions --- */}
                 <section>
                    <div className="flex justify-between items-center mb-4 gap-2">
                        <h3 className="text-lg font-semibold">
                            Your Screening Progress
                        </h3>
                        <div className="flex items-center gap-2">
                            {screeningStats && screeningStats.totalArticles > 0 && ( <Link href="/review" passHref><Button size="lg" variant="outline">Review Project</Button></Link> )}
                            {screeningStats && screeningStats.totalArticles > 0 && ( <Link href={`/screening/${selectedProjectId}`} passHref><Button size="lg" variant="outline">{screeningStats.userScreenedCount > 0 ? "Continue Screening" : "Start Screening"}</Button></Link> )}
                        </div>
                    </div>

                    {loadingStats ? ( <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : screeningStats ? ( <div> {screeningStats.totalArticles > 0 ? ( <> <div className="mb-2 flex justify-between text-sm text-muted-foreground"><span>{screeningStats.userScreenedCount} / {screeningStats.totalArticles} screened</span><span>{progressPercent}%</span></div><Progress value={progressPercent} className="w-full mb-4" /><Separator className="my-4" /><div className="grid grid-cols-3 gap-4 text-center"><div><p className="text-xs text-muted-foreground">Included</p><p className="text-xl font-bold">{screeningStats.includeCount}</p></div><div><p className="text-xs text-muted-foreground">Maybe</p><p className="text-xl font-bold">{screeningStats.maybeCount}</p></div><div><p className="text-xs text-muted-foreground">Excluded</p><p className="text-xl font-bold">{screeningStats.excludeCount}</p></div></div></> ) : ( <p className="text-center text-muted-foreground py-4">No articles imported yet.</p> )} </div>
                    ) : error && error.includes("stats") ? ( <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> // Check if error is stat-related
                    ) : ( <p className="text-center text-muted-foreground py-4">No screening data available.</p> )}
                 </section>
           </div>
         ) : (
            <div className="flex items-center justify-center h-full">
                 <p className="text-center text-muted-foreground">{projects.length > 0 ? "Please select a project above." : "Create or join a project."}</p>
             </div>
         )}
      </div>
    </div>
  );
}
