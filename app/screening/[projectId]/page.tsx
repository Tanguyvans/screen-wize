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

// --- Page Server Component (Reverted to inline type) ---
export default function ScreeningPage({ params }: { params: { projectId: string } }) {
  const projectId = params.projectId;

  // Render the client component, passing the projectId as a prop
  return <ScreeningInterface projectId={projectId} />;
}
