import { supabase } from '@/lib/supabaseClient';
// Import the new client component (adjust path if needed)
import ScreeningInterface from './ScreeningInterface';

// --- generateStaticParams function remains the same ---
export async function generateStaticParams() {
  console.log("Generating static params for screening pages...");
  // Fetch all project IDs. Ensure RLS/Auth allows this during build.
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id');

  if (error) {
    console.error("Error fetching project IDs for generateStaticParams:", error);
    return [];
  }
  if (!projects) {
    console.warn("No projects found for generateStaticParams.");
    return [];
  }
  console.log(`Found ${projects.length} project IDs for static generation.`);
  return projects.map((project) => ({
    projectId: project.id,
  }));
}

// --- Define the type for the page props ---
type ScreeningPageProps = {
  params: { projectId: string };
};

// --- Page Server Component ---
// Revert back to this after fixing the other build error
export default function ScreeningPage(props: ScreeningPageProps) {
  const projectId = props.params.projectId;

  // Add a check in case params are somehow undefined at runtime due to the 'any'
  if (!projectId) {
    // Handle the error appropriately - maybe render an error message
    // or redirect. For now, just log and return null.
    console.error("Error: projectId is missing in props!");
    return <div>Error: Project ID not found.</div>;
  }

  // Render the client component, passing the projectId as a prop
  return <ScreeningInterface projectId={projectId} />;
}
