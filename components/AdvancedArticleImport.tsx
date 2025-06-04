'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Upload, FileText, X, Loader2, Filter, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { 
  parsePubMedFile, 
  filterArticles, 
  parseExclusionFiles, 
  type Article, 
  type FilteringResult 
} from '@/lib/articleFiltering';

interface AdvancedArticleImportProps {
  projectId: string | null;
  onArticlesProcessed: (articles: Article[], filteringResult: FilteringResult) => void;
  disabled?: boolean;
  className?: string;
}

interface ExclusionFiles {
  rejectedArticles?: File;
  acceptedArticles?: File;
}

interface ExclusionFileContents {
  rejectedArticles?: string;
  acceptedArticles?: string;
}

export function AdvancedArticleImport({ 
  projectId, 
  onArticlesProcessed, 
  disabled = false, 
  className 
}: AdvancedArticleImportProps) {
  // Main file states
  const [pubmedFile, setPubmedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Exclusion files states
  const [exclusionFiles, setExclusionFiles] = useState<ExclusionFiles>({});
  
  // Processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [autoRemoveReviews, setAutoRemoveReviews] = useState(true);
  
  // Results and messages
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filteringResult, setFilteringResult] = useState<FilteringResult | null>(null);
  
  // Preview states
  const [showDuplicatesPreview, setShowDuplicatesPreview] = useState(false);
  const [showReviewsPreview, setShowReviewsPreview] = useState(false);

  // Load filtering results from Supabase on component mount or project change
  useEffect(() => {
    if (projectId) {
      loadFilteringResults(projectId);
    } else {
      setFilteringResult(null);
    }
  }, [projectId]);

  // Load filtering results from Supabase
  const loadFilteringResults = useCallback(async (currentProjectId: string) => {
    try {
      const { data, error } = await supabase
        .from('filtering_results')
        .select('*')
        .eq('project_id', currentProjectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No filtering results found, which is normal
          console.log('No previous filtering results found for this project');
          return;
        }
        throw error;
      }

      if (data) {
        const result = data.result_data as FilteringResult;
        setFilteringResult(result);
        setSuccess(`Loaded previous filtering results. ${result.filteredArticles.length} articles remaining after filtering. (Restored from database)`);
      }
    } catch (err: any) {
      console.error('Error loading filtering results:', err);
      // Don't show error to user as this is not critical
    }
  }, []);

  // Save filtering results to Supabase
  const saveFilteringResult = useCallback(async (result: FilteringResult, fileNames: { pubmed?: string, rejected?: string, accepted?: string }) => {
    if (!projectId) return;

    try {
      const { error } = await supabase
        .from('filtering_results')
        .insert({
          project_id: projectId,
          total_processed: result.totalProcessed,
          filtered_count: result.filteredArticles.length,
          removed_duplicates: result.removedCount.duplicates,
          removed_reviews: result.removedCount.autoDetectedReviews + result.removedCount.excludedByReviewArticles,
          removed_excluded: result.removedCount.excludedByUsefulArticles,
          file_names: fileNames,
          result_data: result
        });

      if (error) throw error;
      console.log('Filtering results saved to database');
    } catch (err: any) {
      console.error('Error saving filtering results:', err);
      // Don't show error to user, just log it
    }
  }, [projectId]);

  // Clear all states and database
  const clearAll = useCallback(async () => {
    setPubmedFile(null);
    setExclusionFiles({});
    setError(null);
    setSuccess(null);
    setFilteringResult(null);
    
    // Clear database results for this project
    if (projectId) {
      try {
        await supabase
          .from('filtering_results')
          .delete()
          .eq('project_id', projectId);
        console.log('Cleared filtering results from database');
      } catch (err: any) {
        console.error('Error clearing filtering results:', err);
      }
    }
  }, [projectId]);

  // Handle PubMed file upload
  const handlePubMedFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Invalid file type. Please upload a .txt file.');
      return;
    }

    // Check if this file is already used as an exclusion file
    const isUsedAsExclusion = Object.values(exclusionFiles).some(
      excludeFile => excludeFile && excludeFile.name === file.name
    );

    if (isUsedAsExclusion) {
      setError(`Cannot use "${file.name}" as main PubMed file because it's already uploaded as an exclusion list. Please use different files.`);
      return;
    }

    setPubmedFile(file);
    setError(null);
    setSuccess(null);
    // Clear previous results when new file is uploaded
    setFilteringResult(null);
  }, [exclusionFiles]);

  // Handle exclusion file upload
  const handleExclusionFile = useCallback((file: File, type: keyof ExclusionFiles) => {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError(`Invalid ${type} file type. Please upload a .txt file.`);
      return;
    }

    // Check if this file is already used as the main PubMed file
    if (pubmedFile && pubmedFile.name === file.name) {
      setError(`Cannot use "${file.name}" as exclusion list because it's already uploaded as the main PubMed file. Please use different files.`);
      return;
    }

    // Check if this file is already used as another exclusion file
    const isUsedElsewhere = Object.entries(exclusionFiles).some(
      ([key, excludeFile]) => key !== type && excludeFile && excludeFile.name === file.name
    );

    if (isUsedElsewhere) {
      setError(`"${file.name}" is already uploaded as another exclusion list. Please use different files.`);
      return;
    }

    setExclusionFiles(prev => ({ ...prev, [type]: file }));
    setError(null);
    // Clear previous results when exclusion files change
    setFilteringResult(null);
  }, [pubmedFile, exclusionFiles]);

  // Remove exclusion file
  const removeExclusionFile = useCallback((type: keyof ExclusionFiles) => {
    setExclusionFiles(prev => {
      const newFiles = { ...prev };
      delete newFiles[type];
      return newFiles;
    });
    // Clear previous results when exclusion files change
    setFilteringResult(null);
  }, []);

  // Read file content
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // Process articles with filtering
  const processArticles = useCallback(async () => {
    if (!projectId) {
      setError('Please select a project from the dropdown at the top of the page.');
      return;
    }

    if (!pubmedFile) {
      setError('Please upload a PubMed file in the "1. Upload PubMed File" section above.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      // Read PubMed file
      const pubmedContent = await readFileContent(pubmedFile);
      const parsedArticles = parsePubMedFile(pubmedContent);

      if (parsedArticles.length === 0) {
        throw new Error('No articles found in the PubMed file.');
      }

      // Read exclusion files
      const exclusionContents: ExclusionFileContents = {};
      if (exclusionFiles.rejectedArticles) {
        exclusionContents.rejectedArticles = await readFileContent(exclusionFiles.rejectedArticles);
      }
      if (exclusionFiles.acceptedArticles) {
        exclusionContents.acceptedArticles = await readFileContent(exclusionFiles.acceptedArticles);
      }

      // Parse exclusion lists
      const exclusionLists = parseExclusionFiles({
        reviewArticles: exclusionContents.rejectedArticles,
        usefulArticles: exclusionContents.acceptedArticles
      });

      // Filter articles
      const result = filterArticles(parsedArticles, {
        removeDuplicates,
        autoRemoveReviews,
        exclusionLists
      });

      setFilteringResult(result);

      // Save to database
      const fileNames = {
        pubmed: pubmedFile.name,
        rejected: exclusionFiles.rejectedArticles?.name,
        accepted: exclusionFiles.acceptedArticles?.name
      };
      await saveFilteringResult(result, fileNames);

      // Check for potentially problematic filtering results
      if (result.filteredArticles.length === 0 && result.totalProcessed > 0) {
        const totalExcluded = result.removedCount.autoDetectedReviews +
                             result.removedCount.excludedByReviewArticles + 
                             result.removedCount.excludedByUsefulArticles;
        
        if (totalExcluded === result.totalProcessed && result.removedCount.duplicates === 0) {
          setError(`All ${result.totalProcessed} articles were excluded by your filtering options. Please review your settings and exclusion lists.`);
          return;
        } else if (result.filteredArticles.length === 0) {
          setError(`All articles were filtered out (${result.removedCount.duplicates} duplicates, ${totalExcluded} excluded). Please review your filtering options or try with a different PubMed file.`);
          return;
        }
      }

      setSuccess(`Processed ${result.totalProcessed} articles. ${result.filteredArticles.length} articles remaining after filtering.`);
      
      // Call parent callback
      onArticlesProcessed(result.filteredArticles, result);

    } catch (err: any) {
      console.error('Error processing articles:', err);
      setError(err.message || 'An error occurred while processing articles.');
    } finally {
      setIsProcessing(false);
    }
  }, [pubmedFile, exclusionFiles, removeDuplicates, autoRemoveReviews, projectId, onArticlesProcessed, saveFilteringResult]);

  // Drag and drop handlers for main dropzone
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handlePubMedFile(files[0]);
    }
  };

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Advanced Article Import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Helpful Info Box */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>File Guide:</strong> Upload your main PubMed file to process. Optionally upload exclusion lists: 
            <strong> Rejected Articles</strong> (articles to exclude from screening) and <strong> Accepted Articles</strong> (articles already identified as useful). 
            Use different files for each section.
          </AlertDescription>
        </Alert>

        {/* PubMed File Upload */}
        <div>
          <h3 className="text-sm font-medium mb-2">1. Upload PubMed File</h3>
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragging && !disabled ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400',
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <input
              type="file"
              accept=".txt"
              className="hidden"
              id="pubmed-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePubMedFile(file);
                e.target.value = '';
              }}
              disabled={disabled}
            />
            <label htmlFor="pubmed-file-input" className="cursor-pointer">
              {pubmedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium">{pubmedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(pubmedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      setPubmedFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop PubMed .txt file here or click to select
                  </p>
                </div>
              )}
            </label>
          </div>
        </div>

        <Separator />

        {/* Exclusion Files */}
        <div>
          <h3 className="text-sm font-medium mb-4">2. Upload Exclusion Lists (Optional)</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { key: 'rejectedArticles' as const, label: 'Rejected Articles', desc: 'Articles to exclude/reject from screening' },
              { key: 'acceptedArticles' as const, label: 'Accepted Articles', desc: 'Articles already identified as useful' }
            ].map(({ key, label, desc }) => (
              <div key={key} className="space-y-2">
                <label className="text-xs font-medium">{label}</label>
                <div className="border border-dashed border-gray-300 rounded p-3 text-center">
                  <input
                    type="file"
                    accept=".txt"
                    className="hidden"
                    id={`${key}-input`}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleExclusionFile(file, key);
                      e.target.value = '';
                    }}
                    disabled={disabled}
                  />
                  {exclusionFiles[key] ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3 text-green-600" />
                        <span className="text-xs truncate">{exclusionFiles[key]!.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExclusionFile(key)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <label htmlFor={`${key}-input`} className="cursor-pointer">
                      <Upload className="h-4 w-4 mx-auto text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                    </label>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Options */}
        <div>
          <h3 className="text-sm font-medium mb-2">3. Filtering Options</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-remove-reviews"
                checked={autoRemoveReviews}
                onCheckedChange={(checked: boolean) => setAutoRemoveReviews(checked)}
                disabled={disabled}
              />
              <label
                htmlFor="auto-remove-reviews"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Automatically remove review articles (based on publication types)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remove-duplicates"
                checked={removeDuplicates}
                onCheckedChange={(checked: boolean) => setRemoveDuplicates(checked)}
                disabled={disabled}
              />
              <label
                htmlFor="remove-duplicates"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Remove duplicate articles (based on PMID and title similarity)
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={processArticles}
            disabled={!projectId || isProcessing || disabled}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Articles'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={clearAll}
            disabled={isProcessing || disabled}
          >
            Clear All
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              // Clear database results for this project
              if (projectId) {
                try {
                  await supabase
                    .from('filtering_results')
                    .delete()
                    .eq('project_id', projectId);
                  console.log('Cleared filtering results from database');
                } catch (err: any) {
                  console.error('Error clearing filtering results:', err);
                }
              }
              setFilteringResult(null);
              setSuccess(null);
              console.log('Cleared database filtering data');
            }}
            disabled={isProcessing || disabled}
            title="Clear saved results and force fresh processing"
          >
            Force Fresh
          </Button>
        </div>

        {/* Show helpful message if requirements not met */}
        {!pubmedFile && projectId && !isProcessing && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please upload a PubMed file above to process articles.
            </AlertDescription>
          </Alert>
        )}

        {!projectId && !isProcessing && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please select a project from the dropdown at the top of the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {filteringResult && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-4">
            <h4 className="font-medium">Filtering Results:</h4>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-background rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-primary">{filteringResult.totalProcessed}</div>
                <div className="text-xs text-muted-foreground">Total Processed</div>
              </div>
              
              <div className="bg-background rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{filteringResult.filteredArticles.length}</div>
                <div className="text-xs text-muted-foreground">Remaining</div>
              </div>
              
              <div className="bg-background rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-600">{filteringResult.removedCount.duplicates}</div>
                <div className="text-xs text-muted-foreground">Duplicates</div>
              </div>
              
              <div className="bg-background rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{filteringResult.removedCount.autoDetectedReviews + filteringResult.removedCount.excludedByReviewArticles}</div>
                <div className="text-xs text-muted-foreground">Reviews</div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="text-sm space-y-1">
              {filteringResult.removedCount.autoDetectedReviews > 0 && (
                <div className="text-muted-foreground">
                  Auto-detected reviews: {filteringResult.removedCount.autoDetectedReviews}
                </div>
              )}
              {filteringResult.removedCount.excludedByReviewArticles > 0 && (
                <div className="text-muted-foreground">
                  Rejected articles: {filteringResult.removedCount.excludedByReviewArticles}
                </div>
              )}
              {filteringResult.removedCount.excludedByUsefulArticles > 0 && (
                <div className="text-muted-foreground">
                  Accepted articles: {filteringResult.removedCount.excludedByUsefulArticles}
                </div>
              )}
            </div>

            {/* Preview Sections */}
            {(filteringResult.removedSamples.duplicates.length > 0 || 
              filteringResult.removedSamples.autoDetectedReviews.length > 0 || 
              filteringResult.removedSamples.excludedByReviewArticles.length > 0) && (
              <div className="space-y-3">
                <h5 className="font-medium text-sm">Preview of Removed Articles:</h5>
                
                {/* Duplicates Preview */}
                {filteringResult.removedCount.duplicates > 0 && (
                  <div className="border rounded-lg p-3">
                    <button
                      onClick={() => setShowDuplicatesPreview(!showDuplicatesPreview)}
                      className="flex items-center gap-2 w-full text-left text-sm font-medium hover:text-primary"
                    >
                      {showDuplicatesPreview ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Duplicates Removed ({filteringResult.removedCount.duplicates})
                      <span className="text-xs text-muted-foreground ml-1">
                        [Showing {filteringResult.removedSamples.duplicates.length}]
                      </span>
                    </button>
                    {showDuplicatesPreview && (
                      <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                        {filteringResult.removedSamples.duplicates.map((article, index) => (
                          <div key={index} className="text-xs bg-muted p-2 rounded">
                            <div className="font-medium">PMID: {article.pmid}</div>
                            <div className="text-muted-foreground">{article.title}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Auto-detected Reviews Preview */}
                {filteringResult.removedCount.autoDetectedReviews > 0 && (
                  <div className="border rounded-lg p-3">
                    <button
                      onClick={() => setShowReviewsPreview(!showReviewsPreview)}
                      className="flex items-center gap-2 w-full text-left text-sm font-medium hover:text-primary"
                    >
                      {showReviewsPreview ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Auto-detected Reviews ({filteringResult.removedCount.autoDetectedReviews}) 
                      <span className="text-xs text-muted-foreground ml-1">
                        [Showing {filteringResult.removedSamples.autoDetectedReviews.length}]
                      </span>
                    </button>
                    {showReviewsPreview && (
                      <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                        {filteringResult.removedSamples.autoDetectedReviews.map((article, index) => (
                          <div key={index} className="text-xs bg-muted p-2 rounded">
                            <div className="font-medium">PMID: {article.pmid}</div>
                            <div className="text-muted-foreground">{article.title}</div>
                            <div className="text-xs text-blue-600 mt-1">
                              Types: {article.publication_types.join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Rejected Articles Preview */}
                {filteringResult.removedCount.excludedByReviewArticles > 0 && (
                  <div className="border rounded-lg p-3">
                    <div className="text-sm font-medium mb-2">
                      Rejected Articles ({filteringResult.removedCount.excludedByReviewArticles})
                      <span className="text-xs text-muted-foreground ml-1">
                        [Showing {filteringResult.removedSamples.excludedByReviewArticles.length}]
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {filteringResult.removedSamples.excludedByReviewArticles.map((article, index) => (
                        <div key={index} className="text-xs bg-muted p-2 rounded">
                          <div className="font-medium">PMID: {article.pmid}</div>
                          <div className="text-muted-foreground">{article.title}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="text-sm bg-background rounded p-2">
              <strong>Summary:</strong> From {filteringResult.totalProcessed} articles, removed {filteringResult.removedCount.duplicates} duplicates{filteringResult.removedCount.autoDetectedReviews > 0 ? `, ${filteringResult.removedCount.autoDetectedReviews} auto-detected reviews` : ''}{filteringResult.removedCount.excludedByReviewArticles > 0 ? `, ${filteringResult.removedCount.excludedByReviewArticles} rejected articles` : ''}{filteringResult.removedCount.excludedByUsefulArticles > 0 ? `, and ${filteringResult.removedCount.excludedByUsefulArticles} accepted articles` : ''}, leaving <strong>{filteringResult.filteredArticles.length} articles for screening</strong>.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 