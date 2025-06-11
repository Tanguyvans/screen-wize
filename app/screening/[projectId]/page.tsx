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

// --- Page Server Component ---
// Fix for Next.js 15+ async params requirement
export default async function ScreeningPage(props: {
  params: Promise<{ projectId: string }>
}) {
  // Await the params before accessing properties
  const params = await props.params;
  const projectId = params.projectId;

  // Add a check in case projectId is somehow undefined
  if (!projectId) {
    console.error("Error: projectId is missing in params!");
    return <div>Error: Project ID not found.</div>;
  }

  // Render the client component, passing the projectId as a prop
  return <ScreeningInterface projectId={projectId} />;
}
