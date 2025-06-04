# Advanced Article Import Features

## Overview

The screening app now includes advanced import capabilities that allow you to:

1. **Import PubMed files** with automatic parsing
2. **Filter out articles from exclusion lists** (`all_articles.txt`, `review_articles.txt`, `useful_articles.txt`)
3. **Remove duplicate articles** automatically based on PMID and title similarity
4. **Get detailed filtering statistics** showing what was removed

## How to Use

### 1. Access Advanced Import

1. Go to the Dashboard
2. Select a project
3. Find the "Advanced Article Import" section
4. This is located below the standard "Import Articles" section

### 2. Upload Your PubMed File

- Upload a `.txt` file in PubMed format (with PMID- entries)
- The file should contain articles with the standard PubMed structure:

  ```
  PMID- 12345678
  TI  - Article Title Here
  AB  - Abstract text here...

  PMID- 23456789
  TI  - Another Article Title
  AB  - Another abstract...
  ```

### 3. Upload Exclusion Lists (Optional)

Upload any or all of these exclusion list files:

#### All Articles (`all_articles.txt`)

- Contains articles that have already been processed
- Can include PMIDs, titles, or mixed content

#### Review Articles (`review_articles.txt`)

- Contains review articles to exclude (systematic reviews, meta-analyses, etc.)
- Useful for filtering out secondary research

#### Useful Articles (`useful_articles.txt`)

- Contains articles already identified as useful/relevant
- Excludes articles you already know should be included

### 4. Configure Options

- **Remove Duplicates**: Check this box to automatically remove duplicate articles based on PMID and title similarity

### 5. Process Articles

Click "Process Articles" to:

1. Parse the PubMed file
2. Apply exclusion filters
3. Remove duplicates (if selected)
4. Save filtered articles to your project

## Exclusion File Format

Exclusion files support multiple formats:

```txt
# Comments start with # and are ignored

# 1. Just PMID numbers:
12345678
23456789

# 2. PMID format:
PMID-34567890
PMID-45678901

# 3. Article titles (full or partial):
systematic review of alzheimer disease
meta-analysis of cognitive interventions

# 4. Mixed format is supported
56789012
longitudinal study of brain aging
PMID-67890123
```

## Sample Files

Sample exclusion files are provided in the `sample_exclusion_files/` directory:

- `all_articles.txt` - Example of previously processed articles
- `review_articles.txt` - Example of review article patterns
- `useful_articles.txt` - Example of already identified useful articles

## Filtering Results

After processing, you'll see detailed statistics:

- Total articles processed
- Articles remaining after filtering
- Number of duplicates removed
- Number of articles excluded by each exclusion list

## Tips

1. **Start with review filtering**: Upload a `review_articles.txt` file with common review patterns to automatically exclude secondary research
2. **Use partial title matching**: You don't need complete titles - partial matches work well
3. **Combine with duplicate removal**: Always enable duplicate removal for cleaner results
4. **Review filtering results**: Check the detailed statistics to ensure filtering worked as expected

## Technical Details

- **Duplicate detection**: Based on normalized PMID and title comparison
- **Title matching**: Case-insensitive with text normalization
- **Batch processing**: Large files are processed in batches for optimal performance
- **Error handling**: Detailed error messages help identify issues with file formats

## Troubleshooting

### Common Issues

1. **No articles found**: Ensure your PubMed file uses the correct format with `PMID-` entries
2. **Too many articles excluded**: Check your exclusion lists for overly broad patterns
3. **File format errors**: Ensure all files are `.txt` format with UTF-8 encoding

### Support

If you encounter issues:

1. Check the console for detailed error messages
2. Verify file formats match the expected structure
3. Start with smaller test files to validate the process
