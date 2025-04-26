'use client'; // Required for hooks like useState and event handlers

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Adjust path if needed
import { useRouter } from 'next/navigation'; // Make sure useRouter is imported

// Shadcn UI Imports
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); // To show success/error messages
  const router = useRouter(); // Initialize useRouter

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(''); // Clear previous messages

    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      setMessage(`Login failed: ${error.message}`);
      setLoading(false); // Stop loading on error
    } else {
      setMessage('Login successful! Redirecting...');
      // Redirect to the dashboard page
      router.push('/dashboard'); // <--- Change this line
    }
  };

  // Basic Sign Up Handler (Optional)
  const handleSignUp = async () => {
    setLoading(true);
    setMessage('');

    // Commented out options block
    // options: {
    //   emailRedirectTo: 'http://localhost:3000/' // Or your deployment URL
    // }

    // Put the actual call on its own line
    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
      // You might want to include options here if needed later
      // options: {
      //    emailRedirectTo: `${window.location.origin}/login?message=Check email for verification link`
      // }
    });

    if (error) {
      setMessage(`Sign up failed: ${error.message}`);
    } else {
      setMessage('Sign up successful! Please check your email for verification.');
    }
    setLoading(false);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Login / Sign Up</CardTitle>
        <CardDescription>Enter your credentials below</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          {message && (
             <p className={`text-sm text-center ${message.includes('failed') ? 'text-destructive' : 'text-green-600'}`}>
                {message}
              </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Processing...' : 'Login'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
         <div className="relative w-full">
           <div className="absolute inset-0 flex items-center">
             <span className="w-full border-t" />
           </div>
           <div className="relative flex justify-center text-xs uppercase">
             <span className="bg-card px-2 text-muted-foreground">
               Or
             </span>
           </div>
         </div>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleSignUp}
          disabled={loading || !email || !password}
        >
          {loading ? '...' : 'Sign Up'}
        </Button>
      </CardFooter>
    </Card>
  );
}
