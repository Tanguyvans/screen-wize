'use client'; // This component needs to be a client component

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; // Import the client-side Supabase instance
import { Button } from '@/components/ui/button'; // Use shadcn button

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    // Tell Supabase to sign the user out
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Error logging out:', error);
      // Optionally display an error message to the user
    } else {
      // Redirect to the login page after successful logout
      router.push('/login');
    }
  };

  return (
    // Render the shadcn Button component
    <Button variant="outline" onClick={handleLogout}>
      Logout
    </Button>
  );
} 