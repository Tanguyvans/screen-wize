'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';

interface InviteUserDialogProps {
  user: User | null;
  projectId: string | null;
  projectName?: string; // Optional: Display project name
}

export function InviteUserDialog({ user, projectId, projectName }: InviteUserDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!user || !projectId || !inviteEmail.trim()) {
      setError('Valid email and selected project required.');
      return;
    }
    // Basic email format check (consider a more robust library if needed)
    if (!/\S+@\S+\.\S+/.test(inviteEmail)) {
        setError('Please enter a valid email address.');
        return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Check if user is trying to invite themselves
      if (user.email === inviteEmail) {
          throw new Error("You cannot invite yourself.");
      }

      // Optional: Check if the user is already a member (requires another query)
      // const { data: existingMember, error: memberCheckError } = await supabase
      //    .from('project_members') // TODO: Need SELECT RLS policy on project_members
      //    .select('id')
      //    .eq('project_id', projectId)
      //    .eq('user_id', ???) // How to get user_id from email reliably before insert? Difficult without Edge Function.
      // Best to check if an *invitation* already exists for this email+project

      const { data: existingInvite, error: inviteCheckError } = await supabase
        .from('project_invitations') // Need RLS policy allowing select for project members
        .select('id, status')
        .eq('project_id', projectId)
        .eq('invited_user_email', inviteEmail)
        .maybeSingle(); // Check if an invite exists

        if (inviteCheckError) throw inviteCheckError;

        if (existingInvite) {
            if (existingInvite.status === 'pending') {
                throw new Error(`An invitation is already pending for ${inviteEmail}.`);
            } else if (existingInvite.status === 'accepted') {
                // Ideally, the check for existing *member* should handle this, but is hard client-side
                 throw new Error(`${inviteEmail} is already a member of this project.`);
            }
             // If declined/expired, maybe allow re-inviting (or update existing record - more complex)
        }


      // Insert the invitation
      const { error: insertError } = await supabase
        .from('project_invitations')
        .insert({
          project_id: projectId,
          invited_by_user_id: user.id,
          invited_user_email: inviteEmail,
          status: 'pending' // Default status
        });

      if (insertError) throw insertError;

      // Success
      setSuccessMessage(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail(''); // Clear input
      // Maybe close dialog after a delay? Or keep open to send more?
      // setTimeout(() => setIsOpen(false), 2000);

    } catch (err: any) {
      console.error("Error sending invitation:", err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  // Reset state when dialog opens/closes
  const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
      if (!open) {
          setError(null);
          setSuccessMessage(null);
          setInviteEmail('');
      }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {/* Disable button if no project is selected */}
        <Button variant="outline" disabled={!projectId}>Invite Member</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Enter the email address of the user you want to invite{projectName ? ` to ${projectName}` : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="user@example.com"
              className="col-span-3"
              disabled={loading}
            />
          </div>
           {error && <p className="col-span-4 text-center text-sm text-destructive">{error}</p>}
           {successMessage && <p className="col-span-4 text-center text-sm text-green-600">{successMessage}</p>}
        </div>
        <DialogFooter>
           <DialogClose asChild>
              <Button type="button" variant="outline" disabled={loading}>Close</Button>
          </DialogClose>
          <Button type="button" onClick={handleInvite} disabled={loading || !inviteEmail.trim()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Sending...' : 'Send Invitation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 