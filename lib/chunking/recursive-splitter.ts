/**
 * Recursive Character Text Splitter with Chinese awareness
 * Implements hierarchical splitting strategy for semantic boundary preservation
 */

export interface RecursiveSplitterOptions {
  /** Target chunk size in tokens (default: 400) */
  chunkSize: number;
  /** Overlap between chunks in tokens (default: 60) */
  chunkOverlap: number;
  /** Custom separators in priority order */
  separators?: string[];
  /** Function to estimate token count */
  lengthFunction?: (text: string) => number;
}

export interface ChunkResult {
  /** Chunk content */
  content: string;
  /** Estimated token count */
  tokenCount: number;
  /** Content hash for deduplication */
  contentHash: string;
  /** Chunk index in document */
  index: number;
}

/**
 * Chinese-aware default separators (hierarchical priority)
 * Prioritizes semantic boundaries over arbitrary splits
 */
const DEFAULT_SEPARATORS = [
  "\n\n",           // Paragraphs (highest priority)
  "\n",             // Lines
  "。",             // Chinese period
  "！",             // Chinese exclamation
  "？",             // Chinese question mark
  "；",             // Chinese semicolon
  ". ",             // English period (with space to avoid decimals)
  "! ",             // English exclamation
  "? ",             // English question mark
  "; ",             // English semicolon
  "，",             // Chinese comma
  ", ",             // English comma
  " ",              // Space (word boundary)
  "",               // Character level (fallback)
];

/**
 * Estimate token count for mixed Chinese/English text
 * Chinese characters typically map to 1-2 tokens
 * English words typically map to 1-4 tokens
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  // Count Chinese characters (CJK Unified Ideographs)
  const chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  
  // Count other characters (remove Chinese first)
  const nonChineseText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ");
  const words = nonChineseText.split(/\s+/).filter(w => w.length > 0);
  
  // Estimation: Chinese ~1.5 tokens/char, English ~1.3 tokens/word
  return Math.ceil(chineseChars * 1.5 + words.length * 1.3);
}

/**
 * Compute a simple hash for content deduplication
 */
export function computeContentHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Recursive Character Text Splitter
 * 
 * Splits text hierarchically using a list of separators, trying each one
 * in order until chunks are small enough. This preserves semantic boundaries
 * like paragraphs and sentences when possible.
 */
export class RecursiveCharacterSplitter {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly separators: string[];
  private readonly lengthFunction: (text: string) => number;

  constructor(options: Partial<RecursiveSplitterOptions> = {}) {
    this.chunkSize = options.chunkSize ?? 400;
    this.chunkOverlap = options.chunkOverlap ?? 60;
    this.separators = options.separators ?? DEFAULT_SEPARATORS;
    this.lengthFunction = options.lengthFunction ?? estimateTokenCount;
  }

  /**
   * Split text into chunks with overlap
   */
  split(text: string): ChunkResult[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = this.splitText(text.trim(), this.separators);
    const mergedChunks = this.mergeSplits(chunks);
    
    return mergedChunks.map((content, index) => ({
      content,
      tokenCount: this.lengthFunction(content),
      contentHash: computeContentHash(content),
      index,
    }));
  }

  /**
   * Recursively split text using separators
   */
  private splitText(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];
    
    // Find the appropriate separator
    let separator = separators[separators.length - 1]; // Default to last (character-level)
    let newSeparators: string[] = [];
    
    for (let i = 0; i < separators.length; i++) {
      const sep = separators[i];
      if (sep === "") {
        separator = sep;
        break;
      }
      if (text.includes(sep)) {
        separator = sep;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    // Split by the chosen separator
    const splits = this.splitBySeparator(text, separator);
    
    // Process each split
    const goodSplits: string[] = [];
    
    for (const split of splits) {
      if (this.lengthFunction(split) < this.chunkSize) {
        goodSplits.push(split);
      } else {
        // If we have accumulated good splits, merge them first
        if (goodSplits.length > 0) {
          const merged = this.mergeSplits(goodSplits);
          finalChunks.push(...merged);
          goodSplits.length = 0;
        }
        
        // Recursively split the large chunk
        if (newSeparators.length === 0) {
          // No more separators, force split by character count
          finalChunks.push(...this.forceSplit(split));
        } else {
          const subChunks = this.splitText(split, newSeparators);
          finalChunks.push(...subChunks);
        }
      }
    }
    
    // Merge any remaining good splits
    if (goodSplits.length > 0) {
      const merged = this.mergeSplits(goodSplits);
      finalChunks.push(...merged);
    }
    
    return finalChunks;
  }

  /**
   * Split text by separator while preserving the separator
   */
  private splitBySeparator(text: string, separator: string): string[] {
    if (separator === "") {
      // Character-level split
      return Array.from(text);
    }
    
    const splits = text.split(separator);
    const result: string[] = [];
    
    for (let i = 0; i < splits.length; i++) {
      const part = splits[i];
      if (i < splits.length - 1) {
        // Add separator back to maintain context
        result.push(part + separator);
      } else if (part) {
        result.push(part);
      }
    }
    
    return result.filter(s => s.length > 0);
  }

  /**
   * Force split text when no separators work
   */
  private forceSplit(text: string): string[] {
    const chunks: string[] = [];
    const targetCharCount = this.chunkSize * 2; // Approximate chars per chunk
    
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + targetCharCount, text.length);
      
      // Try to find a good break point
      if (end < text.length) {
        const searchStart = Math.max(start, end - 50);
        const searchText = text.substring(searchStart, end);
        
        // Look for any punctuation or space to break at
        const breakPoints = [" ", "，", ",", "。", ".", "！", "!", "？", "?"];
        let bestBreak = -1;
        
        for (const bp of breakPoints) {
          const idx = searchText.lastIndexOf(bp);
          if (idx > bestBreak) {
            bestBreak = idx;
          }
        }
        
        if (bestBreak > 0) {
          end = searchStart + bestBreak + 1;
        }
      }
      
      const chunk = text.substring(start, end).trim();
      if (chunk) {
        chunks.push(chunk);
      }
      
      start = end;
    }
    
    return chunks;
  }

  /**
   * Merge small splits into chunks with overlap
   */
  private mergeSplits(splits: string[]): string[] {
    if (splits.length === 0) return [];
    
    const chunks: string[] = [];
    const separator = " "; // Use space to join splits
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    
    for (const split of splits) {
      const splitLength = this.lengthFunction(split);
      
      // Check if adding this split would exceed chunk size
      if (currentLength + splitLength > this.chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(this.joinSplits(currentChunk));
        
        // Start new chunk with overlap
        const overlapChunks = this.getOverlapSplits(currentChunk);
        currentChunk = overlapChunks;
        currentLength = this.lengthFunction(this.joinSplits(currentChunk));
      }
      
      currentChunk.push(split);
      currentLength += splitLength;
    }
    
    // Add the last chunk
    if (currentChunk.length > 0) {
      chunks.push(this.joinSplits(currentChunk));
    }
    
    return chunks.map(c => c.trim()).filter(c => c.length > 0);
  }

  /**
   * Get splits that should overlap into the next chunk
   */
  private getOverlapSplits(splits: string[]): string[] {
    if (this.chunkOverlap <= 0 || splits.length === 0) {
      return [];
    }
    
    const result: string[] = [];
    let totalLength = 0;
    
    // Work backwards from the end
    for (let i = splits.length - 1; i >= 0; i--) {
      const split = splits[i];
      const splitLength = this.lengthFunction(split);
      
      if (totalLength + splitLength > this.chunkOverlap) {
        break;
      }
      
      result.unshift(split);
      totalLength += splitLength;
    }
    
    return result;
  }

  /**
   * Join splits with appropriate spacing
   */
  private joinSplits(splits: string[]): string {
    // Intelligent joining: don't add space if split already ends with punctuation/newline
    let result = "";
    
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      
      if (i === 0) {
        result = split;
      } else {
        const lastChar = result[result.length - 1];
        const needsSpace = !/[\s\n。！？；，.!?;,]$/.test(lastChar);
        result += (needsSpace ? " " : "") + split;
      }
    }
    
    return result;
  }
}

/**
 * Convenience function to split document with default settings
 */
export function splitDocument(
  content: string,
  options?: Partial<RecursiveSplitterOptions>
): ChunkResult[] {
  const splitter = new RecursiveCharacterSplitter(options);
  return splitter.split(content);
}
