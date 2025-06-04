-- Create filtering_results table to store article filtering results per project
CREATE TABLE IF NOT EXISTS filtering_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Summary statistics
    total_processed INTEGER NOT NULL,
    filtered_count INTEGER NOT NULL,
    removed_duplicates INTEGER DEFAULT 0,
    removed_reviews INTEGER DEFAULT 0,
    removed_excluded INTEGER DEFAULT 0,
    
    -- File information
    file_names JSONB,
    
    -- Complete filtering result data (includes all articles and metadata)
    result_data JSONB NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_filtering_results_project_id ON filtering_results(project_id);
CREATE INDEX IF NOT EXISTS idx_filtering_results_created_at ON filtering_results(created_at DESC);

-- RLS (Row Level Security) policies
ALTER TABLE filtering_results ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access filtering results for projects they are members of
CREATE POLICY "Users can view filtering results for their projects" ON filtering_results
    FOR SELECT USING (
        project_id IN (
            SELECT project_id 
            FROM project_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can insert filtering results for projects they are members of
CREATE POLICY "Users can insert filtering results for their projects" ON filtering_results
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id 
            FROM project_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can update filtering results for projects they are members of
CREATE POLICY "Users can update filtering results for their projects" ON filtering_results
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id 
            FROM project_members 
            WHERE user_id = auth.uid()
        )
    );

-- Policy: Users can delete filtering results for projects they are members of
CREATE POLICY "Users can delete filtering results for their projects" ON filtering_results
    FOR DELETE USING (
        project_id IN (
            SELECT project_id 
            FROM project_members 
            WHERE user_id = auth.uid()
        )
    );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_filtering_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_filtering_results_updated_at
    BEFORE UPDATE ON filtering_results
    FOR EACH ROW
    EXECUTE PROCEDURE update_filtering_results_updated_at(); 