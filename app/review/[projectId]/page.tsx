import { supabase } from '@/lib/supabaseClient';
import ReviewInterface from './ReviewInterface'; // Client component

// --- Add generateStaticParams ---
export async function generateStaticParams() {
  console.log("Generating static params for review pages...");

  // Fetch all project IDs. Ensure RLS/Auth allows this during build.
  // Use service_role key during build if necessary, or ensure anon key has read access.
  const { data: projects, error } = await supabase
    .from('projects') // Fetch directly from projects table
    .select('id');

  if (error) {
    console.error("Error fetching project IDs for review generateStaticParams:", error);
    return []; // Return empty array on error
  }
  if (!projects) {
    console.warn("No projects found for review generateStaticParams.");
    return [];
  }

  console.log(`Found ${projects.length} project IDs for review static generation.`);
  // Map the IDs to the expected format { projectId: '...' }
  return projects.map((project) => ({
    projectId: project.id,
  }));
}
// --- End generateStaticParams ---

// --- Page Server Component ---
interface ReviewPageProps {
  params: {
    projectId: string;
  };
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const projectId = params.projectId;

  if (!projectId) {
    // Handle missing project ID - maybe redirect or show error
    return <div>Error: Project ID is missing.</div>;
  }

  // You could fetch project name or other server-side data here if needed
  // For example:
  // const { data: projectData, error } = await supabase
  //   .from('projects')
  //   .select('name')
  //   .eq('id', projectId)
  //   .single();
  // const projectName = projectData?.name || 'Project Review';

  // Render the client component, passing the projectId
  return <ReviewInterface projectId={projectId} />;
} 