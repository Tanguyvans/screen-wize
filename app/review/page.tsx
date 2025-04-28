// No need for supabase here unless fetching global data
import ReviewInterface from './ReviewInterface'; // Client component

// No more generateStaticParams needed
// No more props with params needed

export default function ReviewPage() {
  // Simply render the client component that will handle project selection
  return <ReviewInterface />;
} 