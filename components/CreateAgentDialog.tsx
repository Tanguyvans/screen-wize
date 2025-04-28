import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CreateAgentDialogProps {
  projectId: string | null;
  user: User | null;
  onAgentCreated: () => void; // Callback to refresh agent list
}

// Define the structure for inserting agent data
interface AiAgentInsertData {
  project_id: string;
  name: string;
  created_by?: string; // Optional
}

export function CreateAgentDialog({ projectId, user, onAgentCreated }: CreateAgentDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateAgent = async () => {
    if (!projectId || !user || !agentName.trim()) {
      setError("Project must be selected and agent name cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);

    const agentData: AiAgentInsertData = {
      project_id: projectId,
      name: agentName.trim(),
      created_by: user.id // Optional: track creator
    };

    try {
      const { error: insertError } = await supabase
        .from('ai_agents')
        .insert(agentData);

      if (insertError) {
        // Check for unique constraint violation
        if (insertError.code === '23505') { // PostgreSQL unique violation code
            throw new Error(`An agent with the name "${agentName.trim()}" already exists in this project.`);
        } else {
            throw insertError;
        }
      }

      console.log("AI Agent created successfully:", agentName.trim());
      onAgentCreated(); // Trigger refresh in parent
      setAgentName(''); // Clear input
      setIsOpen(false); // Close dialog

    } catch (err: any) {
      console.error("Error creating AI agent:", err);
      setError(err.message || "Failed to create AI agent.");
    } finally {
      setIsLoading(false);
    }
  };

  // Reset state when dialog opens/closes
  const handleOpenChange = (open: boolean) => {
      setIsOpen(open);
      if (!open) {
          setAgentName('');
          setError(null);
          setIsLoading(false);
      }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!projectId}>Create AI Agent</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New AI Agent</DialogTitle>
          <DialogDescription>
            Define a new AI agent for project screening within this project. The name must be unique per project.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="agent-name" className="text-right">
              Agent Name
            </Label>
            <Input
              id="agent-name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., GPT-4 Turbo Agent"
              disabled={isLoading}
            />
          </div>
        </div>
        <DialogFooter>
           <DialogClose asChild><Button variant="ghost" disabled={isLoading}>Cancel</Button></DialogClose>
          <Button type="button" onClick={handleCreateAgent} disabled={isLoading || !agentName.trim()}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 