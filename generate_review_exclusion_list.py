#!/usr/bin/env python3
"""
Generate a complete exclusion list of review articles from MEDLINE format files.
This script uses the same logic as your PubMedAnalyzer but outputs a list suitable for the web app.
"""

import re
import argparse
from pathlib import Path


class ReviewExtractor:
    """Extract review articles from MEDLINE format files."""
    
    def __init__(self):
        self.review_articles = []
        
    def parse_medline_file(self, filepath):
        """Parse a MEDLINE format file and extract review articles."""
        print(f"Parsing file: {filepath}")
        
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
            content = file.read()
        
        # Split articles by empty lines
        article_blocks = re.split(r'\n\s*\n', content)
        
        for block in article_blocks:
            if block.strip():
                review_info = self._extract_if_review(block)
                if review_info:
                    self.review_articles.append(review_info)
        
        print(f"Found {len(self.review_articles)} review articles in {filepath}")
    
    def _extract_if_review(self, block):
        """Extract article info if it's a review article."""
        lines = block.strip().split('\n')
        
        pmid = ""
        title = ""
        publication_types = []
        current_field = None
        current_value = ""
        
        for line in lines:
            if line.startswith('PMID-'):
                pmid = line.split('-', 1)[1].strip()
            elif line.startswith('TI  -'):
                current_field = 'title'
                current_value = line.split('-', 1)[1].strip()
            elif line.startswith('PT  -'):
                pub_type = line.split('-', 1)[1].strip()
                publication_types.append(pub_type)
            elif line.startswith('      ') and current_field == 'title':
                # Continuation line for title
                current_value += " " + line.strip()
            else:
                # Save the current field value
                if current_field == 'title':
                    title = current_value
                current_field = None
                current_value = ""
        
        # Don't forget the last field
        if current_field == 'title':
            title = current_value
        
        # Check if this is a review article
        review_keywords = ['Review', 'Systematic Review', 'Meta-Analysis', 'review']
        is_review = any(keyword in publication_types for keyword in review_keywords)
        
        if is_review and pmid:
            return {
                'pmid': pmid,
                'title': title,
                'publication_types': publication_types
            }
        
        return None
    
    def export_for_webapp(self, filename, format_type='pmid'):
        """Export review articles in format suitable for web app exclusion list."""
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("# Review articles exclusion list\n")
            f.write("# Generated automatically from MEDLINE publication types\n")
            f.write(f"# Total reviews found: {len(self.review_articles)}\n")
            f.write("# Format: PMID per line\n\n")
            
            for article in self.review_articles:
                if format_type == 'pmid':
                    f.write(f"{article['pmid']}\n")
                elif format_type == 'pmid_with_title':
                    f.write(f"PMID-{article['pmid']} # {article['title'][:80]}{'...' if len(article['title']) > 80 else ''}\n")
                elif format_type == 'title':
                    f.write(f"{article['title']}\n")
        
        print(f"Exported {len(self.review_articles)} review articles to {filename}")
    
    def show_statistics(self):
        """Show statistics about found review articles."""
        if not self.review_articles:
            print("No review articles found.")
            return
        
        print(f"\nReview Articles Statistics:")
        print(f"Total review articles: {len(self.review_articles)}")
        
        # Count publication types
        all_types = []
        for article in self.review_articles:
            all_types.extend(article['publication_types'])
        
        from collections import Counter
        type_counts = Counter(all_types)
        
        print("\nPublication types found:")
        for pub_type, count in type_counts.most_common():
            if any(keyword.lower() in pub_type.lower() for keyword in ['review', 'meta']):
                print(f"  {pub_type}: {count}")
        
        # Show some examples
        print(f"\nFirst 5 review articles:")
        for i, article in enumerate(self.review_articles[:5]):
            print(f"  {i+1}. PMID {article['pmid']}: {article['title'][:60]}{'...' if len(article['title']) > 60 else ''}")
            print(f"     Types: {', '.join(article['publication_types'])}")


def main():
    parser = argparse.ArgumentParser(description='Extract review articles from MEDLINE files for web app exclusion list')
    parser.add_argument('files', nargs='+', help='MEDLINE files to analyze')
    parser.add_argument('--output', '-o', default='review_articles_exclusion.txt', 
                       help='Output file for exclusion list (default: review_articles_exclusion.txt)')
    parser.add_argument('--format', choices=['pmid', 'pmid_with_title', 'title'], default='pmid',
                       help='Output format: pmid (just PMIDs), pmid_with_title (PMIDs with comments), title (titles)')
    
    args = parser.parse_args()
    
    extractor = ReviewExtractor()
    
    # Parse all input files
    for filepath in args.files:
        if Path(filepath).exists():
            extractor.parse_medline_file(filepath)
        else:
            print(f"Warning: File {filepath} not found")
    
    # Show statistics
    extractor.show_statistics()
    
    # Export for web app
    if extractor.review_articles:
        extractor.export_for_webapp(args.output, args.format)
        print(f"\nUse this file in your web app as the 'Review Articles' exclusion list to get the same 136 reviews.")
    else:
        print("\nNo review articles found to export.")


if __name__ == "__main__":
    main() 