// Article filtering utilities for the screening app

export interface Article {
  pmid: string;
  title: string;
  abstract: string;
  publication_types: string[];
  id?: string;
}

export interface FilteringOptions {
  removeDuplicates: boolean;
  autoRemoveReviews: boolean;
  exclusionLists: {
    allArticles?: string[];
    reviewArticles?: string[];
    usefulArticles?: string[];
  };
}

export interface FilteringResult {
  filteredArticles: Article[];
  removedCount: {
    duplicates: number;
    autoDetectedReviews: number;
    excludedByAllArticles: number;
    excludedByReviewArticles: number;
    excludedByUsefulArticles: number;
  };
  removedSamples: {
    duplicates: Article[];
    autoDetectedReviews: Article[];
    excludedByAllArticles: Article[];
    excludedByReviewArticles: Article[];
    excludedByUsefulArticles: Article[];
  };
  totalProcessed: number;
}

/**
 * Parse a PubMed format text file and extract articles with publication types
 */
export function parsePubMedFile(content: string): Article[] {
  const articles: Article[] = [];
  const records = content.split(/^\s*PMID-/gm).filter(record => record.trim().length > 0);

  records.forEach((recordText) => {
    const fullRecordText = "PMID-" + recordText;
    const lines = fullRecordText.split('\n');
    let pmid = '', title = '', abstract = '';
    let publication_types: string[] = [];
    let isTI = false, isAB = false;

    lines.forEach(line => {
      if (line.startsWith('PMID-')) {
        pmid = line.substring(6).trim();
        isTI = false;
        isAB = false;
      } else if (line.startsWith('TI  -')) {
        title = line.substring(6).trim();
        isTI = true;
        isAB = false;
      } else if (line.startsWith('AB  -')) {
        abstract = line.substring(6).trim();
        isAB = true;
        isTI = false;
      } else if (line.startsWith('PT  -')) {
        const pubType = line.substring(6).trim();
        publication_types.push(pubType);
        isTI = false;
        isAB = false;
      } else if (isTI && line.startsWith('      ')) {
        title += ' ' + line.trim();
      } else if (isAB && line.startsWith('      ')) {
        abstract += ' ' + line.trim();
      } else if (line.trim().length > 0 && !line.startsWith('      ')) {
        isTI = false;
        isAB = false;
      }
    });

    if (pmid) {
      articles.push({
        pmid,
        title: title || 'N/A',
        abstract: abstract || 'N/A',
        publication_types: publication_types
      });
    }
  });

  return articles;
}

/**
 * Parse exclusion list files (can contain PMIDs, titles, or both)
 */
export function parseExclusionList(content: string): Set<string> {
  const exclusionSet = new Set<string>();
  const lines = content.split('\n');

  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#') && !trimmedLine.startsWith('//')) {
      // Try to extract PMID if line starts with PMID-
      if (trimmedLine.startsWith('PMID-')) {
        const pmid = trimmedLine.substring(5).trim();
        if (pmid) {
          exclusionSet.add(pmid.toLowerCase());
        }
      } else if (trimmedLine.match(/^\d+$/)) {
        // Line is just a number (PMID)
        exclusionSet.add(trimmedLine.toLowerCase());
      } else {
        // Treat as title or other identifier
        exclusionSet.add(trimmedLine.toLowerCase());
      }
    }
  });

  return exclusionSet;
}

/**
 * Normalize text for comparison (remove extra spaces, lowercase, etc.)
 */
function normalizeText(text: string): string {
  return text.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\w\s]/g, '');
}

/**
 * Check if an article should be excluded based on exclusion lists
 */
function isArticleExcluded(article: Article, exclusionSet: Set<string>): boolean {
  // Check PMID
  if (exclusionSet.has(article.pmid.toLowerCase())) {
    return true;
  }

  // Check normalized title (exact match)
  const normalizedTitle = normalizeText(article.title);
  if (exclusionSet.has(normalizedTitle)) {
    return true;
  }

  // Check for good matches with exclusion items
  for (const exclusionItem of exclusionSet) {
    // Skip very short exclusion items (likely common words)
    if (exclusionItem.length < 10) {
      continue;
    }
    
    // If the exclusion item looks like a title (has multiple words and is reasonably long)
    // then use more flexible matching
    const hasMultipleWords = exclusionItem.split(' ').length >= 3;
    const isLikelyTitle = hasMultipleWords && exclusionItem.length > 20;
    
    if (isLikelyTitle) {
      // For title-like exclusion items, use more flexible matching
      // Check if there's substantial overlap (either direction)
      if (normalizedTitle.includes(exclusionItem) || exclusionItem.includes(normalizedTitle)) {
        // Calculate overlap percentage
        const overlapLength = Math.min(normalizedTitle.length, exclusionItem.length);
        const longerLength = Math.max(normalizedTitle.length, exclusionItem.length);
        const overlapPercentage = overlapLength / longerLength;
        
        // Match if there's at least 70% overlap
        if (overlapPercentage >= 0.7) {
          return true;
        }
      }
      
      // Also check for word-based similarity for titles
      const titleWords = new Set(normalizedTitle.split(' ').filter(w => w.length > 3));
      const exclusionWords = new Set(exclusionItem.split(' ').filter(w => w.length > 3));
      
      if (titleWords.size > 0 && exclusionWords.size > 0) {
        const intersection = new Set([...titleWords].filter(w => exclusionWords.has(w)));
        const union = new Set([...titleWords, ...exclusionWords]);
        const similarity = intersection.size / union.size;
        
        // Match if there's high word similarity (80%+) and both have significant content
        if (similarity >= 0.8 && intersection.size >= 3) {
          return true;
        }
      }
    } else {
      // For shorter exclusion items, use the conservative approach
      if (normalizedTitle.includes(exclusionItem)) {
        // The exclusion item should be at least 40% of the title length for a match
        if (exclusionItem.length >= normalizedTitle.length * 0.4) {
          return true;
        }
      }
      
      // Also check if the title is contained in a much longer exclusion item
      if (exclusionItem.includes(normalizedTitle) && normalizedTitle.length >= exclusionItem.length * 0.4) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Remove duplicates from articles based on PMID and title similarity
 */
function removeDuplicates(articles: Article[]): { filtered: Article[], removedCount: number, removedSamples: Article[] } {
  const seen = new Set<string>();
  const filtered: Article[] = [];
  const removedArticles: Article[] = [];

  articles.forEach(article => {
    const pmidKey = article.pmid.toLowerCase();
    const titleKey = normalizeText(article.title);
    
    // Create a composite key
    const compositeKey = `${pmidKey}:${titleKey}`;
    
    if (!seen.has(pmidKey) && !seen.has(compositeKey)) {
      seen.add(pmidKey);
      seen.add(compositeKey);
      filtered.push(article);
    } else {
      removedArticles.push(article);
    }
  });

  return { 
    filtered, 
    removedCount: removedArticles.length, 
    removedSamples: removedArticles // Now contains all removed articles, not just samples
  };
}

/**
 * Check if an article is a review based on publication types
 */
function isReviewArticle(article: Article): boolean {
  const reviewKeywords = ['Review', 'Systematic Review', 'Meta-Analysis', 'review'];
  return article.publication_types.some(pubType => 
    reviewKeywords.some(keyword => pubType.includes(keyword))
  );
}

/**
 * Remove review articles automatically based on publication types
 */
function removeReviewArticles(articles: Article[]): { filtered: Article[], removedCount: number, removedSamples: Article[] } {
  const filtered: Article[] = [];
  const removedArticles: Article[] = [];

  articles.forEach(article => {
    if (isReviewArticle(article)) {
      removedArticles.push(article);
    } else {
      filtered.push(article);
    }
  });

  console.log(`removeReviewArticles: found ${removedArticles.length} review articles out of ${articles.length} total articles`);
  console.log('First 3 review articles:', removedArticles.slice(0, 3).map(a => ({ pmid: a.pmid, title: a.title.substring(0, 50) + '...' })));

  return { 
    filtered, 
    removedCount: removedArticles.length, 
    removedSamples: removedArticles // Now contains all removed articles, not just samples
  };
}

/**
 * Filter articles and collect samples of excluded articles
 */
function filterWithSamples(articles: Article[], exclusionSet: Set<string>): { filtered: Article[], removedCount: number, removedSamples: Article[] } {
  const filtered: Article[] = [];
  const removedArticles: Article[] = [];

  articles.forEach(article => {
    if (isArticleExcluded(article, exclusionSet)) {
      removedArticles.push(article);
    } else {
      filtered.push(article);
    }
  });

  return { 
    filtered, 
    removedCount: removedArticles.length, 
    removedSamples: removedArticles // Now contains all removed articles, not just samples
  };
}

/**
 * Filter articles based on exclusion lists and duplicate removal
 */
export function filterArticles(articles: Article[], options: FilteringOptions): FilteringResult {
  let currentArticles = [...articles];
  const result: FilteringResult = {
    filteredArticles: [],
    removedCount: {
      duplicates: 0,
      autoDetectedReviews: 0,
      excludedByAllArticles: 0,
      excludedByReviewArticles: 0,
      excludedByUsefulArticles: 0,
    },
    removedSamples: {
      duplicates: [],
      autoDetectedReviews: [],
      excludedByAllArticles: [],
      excludedByReviewArticles: [],
      excludedByUsefulArticles: [],
    },
    totalProcessed: articles.length
  };

  // Remove duplicates first if requested
  if (options.removeDuplicates) {
    const duplicateResult = removeDuplicates(currentArticles);
    currentArticles = duplicateResult.filtered;
    result.removedCount.duplicates = duplicateResult.removedCount;
    result.removedSamples.duplicates = duplicateResult.removedSamples;
  }

  // Auto-remove review articles if requested
  if (options.autoRemoveReviews) {
    const reviewResult = removeReviewArticles(currentArticles);
    currentArticles = reviewResult.filtered;
    result.removedCount.autoDetectedReviews = reviewResult.removedCount;
    result.removedSamples.autoDetectedReviews = reviewResult.removedSamples;
  }

  // Apply exclusion filters
  if (options.exclusionLists.allArticles && options.exclusionLists.allArticles.length > 0) {
    const exclusionSet = new Set(options.exclusionLists.allArticles.map(item => item.toLowerCase()));
    const filterResult = filterWithSamples(currentArticles, exclusionSet);
    currentArticles = filterResult.filtered;
    result.removedCount.excludedByAllArticles = filterResult.removedCount;
    result.removedSamples.excludedByAllArticles = filterResult.removedSamples;
  }

  if (options.exclusionLists.reviewArticles && options.exclusionLists.reviewArticles.length > 0) {
    const exclusionSet = new Set(options.exclusionLists.reviewArticles.map(item => item.toLowerCase()));
    const filterResult = filterWithSamples(currentArticles, exclusionSet);
    currentArticles = filterResult.filtered;
    result.removedCount.excludedByReviewArticles = filterResult.removedCount;
    result.removedSamples.excludedByReviewArticles = filterResult.removedSamples;
  }

  if (options.exclusionLists.usefulArticles && options.exclusionLists.usefulArticles.length > 0) {
    const exclusionSet = new Set(options.exclusionLists.usefulArticles.map(item => item.toLowerCase()));
    const filterResult = filterWithSamples(currentArticles, exclusionSet);
    currentArticles = filterResult.filtered;
    result.removedCount.excludedByUsefulArticles = filterResult.removedCount;
    result.removedSamples.excludedByUsefulArticles = filterResult.removedSamples;
  }

  result.filteredArticles = currentArticles;
  return result;
}

/**
 * Parse multiple exclusion list files from file contents
 */
export function parseExclusionFiles(files: {
  allArticles?: string;
  reviewArticles?: string;
  usefulArticles?: string;
}): {
  allArticles?: string[];
  reviewArticles?: string[];
  usefulArticles?: string[];
} {
  const result: {
    allArticles?: string[];
    reviewArticles?: string[];
    usefulArticles?: string[];
  } = {};

  if (files.allArticles) {
    result.allArticles = Array.from(parseExclusionList(files.allArticles));
  }

  if (files.reviewArticles) {
    result.reviewArticles = Array.from(parseExclusionList(files.reviewArticles));
  }

  if (files.usefulArticles) {
    result.usefulArticles = Array.from(parseExclusionList(files.usefulArticles));
  }

  return result;
} 