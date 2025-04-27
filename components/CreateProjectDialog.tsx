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
  DialogClose, // To close the dialog
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react'; // For loading spinner

interface CreateProjectDialogProps {
  user: User | null;
  onProjectCreated: () => void; // Callback to refresh project list
}

export function CreateProjectDialog({ user, onProjectCreated }: CreateProjectDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!user || !projectName.trim()) {
      setError('Project name cannot be empty.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Insert into projects table
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({ name: projectName, owner_id: user.id }) // Assuming 'owner_id' column exists
        .select() // Return the created project, including its ID
        .single(); // Expect only one row back

      if (projectError) throw projectError;
      if (!newProject) throw new Error("Failed to create project.");

      // 2. Insert creator into project_members table
      const { error: memberError } = await supabase
        .from('project_members')
        .insert({ project_id: newProject.id, user_id: user.id, role: 'owner' }); // Assuming 'role' column exists

      if (memberError) {
         // Attempt to clean up if member insert fails? (Ideally use an Edge Function transaction)
         console.warn("Project created, but failed to add owner as member:", memberError);
         // Consider deleting the project if adding member fails critically
         // await supabase.from('projects').delete().match({ id: newProject.id });
         throw new Error("Failed to add project member after creation.");
      }

      // Success
      setProjectName(''); // Clear input
      setIsOpen(false);   // Close dialog
      onProjectCreated(); // Trigger refresh in parent

    } catch (err: any) {
      // Log the entire error object to see its structure
      console.error("Detailed error creating project:", err);

      // Try to extract a more specific message from Supabase errors
      let specificMessage = 'An unexpected error occurred.';
      if (err && typeof err === 'object') {
        if ('message' in err && err.message) {
            specificMessage = err.message;
        } else if ('details' in err && err.details) {
             specificMessage = `Database error: ${err.details}`;
        } else if ('hint' in err && err.hint) {
            specificMessage = `Database hint: ${err.hint}`;
        }
      }
      setError(specificMessage); // Set the more specific message to state

    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="default">Create New Project</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Enter a name for your new screening project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="col-span-3"
              disabled={loading}
            />
          </div>
           {error && <p className="col-span-4 text-center text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
           <DialogClose asChild>
              <Button type="button" variant="outline" disabled={loading}>Cancel</Button>
          </DialogClose>
          <Button type="button" onClick={handleCreate} disabled={loading || !projectName.trim()}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 