'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (signInError) {
      setMessage(`Login failed: ${signInError.message}`);
      setLoading(false);
    } else {
      setMessage('Login successful! Checking profile...');
      console.log('Login successful, attempting to ensure profile exists...');

      try {
        const { error: rpcError } = await supabase.rpc('ensure_user_profile');

        if (rpcError) {
          console.error('Error ensuring user profile after login:', rpcError.message);
          // Decide how critical this is. Maybe log it but proceed?
          //setMessage('Login successful, but failed to verify profile.'); // Optional user feedback
        } else {
          console.log('User profile ensured.');
        }
      } catch (e) {
        console.error('Exception when calling ensure_user_profile after login:', e);
      }

      setMessage('Redirecting...');
      router.refresh();
      router.push('/dashboard');
    }
  };

  // Basic Sign Up Handler (Optional)
  const handleSignUp = async () => {
    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
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
             <p className={`text-sm text-center ${message.includes('failed') || message.includes('Error') ? 'text-destructive' : 'text-green-600'}`}>
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
