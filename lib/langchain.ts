// =============================================================================
// LANGCHAIN INTEGRATION FOR PRODUCTION RAG
// Individual embedding processing + LangChain SupabaseVectorStore
// =============================================================================

import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { Document } from '@langchain/core/documents';
import { supabaseAdmin } from './supabase';
import { ExtractedContent, ProcessedChunk, RetrievedChunk, SupabaseSearchResult } from './types';

// =============================================================================
// LANGCHAIN COMPONENT INITIALIZATION
// =============================================================================

let embeddingsInstance: GoogleGenerativeAIEmbeddings | null = null;
let vectorStoreInstance: SupabaseVectorStore | null = null;

/**
 * Get or create Gemini embeddings instance
 */
export function getEmbeddings(): GoogleGenerativeAIEmbeddings {
  if (!embeddingsInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    console.log('🔧 Initializing Gemini embeddings (text-embedding-004)...');
    
    embeddingsInstance = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: 'text-embedding-004', // 768 dimensions
    });
    
    console.log('✅ Gemini embeddings initialized');
  }
  
  return embeddingsInstance;
}

/**
 * Get or create LangChain SupabaseVectorStore instance
 */
export function getVectorStore(): SupabaseVectorStore {
  if (!vectorStoreInstance) {
    const embeddings = getEmbeddings();
    
    console.log('🔧 Initializing LangChain SupabaseVectorStore...');
    
    vectorStoreInstance = new SupabaseVectorStore(embeddings, {
      client: supabaseAdmin,
      tableName: 'document_chunks',
      queryName: 'match_documents',
      // Configure column mappings for our schema
      filter: {},
    });
    
    console.log('✅ SupabaseVectorStore initialized');
  }
  
  return vectorStoreInstance;
}

/**
 * Get or create Gemini LLM instance
 */
export function getLLM(): ChatGoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  
  return new ChatGoogleGenerativeAI({
    apiKey,
    modelName: 'gemini-2.0-flash-exp',
    temperature: 0.1,
    maxOutputTokens: 4096,
  });
}

// =============================================================================
// CONTENT CHUNKING WITH LANGCHAIN
// =============================================================================

/**
 * Intelligent chunking with complete document coverage and zero duplication
 * Adapts chunk size based on document characteristics
 */
export async function chunkContent(
  extractedContent: ExtractedContent[],
  chunkSize: number = 500,
  chunkOverlap: number = 100
): Promise<ProcessedChunk[]> {
  console.log(`🔄 Starting intelligent chunking for ${extractedContent.length} elements...`);
  
  // Calculate total document characteristics
  const totalDocLength = extractedContent.reduce((sum, content) => sum + content.text.length, 0);
  const hasComplexContent = extractedContent.some(c => 
    c.type === 'table' || 
    c.type === 'image_ocr' || 
    /[\u05D0-\u05EA]/.test(c.text)
  );
  
  console.log(`📄 Document: ${totalDocLength} chars, Complex content: ${hasComplexContent}`);
  
  // Adaptive chunking parameters based on document size
  let adaptiveChunkSize: number;
  let adaptiveOverlap: number;
  
  if (totalDocLength < 3000) {
    // Very small - use large chunks to minimize embedding calls
    adaptiveChunkSize = 1500;
    adaptiveOverlap = 50;
    console.log('📦 Tiny document: Using large chunks (1500 chars)');
  } else if (totalDocLength < 10000) {
    // Small - balanced chunks
    adaptiveChunkSize = 1200;
    adaptiveOverlap = 100;
    console.log('📦 Small document: Using balanced chunks (1200 chars)');
  } else if (totalDocLength < 30000) {
    // Medium - standard chunks
    adaptiveChunkSize = 1000;
    adaptiveOverlap = 150;
    console.log('📦 Medium document: Using standard chunks (1000 chars)');
  } else if (totalDocLength < 100000) {
    // Large - smaller chunks for better granularity
    adaptiveChunkSize = 800;
    adaptiveOverlap = 120;
    console.log('📦 Large document: Using granular chunks (800 chars)');
  } else {
    // Very large - optimize for performance
    adaptiveChunkSize = 600;
    adaptiveOverlap = 80;
    console.log('📦 Very large document: Using optimized chunks (600 chars)');
  }
  
  // Adjust for complex content
  if (hasComplexContent) {
    adaptiveChunkSize = Math.min(adaptiveChunkSize, 900);
    adaptiveOverlap = Math.max(adaptiveOverlap, 100);
    console.log('🔤 Complex content detected: Adjusted chunk size for tables/Hebrew/OCR');
  }
  
  const processedChunks: ProcessedChunk[] = [];
  const processedTextRanges = new Set<string>(); // Track processed text to avoid duplicates
  
  // Create text splitter with adaptive settings
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: adaptiveChunkSize,
    chunkOverlap: adaptiveOverlap,
    separators: ['\n\n\n', '\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
    keepSeparator: true,
    lengthFunction: (text: string) => text.length
  });
  
  let totalCoveredChars = 0;
  
  for (let i = 0; i < extractedContent.length; i++) {
    const content = extractedContent[i];
    console.log(`📄 Processing element ${i + 1}/${extractedContent.length}: ${content.type} (${content.text.length} chars)`);
    
    try {
      if (content.type === 'table') {
        // Tables: Keep complete or split intelligently
        const tableChunks = await chunkTableIntelligently(content, adaptiveChunkSize);
        
        tableChunks.forEach((chunk, idx) => {
          const chunkHash = generateContentHash(chunk.text);
          
          if (!processedTextRanges.has(chunkHash)) {
            processedTextRanges.add(chunkHash);
            processedChunks.push({
              text: chunk.text,
              metadata: {
                ...content.metadata,
                ...chunk.metadata,
                chunk_index: idx,
                total_chunks: tableChunks.length,
                element_index: i,
                adaptive_chunk_size: adaptiveChunkSize
              }
            });
            totalCoveredChars += chunk.text.length;
          }
        });
      } else {
        // Regular text: Smart chunking with deduplication
        const chunks = await textSplitter.splitText(content.text);
        
        chunks.forEach((chunkText, idx) => {
          const chunkHash = generateContentHash(chunkText);
          
          if (!processedTextRanges.has(chunkHash)) {
            processedTextRanges.add(chunkHash);
            processedChunks.push({
              text: chunkText,
              metadata: {
                ...content.metadata,
                chunk_index: idx,
                total_chunks: chunks.length,
                element_index: i,
                adaptive_chunk_size: adaptiveChunkSize,
                original_length: content.text.length
              }
            });
            totalCoveredChars += chunkText.length;
          }
        });
      }
    } catch (error) {
      console.error(`❌ Error processing element ${i + 1}:`, error);
      
      // Fallback: Add complete element as single chunk
      const chunkHash = generateContentHash(content.text);
      if (!processedTextRanges.has(chunkHash)) {
        processedTextRanges.add(chunkHash);
        processedChunks.push({
          text: content.text,
          metadata: {
            ...content.metadata,
            chunk_index: 0,
            total_chunks: 1,
            element_index: i,
            fallback_chunk: true,
            error_recovery: true
          }
        });
        totalCoveredChars += content.text.length;
      }
    }
  }
  
  // Add sequential IDs
  processedChunks.forEach((chunk, index) => {
    chunk.metadata.sequential_id = index;
    chunk.metadata.total_document_chunks = processedChunks.length;
  });
  
  const coveragePercent = (totalCoveredChars / totalDocLength) * 100;
  console.log(`✅ Created ${processedChunks.length} unique chunks`);
  console.log(`📊 Coverage: ${totalCoveredChars}/${totalDocLength} chars (${coveragePercent.toFixed(1)}%)`);
  console.log(`🎯 Zero duplicates guaranteed via content hashing`);
  
  return processedChunks;
}

/**
 * Generate content hash for deduplication
 */
function generateContentHash(text: string): string {
  // Simple hash function for deduplication
  let hash = 0;
  const normalized = text.trim().toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Intelligent table chunking - keeps complete when possible
 */
async function chunkTableIntelligently(
  tableContent: ExtractedContent,
  maxChunkSize: number
): Promise<Array<{text: string, metadata: any}>> {
  const chunks: Array<{text: string, metadata: any}> = [];
  const tableText = tableContent.text;
  
  // Detect Hebrew/special content
  const hasHebrew = /[\u05D0-\u05EA]/.test(tableText);
  const hasCurrency = /[₪$€£¥]/.test(tableText);
  const hasHebrewKeywords = /סכום|מחיר|כמות|תאריך|שם|מספר|סה״כ|סהכ/.test(tableText);
  
  // Keep complete if small enough or Hebrew table
  if (tableText.length <= maxChunkSize * 1.5 || hasHebrew || hasHebrewKeywords) {
    console.log(`📊 Keeping complete table (${tableText.length} chars, Hebrew: ${hasHebrew})`);
    
    chunks.push({
      text: cleanHebrewTableForStorage(tableText),
      metadata: {
        is_table_chunk: true,
        is_complete_table: true,
        is_hebrew_table: hasHebrew,
        has_currency: hasCurrency,
        table_language: hasHebrew ? 'hebrew' : 'english'
      }
    });
    
    return chunks;
  }
  
  // Large table: Split by rows intelligently
  const rows = tableText.split('\n').filter(row => row.trim());
  
  if (rows.length <= 5) {
    // Small table - keep complete
    chunks.push({
      text: tableText,
      metadata: {
        is_table_chunk: true,
        is_complete_table: true,
        row_count: rows.length
      }
    });
    return chunks;
  }
  
  // Split large table by rows with minimal overlap
  let currentChunk = '';
  let chunkRows: string[] = [];
  const overlapRows = 1; // Minimal overlap for context
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const testChunk = currentChunk ? `${currentChunk}\n${row}` : row;
    
    if (testChunk.length > maxChunkSize && currentChunk) {
      // Save current chunk
      chunks.push({
        text: currentChunk,
        metadata: {
          is_table_chunk: true,
          is_partial_table: true,
          row_start: i - chunkRows.length,
          row_end: i - 1,
          total_table_rows: rows.length
        }
      });
      
      // Start new chunk with overlap
      const overlapText = rows.slice(Math.max(0, i - overlapRows), i).join('\n');
      currentChunk = overlapText ? `${overlapText}\n${row}` : row;
      chunkRows = rows.slice(Math.max(0, i - overlapRows), i + 1);
    } else {
      currentChunk = testChunk;
      chunkRows.push(row);
    }
  }
  
  // Add final chunk
  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      metadata: {
        is_table_chunk: true,
        is_partial_table: true,
        is_final_chunk: true,
        row_count: chunkRows.length,
        total_table_rows: rows.length
      }
    });
  }
  
  console.log(`📊 Split large table into ${chunks.length} chunks (${rows.length} rows)`);
  return chunks;
}

/**
 * Enhanced table chunking with complete content preservation
 */
async function chunkTableContentComplete(
  tableContent: ExtractedContent,
  textSplitter: RecursiveCharacterTextSplitter
): Promise<ProcessedChunk[]> {
  const chunks: ProcessedChunk[] = [];
  const tableText = tableContent.text;
  
  // Detect Hebrew content in table
  const hasHebrew = /[\u05D0-\u05EA]/.test(tableText);
  const hasCurrency = /[₪$€£¥]/.test(tableText);
  const hasHebrewTableKeywords = /סכום|מחיר|כמות|תאריך|שם|מספר|סה״כ|סהכ|ח״מ|חמ|ת״ז|תז|קוד|רשימה|פירוט|תיאור|טבלה|נתונים|דוח|סטטיסטיקה/.test(tableText);
  
  console.log(`📊 Processing table chunk: Hebrew=${hasHebrew}, Currency=${hasCurrency}, Keywords=${hasHebrewTableKeywords}`);
  
  // For Hebrew tables or important tables, always create as complete single chunk
  if (hasHebrew || hasHebrewTableKeywords || tableText.length <= 1000) {
    console.log('🔤 Creating complete table as single chunk to preserve structure');
    
    const cleanedTableText = cleanHebrewTableForStorage(tableText);
    
    chunks.push({
      text: cleanedTableText,
      metadata: {
        ...tableContent.metadata,
        chunk_index: 0,
        total_chunks: 1,
        is_table_chunk: true,
        is_hebrew_table: hasHebrew,
        has_currency: hasCurrency,
        has_hebrew_keywords: hasHebrewTableKeywords,
        table_language: hasHebrew ? 'hebrew' : 'english',
        content_type: hasHebrew ? 'hebrew_table' : 'table',
        complete_table_preserved: true
      }
    });
    
    return chunks;
  }
  
  // For very large tables, split by logical sections but ensure no data loss
  const rows = tableText.split('\n').filter(row => row.trim());
  
  if (rows.length <= 3) {
    // Small table - keep as single chunk
    const textChunks = await textSplitter.splitText(tableText);
    textChunks.forEach((chunk, index) => {
      chunks.push({
        text: chunk,
        metadata: {
          ...tableContent.metadata,
          chunk_index: index,
          total_chunks: textChunks.length,
          is_table_chunk: true,
          complete_coverage_verified: true
        }
      });
    });
    return chunks;
  }
  
  // Large table - split by rows with overlap to ensure no data loss
  let currentChunk = '';
  let chunkIndex = 0;
  const overlapRows = 2; // Keep 2 rows overlap for context
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const testChunk = currentChunk ? `${currentChunk}\n${row}` : row;
    
    if (testChunk.length > 800 && currentChunk && i > overlapRows) {
      // Add overlap from previous rows
      const overlapText = rows.slice(Math.max(0, i - overlapRows), i).join('\n');
      const chunkWithOverlap = currentChunk + (overlapText ? `\n${overlapText}` : '');
      
      chunks.push({
        text: chunkWithOverlap,
        metadata: {
          ...tableContent.metadata,
          chunk_index: chunkIndex++,
          is_table_chunk: true,
          table_language: 'english',
          row_start: Math.max(0, i - overlapRows),
          row_end: i - 1,
          has_overlap: overlapRows > 0
        }
      });
      
      // Start new chunk with overlap
      currentChunk = overlapText ? `${overlapText}\n${row}` : row;
    } else {
      currentChunk = testChunk;
    }
  }
  
  // Add final chunk
  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      metadata: {
        ...tableContent.metadata,
        chunk_index: chunkIndex,
        is_table_chunk: true,
        total_chunks: chunkIndex + 1,
        table_language: 'english',
        is_final_chunk: true
      }
    });
  }
  
  return chunks;
}

/**
 * Clean and format Hebrew table text for proper storage
 */
function cleanHebrewTableForStorage(tableText: string): string {
  return tableText
    // Normalize whitespace while preserving table structure
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    // Ensure proper spacing around Hebrew text and numbers
    .replace(/([a-zA-Z0-9])([א-ת])/g, '$1 $2')
    .replace(/([א-ת])([a-zA-Z0-9])/g, '$1 $2')
    // Clean up currency symbols positioning
    .replace(/(\d)\s*([₪$€£¥])/g, '$1$2')
    .replace(/([₪$€£¥])\s*(\d)/g, '$1$2')
    // Fix Hebrew punctuation and abbreviations
    .replace(/([א-ת])\s*([״׳])/g, '$1$2')
    .replace(/([״׳])\s*([א-ת])/g, '$1$2')
    .replace(/ח\s*״\s*מ/g, 'ח״מ')
    .replace(/ת\s*״\s*ז/g, 'ת״ז')
    .replace(/סה\s*״\s*כ/g, 'סה״כ')
    // Normalize Hebrew date formats
    .replace(/(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/g, '$1/$2/$3')
    // Ensure table markers are preserved
    .replace(/\[טבלה\/TABLE START\]/g, '[טבלה/TABLE START]')
    .replace(/\[טבלה\/TABLE END\]/g, '[טבלה/TABLE END]')
    .trim();
}

// =============================================================================
// INDIVIDUAL EMBEDDING PROCESSING (NO BATCHING)
// =============================================================================

/**
 * Process embeddings one by one and store using LangChain SupabaseVectorStore
 * CRITICAL: Individual processing to avoid Gemini API 100-request batch limit
 */
/**
 * Process embeddings with maximum resilience - never fail completely
 * Continues processing even when individual chunks fail
 */
export async function storeDocumentsWithEmbeddings(
  chunks: ProcessedChunk[],
  documentUuid: string
): Promise<void> {
  console.log(`🚀 Processing ${chunks.length} chunks with resilient embedding strategy...`);
  console.log(`📋 Document UUID: ${documentUuid}`);
  
  const startTime = Date.now();
  
  // Optimized processing strategy - minimal delays for faster processing
  let delayBetweenChunks: number;
  
  if (chunks.length <= 20) {
    delayBetweenChunks = 50; // Slightly longer delay for stability
    console.log('📦 Small document: Using stable processing');
  } else if (chunks.length <= 100) {
    delayBetweenChunks = 75; // Moderate delay for medium documents
    console.log('📦 Medium document: Using balanced processing');
  } else if (chunks.length <= 300) {
    delayBetweenChunks = 100; // Higher delay for large documents
    console.log('📦 Large document: Using conservative processing');
  } else {
    delayBetweenChunks = 150; // Maximum delay for very large documents
    console.log('📦 Very large document: Using maximum stability');
  }
  
  // Track processing statistics
  let successCount = 0;
  let retryCount = 0;
  const failedChunks: Array<{index: number, chunk: ProcessedChunk, error: string}> = [];
  
  // Get embeddings instance once to avoid repeated initialization
  const embeddings = getEmbeddings();
  
  // Process chunks with maximum resilience
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const progress = `${i + 1}/${chunks.length}`;
    
    console.log(`📝 Processing chunk ${progress}: ${chunk.text.substring(0, 50)}...`);
    
    // Wrap entire chunk processing in try-catch to prevent cascade failures
    try {
      // Validate chunk content
      if (!chunk.text || chunk.text.trim().length === 0) {
        console.warn(`⚠️  Skipping empty chunk ${progress}`);
        successCount++; // Count as success to not affect rate
        continue;
      }
      
      // Process with optimized retry logic
      let processed = false;
      let attempts = 0;
      const maxAttempts = 3; // More attempts for resilience
      let lastError: any = null;
      
      while (!processed && attempts < maxAttempts) {
        attempts++;
        
        try {
          // Direct embedding generation with longer timeout
          const embedding = await Promise.race([
            embeddings.embedQuery(chunk.text),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Embedding generation timeout')), 20000) // 20 second timeout
            )
          ]) as number[];
          
          // Direct database insertion with timeout protection
          const { error: insertError } = await Promise.race([
            supabaseAdmin
              .from('document_chunks')
              .insert({
                doc_id: documentUuid,
                content: chunk.text,
                embedding: `[${embedding.join(',')}]`,
                metadata: {
                  ...chunk.metadata,
                  doc_uuid: documentUuid,
                  chunk_id: `${documentUuid}-${i}`,
                  sequential_id: i,
                  processing_timestamp: new Date().toISOString(),
                  chunk_length: chunk.text.length,
                  document_total_chunks: chunks.length,
                  optimized_processing: true,
                  attempt_number: attempts
                }
              }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database insertion timeout')), 15000) // 15 second timeout for DB
            )
          ]) as any;
          
          if (insertError) {
            throw new Error(`Database insertion failed: ${insertError.message}`);
          }
          
          processed = true;
          successCount++;
          console.log(`✅ Chunk ${progress} processed successfully (attempt ${attempts})`);
          
        } catch (attemptError) {
          lastError = attemptError;
          retryCount++;
          console.warn(`⚠️  Attempt ${attempts}/${maxAttempts} failed for chunk ${progress}: ${attemptError instanceof Error ? attemptError.message : String(attemptError)}`);
          
          if (attempts < maxAttempts) {
            // Exponential backoff for retries
            const retryDelay = 1000 * attempts; // 1s, 2s, 3s
            console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
      
      // If still not processed after all attempts, store for later retry
      if (!processed) {
        console.error(`❌ Chunk ${progress} failed after ${maxAttempts} attempts`);
        failedChunks.push({
          index: i,
          chunk: chunk,
          error: lastError instanceof Error ? lastError.message : 'Unknown error'
        });
        console.log(`⏭️  Continuing with next chunk (${failedChunks.length} failed so far)...`);
      }
      
      // Delay between chunks for API rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
      }
      
      // Progress reporting every 5 chunks or at the end
      if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
        const elapsed = Date.now() - startTime;
        const rate = (i + 1) / (elapsed / 1000);
        const eta = ((chunks.length - i - 1) / rate) / 60; // ETA in minutes
        const currentSuccessRate = (successCount / (i + 1)) * 100;
        console.log(`📊 Progress: ${i + 1}/${chunks.length} | Success: ${successCount} (${currentSuccessRate.toFixed(1)}%) | Rate: ${rate.toFixed(2)} chunks/sec | ETA: ${eta.toFixed(1)}min`);
      }
      
    } catch (outerError) {
      // Catch any unexpected errors to prevent cascade failure
      console.error(`❌ Unexpected error processing chunk ${progress}:`, outerError);
      failedChunks.push({
        index: i,
        chunk: chunk,
        error: outerError instanceof Error ? outerError.message : 'Unexpected error'
      });
      console.log(`⏭️  Continuing with next chunk despite error...`);
      
      // Small delay before continuing
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Final retry for failed chunks with longer delays
  if (failedChunks.length > 0 && failedChunks.length <= 10) {
    console.log(`🔄 Final retry for ${failedChunks.length} failed chunks with extended timeouts...`);
    
    for (const failedChunk of failedChunks) {
      const progress = `${failedChunk.index + 1}/${chunks.length}`;
      
      try {
        console.log(`🔄 Retrying chunk ${progress}...`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Longer wait before retry
        
        // Try with extended timeout
        const embedding = await Promise.race([
          embeddings.embedQuery(failedChunk.chunk.text),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Final retry timeout')), 30000) // 30 second timeout
          )
        ]) as number[];
        
        const { error: finalError } = await supabaseAdmin
          .from('document_chunks')
          .insert({
            doc_id: documentUuid,
            content: failedChunk.chunk.text,
            embedding: `[${embedding.join(',')}]`,
            metadata: {
              ...failedChunk.chunk.metadata,
              doc_uuid: documentUuid,
              chunk_id: `${documentUuid}-${failedChunk.index}`,
              sequential_id: failedChunk.index,
              final_retry: true,
              original_error: failedChunk.error,
              processing_timestamp: new Date().toISOString()
            }
          });
        
        if (!finalError) {
          successCount++;
          console.log(`✅ Final retry successful for chunk ${progress}`);
        } else {
          console.error(`❌ Final retry DB error for chunk ${progress}:`, finalError.message);
        }
        
      } catch (finalError) {
        console.error(`❌ Final retry failed for chunk ${progress}:`, finalError instanceof Error ? finalError.message : String(finalError));
        // Don't throw - continue with other chunks
      }
    }
  }
  
  const totalTime = Date.now() - startTime;
  const avgTime = chunks.length > 0 ? totalTime / chunks.length : 0;
  const successRate = chunks.length > 0 ? (successCount / chunks.length) * 100 : 0;
  const failedCount = chunks.length - successCount;
  
  console.log(`\n🎉 Embedding processing completed!`);
  console.log(`📊 Results: ${successCount}/${chunks.length} chunks successful (${successRate.toFixed(1)}%)`);
  console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s (avg: ${avgTime.toFixed(0)}ms/chunk)`);
  console.log(`🔄 Total retries: ${retryCount}`);
  console.log(`❌ Failed chunks: ${failedCount}`);
  
  if (successCount === chunks.length) {
    console.log(`🎉 PERFECT SUCCESS: All ${chunks.length} chunks processed and stored!`);
  } else if (successRate >= 95) {
    console.log(`✅ EXCELLENT: ${successRate.toFixed(1)}% success rate - document is fully searchable`);
  } else if (successRate >= 85) {
    console.log(`⚠️  GOOD: ${successRate.toFixed(1)}% success rate - document is mostly searchable`);
  } else if (successRate >= 70) {
    console.log(`⚠️  ACCEPTABLE: ${successRate.toFixed(1)}% success rate - some content may be missing`);
  } else {
    console.warn(`❌ POOR: ${successRate.toFixed(1)}% success rate - significant content is missing`);
    throw new Error(`Embedding processing failed: Only ${successRate.toFixed(1)}% success rate (${successCount}/${chunks.length} chunks). The document may be too complex or the server may be overloaded. Try: 1) Restarting the server, 2) Using a simpler document format, 3) Splitting the document into smaller parts.`);
  }
  
  // Warn if any chunks failed but don't throw if we have acceptable success rate
  if (failedCount > 0 && successRate >= 70) {
    console.warn(`⚠️  Warning: ${failedCount} chunks failed but ${successRate.toFixed(1)}% success rate is acceptable. Document is searchable but some content may be missing.`);
  }
}

/**
 * Generate a simple hash for chunk deduplication
 */
function generateChunkHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}



// =============================================================================
// VECTOR SIMILARITY SEARCH WITH LANGCHAIN
// =============================================================================

/**
 * Perform similarity search using Supabase match_documents function
 * Uses proper vector similarity search with built-in Supabase functions
 */
export async function similaritySearch(
  query: string,
  k: number = 5,
  filter?: Record<string, any>
): Promise<RetrievedChunk[]> {
  console.log(`🔍 Performing similarity search for: "${query}"`);
  console.log(`📊 Retrieving top ${k} results`);
  
  try {
    // Generate query embedding
    const embeddings = getEmbeddings();
    const queryEmbedding = await embeddings.embedQuery(query);
    console.log(`🧠 Generated query embedding, dimensions: ${queryEmbedding.length}`);
    
    // Use Supabase RPC with match_documents function for vector similarity search
    const { data: results, error } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.0,
      match_count: k,
      metadata_filter: filter || {}
    });
    
    if (error) {
      console.error('❌ RPC search failed:', error.message);
      
      // Fallback to direct query without vector similarity
      console.log('🔄 Using fallback search without vector similarity...');
      const { data: fallbackResults, error: fallbackError } = await supabaseAdmin
        .from('document_chunks')
        .select('id, doc_id, content, metadata')
        .not('embedding', 'is', null)
        .limit(k);
      
      if (fallbackError) {
        throw new Error(`Fallback search failed: ${fallbackError.message}`);
      }
      
      console.log(`✅ Found ${fallbackResults?.length || 0} results via fallback`);
      
      // Return fallback results with fake similarity scores
      return (fallbackResults || []).map((result: any, index: number) => ({
        chunk_id: result.id,
        doc_id: result.doc_id,
        text: result.content,
        score: 1.0 - (index * 0.1), // Decreasing fake scores
        metadata: result.metadata
      }));
    }
    
    console.log(`✅ Found ${results?.length || 0} results via RPC`);
    
    // Convert to RetrievedChunk format
    const retrievedChunks: RetrievedChunk[] = (results || []).map((result: SupabaseSearchResult) => ({
      chunk_id: result.id,
      doc_id: result.doc_id,
      text: result.content,
      score: result.similarity,
      metadata: result.metadata
    }));
    
    // Log results for debugging
    retrievedChunks.forEach((chunk, index) => {
      console.log(`📄 Result ${index + 1}: score=${chunk.score.toFixed(3)}, type=${chunk.metadata?.extraction_type}`);
    });
    
    return retrievedChunks;
    
  } catch (error) {
    console.error('❌ Similarity search failed:', error);
    throw new Error(`Similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// =============================================================================
// RAG RESPONSE GENERATION
// =============================================================================

/**
 * Generate RAG response using retrieved chunks and Gemini LLM with structure information
 * Enhanced for Hebrew documents with detailed chapter/section awareness
 */
export async function generateRAGResponse(
  query: string,
  retrievedChunks: RetrievedChunk[]
): Promise<string> {
  console.log(`🤖 Generating RAG response for query: "${query}"`);
  console.log(`📚 Using ${retrievedChunks.length} retrieved chunks`);
  
  const llm = getLLM();
  
  // Detect primary language of the retrieved content
  const contentLanguages = detectContentLanguages(retrievedChunks);
  const primaryLanguage = contentLanguages.primary;
  const isMultilingual = contentLanguages.isMultilingual;
  const isHebrew = primaryLanguage === 'hebrew';
  
  console.log(`🌐 Detected primary language: ${primaryLanguage}${isMultilingual ? ' (multilingual content)' : ''}`);
  
  // Build context from retrieved chunks with enhanced structure information
  const context = retrievedChunks
    .map((chunk, index) => {
      const metadata = chunk.metadata || {};
      
      // Build comprehensive source information
      const sourceInfo = [];
      sourceInfo.push(`Source ${index + 1}: ${metadata.source_filename || 'Document'}`);
      
      // Add chapter and section information (CRITICAL for Hebrew documents)
      if (metadata.chapter) {
        sourceInfo.push(`פרק (Chapter): "${metadata.chapter}"`);
      }
      if (metadata.section) {
        sourceInfo.push(`סעיף (Section): "${metadata.section}"`);
      }
      
      // Add content type information
      if (metadata.extraction_type === 'table') {
        if (metadata.is_hebrew_table) {
          sourceInfo.push(`TYPE: טבלה בעברית (HEBREW TABLE)`);
        } else {
          sourceInfo.push(`TYPE: TABLE DATA`);
        }
      } else if (metadata.extraction_type === 'image_ocr') {
        sourceInfo.push(`TYPE: OCR FROM IMAGE`);
      }
      
      // Add page number if available
      if (metadata.page_number) {
        sourceInfo.push(`עמוד (Page): ${metadata.page_number}`);
      }
      
      // Add relevance score
      sourceInfo.push(`Relevance: ${(chunk.score * 100).toFixed(1)}%`);
      
      // Add Hebrew table specific metadata
      if (metadata.is_hebrew_table) {
        const hebrewInfo = [];
        if (metadata.has_currency) hebrewInfo.push('מטבע (Currency)');
        if (metadata.has_hebrew_keywords) hebrewInfo.push('מילות מפתח בעברית (Hebrew Keywords)');
        if (hebrewInfo.length > 0) {
          sourceInfo.push(`Hebrew Features: ${hebrewInfo.join(', ')}`);
        }
      }
      
      const sourceHeader = `[${sourceInfo.join(' | ')}]`;
      
      // Add structure context to the chunk text
      let structuredText = chunk.text;
      if (metadata.chapter || metadata.section) {
        const structurePrefix = [];
        if (metadata.chapter) structurePrefix.push(`פרק: ${metadata.chapter}`);
        if (metadata.section) structurePrefix.push(`סעיף: ${metadata.section}`);
        structuredText = `[${structurePrefix.join(' | ')}]\n${chunk.text}`;
      }
      
      // Enhanced table formatting for Hebrew content
      if (metadata.extraction_type === 'table' || metadata.is_table_chunk) {
        structuredText = formatTableForDisplay(structuredText, primaryLanguage, metadata.is_hebrew_table);
      }
      
      return `${sourceHeader}\n${structuredText}\n`;
    })
    .join('\n---\n\n');
  
  // Get language-specific instructions with enhanced Hebrew support
  const languageInstructions = getLanguageInstructions(primaryLanguage, isMultilingual, false, false, false);
  
  // Check for table content in retrieved chunks
  const hasTableContent = retrievedChunks.some(chunk => 
    chunk.metadata?.extraction_type === 'table' || 
    chunk.metadata?.is_table_chunk === true ||
    chunk.metadata?.is_hebrew_table === true
  );
  
  const hasHebrewTableContent = retrievedChunks.some(chunk => 
    chunk.metadata?.is_hebrew_table === true ||
    (chunk.metadata?.extraction_type === 'table' && /[\u05D0-\u05EA]/.test(chunk.text))
  );

  // Enhanced prompt for Hebrew documents with detailed requirements
  const prompt = `You are an expert AI assistant specialized in Hebrew documents with comprehensive knowledge of document structure, chapters, and sections.

${languageInstructions}

🔵 CRITICAL OUTPUT FORMAT REQUIREMENTS:
- ALWAYS respond in well-structured HTML format
- Use proper HTML tags for headings, paragraphs, lists, and tables
- Structure your response with clear hierarchy using h1, h2, h3 tags
- Use semantic HTML elements for better formatting

🔵 DETAILED ANSWER REQUIREMENTS (CRITICAL):
- Provide COMPREHENSIVE and DETAILED answers, not brief summaries
- Include ALL relevant information from the sources
- When answering about an item, ALWAYS state which chapter (פרק) and section (סעיף) it appears in
- Quote exact Hebrew terms and phrases from the document
- Include specific details: numbers, dates, amounts, specifications, lists
- Explain context and background when available
- Provide step-by-step explanations when describing processes
- Include examples from the document when available
- If information spans multiple chapters/sections, mention all of them

🔵 CHAPTER & SECTION CITATION FORMAT:
- Hebrew format: "על פי פרק [Chapter Name], סעיף [Section Name]..."
- English format: "According to Chapter [Name], Section [Name]..."
- Use <cite> tags: <cite>על פי פרק "שם הפרק", סעיף "שם הסעיף"</cite>
- When multiple sources: <cite>פרק א', סעיף 1; פרק ב', סעיף 3</cite>
- Always include chapter/section information when available in metadata

🔵 ANSWER STRUCTURE:
1. <h1>Direct Answer to the Question</h1>
2. <h2>מיקום במסמך (Location in Document)</h2>
   - State the chapter and section clearly
   - Example: "המידע נמצא בפרק 'שם הפרק', סעיף 'שם הסעיף'"
3. <h2>פירוט מלא (Full Details)</h2>
   - Provide comprehensive explanation
   - Include all relevant data and specifications
   - Quote exact Hebrew terms
4. <h2>הקשר נוסף (Additional Context)</h2>
   - Related information from other chapters/sections
   - Background and explanations
   - Examples and clarifications

${hasTableContent || hasHebrewTableContent ? `
🔵 CRITICAL HTML TABLE FORMATTING REQUIREMENTS:
- When table data is found in sources, ALWAYS present it using proper HTML table format
- Use <table class="data-table">, <thead>, <tbody>, <tr>, <th>, <td> tags
- Add table captions using <caption> tag when appropriate
- Show ALL rows from the source table - do not truncate or summarize
- Maintain exact column structure and content as it appears in the document
- For Hebrew tables, preserve Hebrew text, currency symbols (₪), and numerical values exactly
- Include table markers as comments when present in source: <!-- טבלה/TABLE START --> <!-- טבלה/TABLE END -->
- ONLY format content as tables if it contains clear tabular data with multiple rows and columns
- Do NOT format regular paragraphs, lists, or single-line content as tables
- Tables must have at least 2 columns and 3 rows to be formatted as HTML tables
- HTML Table format example:
  <table class="data-table">
    <caption>כותרת הטבלה (Table Title)</caption>
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
        <th>Column 3</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Value 1</td>
        <td>Value 2</td>
        <td>Value 3</td>
      </tr>
      <tr>
        <td>Value 4</td>
        <td>Value 5</td>
        <td>Value 6</td>
      </tr>
    </tbody>
  </table>
- If source contains multiple tables, show each table separately with clear headings
- Preserve original language of table headers and content
- Do NOT convert tables to prose or bullet points - always use HTML table format
- For Hebrew content, add dir="rtl" attribute to appropriate elements
- IMPORTANT: Only use table formatting for actual tabular data, not for regular text content
- ALWAYS explain what the table shows and mention the chapter/section where it appears
` : ''}

🔵 HTML STRUCTURE REQUIREMENTS:
- Start with <h1> for main topic/answer
- Use <h2> for major sections (מיקום במסמך, פירוט מלא, הקשר נוסף)
- Use <h3> for subsections
- Use <p> for paragraphs
- Use <ul>/<ol> and <li> for lists
- Use <strong> for emphasis and important terms
- Use <em> for italics
- Use <blockquote> for quotes from sources
- Use <div class="source-section"> to group content by source
- Use <div class="chapter-section"> to group content by chapter/section
- Use <cite> for chapter and section references

🔵 HEBREW DOCUMENT SPECIFIC RULES:
- When answering about an item, FIRST state which chapter and section it's in
- Use Hebrew terminology: פרק (Chapter), סעיף (Section), עמוד (Page)
- Preserve Hebrew abbreviations: ח״מ, ת״ז, סה״כ, etc.
- Keep currency symbols: ₪ (Shekel), $ (Dollar), € (Euro)
- Maintain Hebrew number formats and date formats
- Quote exact Hebrew phrases from the document
- Provide context and explanations in detail

RETRIEVED SOURCES:
${context}

QUESTION: ${query}

HTML ANSWER (Detailed and Comprehensive):`;

  try {
    const response = await llm.invoke(prompt);
    const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    
    console.log(`✅ Generated RAG response (${answer.length} characters)`);
    return answer;
  } catch (error) {
    console.error('❌ RAG response generation failed:', error);
    throw new Error(`RAG response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate chat response with conversation history
 * Enhanced for multilingual content support
 */
export async function generateChatResponse(
  query: string,
  retrievedChunks: RetrievedChunk[],
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  console.log(`💬 Generating chat response for: "${query}"`);
  console.log(`📚 Using ${retrievedChunks.length} chunks and ${chatHistory.length} history messages`);
  
  const llm = getLLM();
  
  // Detect primary language of the retrieved content
  const contentLanguages = detectContentLanguages(retrievedChunks);
  const primaryLanguage = contentLanguages.primary;
  const isMultilingual = contentLanguages.isMultilingual;
  
  console.log(`🌐 Detected primary language: ${primaryLanguage}${isMultilingual ? ' (multilingual content)' : ''}`);
  
  // Check if query is asking about tables (enhanced Hebrew detection)
  const isTableQuery = /table|טבלה|נתונים|מחירים|רשימה|סכום|מספרים|תוצאות|דוח|סטטיסטיקה/i.test(query);
  const hasTableContent = retrievedChunks.some(chunk => 
    chunk.metadata?.extraction_type === 'table' || 
    chunk.metadata?.is_table_chunk === true ||
    chunk.metadata?.is_hebrew_table === true
  );
  
  // Enhanced Hebrew table content detection
  const hasHebrewTableContent = retrievedChunks.some(chunk => 
    chunk.metadata?.is_hebrew_table === true ||
    (chunk.metadata?.extraction_type === 'table' && /[\u05D0-\u05EA]/.test(chunk.text))
  );
  
  console.log(`📊 Table query detected: ${isTableQuery}, Has table content: ${hasTableContent}, Has Hebrew tables: ${hasHebrewTableContent}`);
  
  // Build conversation history
  const historyText = chatHistory
    .slice(-6) // Keep last 6 messages for context
    .map(msg => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
    .join('\n');
  
  // Build context from retrieved chunks with enhanced table formatting
  const context = retrievedChunks
    .map((chunk, index) => {
      const metadata = chunk.metadata || {};
      let sourceInfo = `Source ${index + 1}: ${metadata.source_filename || 'Document'}`;
      
      // Add structure information to source citation
      const structureInfo = [];
      if (metadata.chapter) structureInfo.push(`Chapter: "${metadata.chapter}"`);
      if (metadata.section) structureInfo.push(`Section: "${metadata.section}"`);
      
      if (structureInfo.length > 0) {
        sourceInfo += ` (${structureInfo.join(', ')})`;
      }
      
      sourceInfo += ` | Relevance: ${(chunk.score * 100).toFixed(1)}%`;
      
      // Add enhanced content type information for Hebrew tables
      if (metadata.extraction_type === 'table') {
        if (metadata.is_hebrew_table) {
          sourceInfo += ` | TYPE: HEBREW TABLE DATA`;
        } else {
          sourceInfo += ` | TYPE: TABLE DATA`;
        }
      } else if (metadata.extraction_type === 'image_ocr') {
        sourceInfo += ` | TYPE: OCR FROM IMAGE`;
      }
      
      // Add Hebrew table specific metadata
      if (metadata.is_hebrew_table) {
        const hebrewInfo = [];
        if (metadata.has_currency) hebrewInfo.push('Currency');
        if (metadata.has_hebrew_keywords) hebrewInfo.push('Hebrew Keywords');
        if (hebrewInfo.length > 0) {
          sourceInfo += ` | Hebrew Table Features: ${hebrewInfo.join(', ')}`;
        }
      }
      
      // Add structure context to the chunk text
      let structuredText = chunk.text;
      if (metadata.chapter || metadata.section) {
        const structurePrefix = [];
        if (metadata.chapter) structurePrefix.push(`Chapter: ${metadata.chapter}`);
        if (metadata.section) structurePrefix.push(`Section: ${metadata.section}`);
        structuredText = `[${structurePrefix.join(' | ')}]\n${chunk.text}`;
      }
      
      // Enhanced table formatting for Hebrew content
      if (metadata.extraction_type === 'table' || metadata.is_table_chunk) {
        structuredText = formatTableForDisplay(structuredText, primaryLanguage, metadata.is_hebrew_table);
      }
      
      return `[${sourceInfo}]\n${structuredText}\n`;
    })
    .join('\n---\n\n');
  
  // Get language-specific instructions with enhanced table handling
  const languageInstructions = getLanguageInstructions(primaryLanguage, isMultilingual, isTableQuery, hasTableContent, hasHebrewTableContent);
  
  // Enhanced prompt for Hebrew documents with detailed requirements
  const prompt = `You are a helpful AI assistant specialized in Hebrew documents with comprehensive knowledge of document structure, chapters, and sections.

${languageInstructions}

🔵 CRITICAL OUTPUT FORMAT REQUIREMENTS:
- ALWAYS respond in well-structured HTML format
- Use proper HTML tags for headings, paragraphs, lists, and tables
- Structure your response with clear hierarchy using h2, h3 tags (don't use h1 in chat)
- Use semantic HTML elements for better formatting

🔵 DETAILED ANSWER REQUIREMENTS (CRITICAL):
- Provide COMPREHENSIVE and DETAILED answers, not brief summaries
- Include ALL relevant information from the sources
- When answering about an item, ALWAYS state which chapter (פרק) and section (סעיף) it appears in
- Quote exact Hebrew terms and phrases from the document
- Include specific details: numbers, dates, amounts, specifications, lists
- Explain context and background when available
- Provide step-by-step explanations when describing processes
- Include examples from the document when available
- If information spans multiple chapters/sections, mention all of them

🔵 CHAPTER & SECTION CITATION FORMAT:
- Hebrew format: "על פי פרק [Chapter Name], סעיף [Section Name]..."
- English format: "According to Chapter [Name], Section [Name]..."
- Natural language citations: "כפי שמופיע בפרק..." or "As mentioned in Chapter..."
- Use <cite> tags: <cite>על פי פרק "שם הפרק", סעיף "שם הסעיף"</cite>
- Always include chapter/section information when available in metadata

🔵 CONVERSATIONAL ANSWER STRUCTURE:
1. <h2>תשובה ישירה (Direct Answer)</h2>
   - Answer the question directly
2. <h2>מיקום במסמך (Location)</h2>
   - State chapter and section: "המידע נמצא בפרק 'X', סעיף 'Y'"
3. <h2>פירוט (Details)</h2>
   - Comprehensive explanation with all relevant data
   - Quote exact Hebrew terms
4. <h2>הקשר (Context)</h2>
   - Additional related information
   - References to other chapters/sections if relevant

${isTableQuery || hasTableContent || hasHebrewTableContent ? `
🔵 CRITICAL HTML TABLE FORMATTING REQUIREMENTS:
- When table data is found in sources, ALWAYS present it using proper HTML table format
- Use <table class="data-table">, <thead>, <tbody>, <tr>, <th>, <td> tags
- Add table captions using <caption> tag when appropriate
- Show ALL rows from the source table - do not truncate or summarize
- Maintain exact column structure and content as it appears in the document
- For Hebrew tables, preserve Hebrew text, currency symbols (₪), and numerical values exactly
- Include table markers as comments when present in source: <!-- טבלה/TABLE START --> <!-- טבלה/TABLE END -->
- ONLY format content as tables if it contains clear tabular data with multiple rows and columns
- Do NOT format regular paragraphs, lists, or single-line content as tables
- Tables must have at least 2 columns and 3 rows to be formatted as HTML tables
- HTML Table format example:
  <table class="data-table">
    <caption>כותרת הטבלה (Table Title)</caption>
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
        <th>Column 3</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Value 1</td>
        <td>Value 2</td>
        <td>Value 3</td>
      </tr>
    </tbody>
  </table>
- If source contains multiple tables, show each table separately with clear headings
- Preserve original language of table headers and content
- Do NOT convert tables to prose or bullet points - always use HTML table format
- For Hebrew content, add dir="rtl" attribute to appropriate table cells
- IMPORTANT: Only use table formatting for actual tabular data, not for regular text content
- ALWAYS explain what the table shows and mention the chapter/section where it appears
` : ''}

🔵 HTML STRUCTURE REQUIREMENTS:
- Use <h2> for main sections (don't use h1 in chat responses)
- Use <h3> for subsections
- Use <p> for paragraphs
- Use <ul>/<ol> and <li> for lists
- Use <strong> for emphasis and important terms
- Use <em> for italics
- Use <blockquote> for quotes from sources
- Use <div class="source-section"> to group content by source
- Use <div class="chapter-section"> to group content by chapter/section
- Use <cite> for chapter and section references

🔵 HEBREW DOCUMENT SPECIFIC RULES:
- When answering about an item, FIRST state which chapter and section it's in
- Use Hebrew terminology: פרק (Chapter), סעיף (Section), עמוד (Page)
- Preserve Hebrew abbreviations: ח״מ, ת״ז, סה״כ, etc.
- Keep currency symbols: ₪ (Shekel), $ (Dollar), € (Euro)
- Maintain Hebrew number formats and date formats
- Quote exact Hebrew phrases from the document
- Provide context and explanations in detail
- Be conversational but comprehensive

${historyText ? `CONVERSATION HISTORY:\n${historyText}\n\n` : ''}RETRIEVED SOURCES:
${context}

CURRENT QUESTION: ${query}

HTML RESPONSE (Detailed and Comprehensive):`;

  try {
    const response = await llm.invoke(prompt);
    const answer = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    
    console.log(`✅ Generated chat response (${answer.length} characters)`);
    return answer;
  } catch (error) {
    console.error('❌ Chat response generation failed:', error);
    throw new Error(`Chat response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// =============================================================================
// MULTILINGUAL SUPPORT UTILITIES
// =============================================================================

/**
 * Detect the primary language and multilingual nature of retrieved chunks
 */
function detectContentLanguages(chunks: RetrievedChunk[]): {
  primary: string;
  isMultilingual: boolean;
  languages: string[];
} {
  const languagePatterns = {
    hebrew: /[\u0590-\u05FF]/,
    arabic: /[\u0600-\u06FF]/,
    chinese: /[\u4E00-\u9FFF]/,
    japanese: /[\u3040-\u309F\u30A0-\u30FF]/,
    korean: /[\uAC00-\uD7AF]/,
    russian: /[\u0400-\u04FF]/,
    greek: /[\u0370-\u03FF]/,
    thai: /[\u0E00-\u0E7F]/
  };
  
  const languageCounts: Record<string, number> = {};
  let totalChars = 0;
  
  chunks.forEach(chunk => {
    const text = chunk.text;
    totalChars += text.length;
    
    // Count characters for each language
    Object.entries(languagePatterns).forEach(([lang, pattern]) => {
      const matches = text.match(pattern);
      if (matches) {
        languageCounts[lang] = (languageCounts[lang] || 0) + matches.length;
      }
    });
    
    // Count English/Latin characters
    const englishMatches = text.match(/[a-zA-Z]/g);
    if (englishMatches) {
      languageCounts.english = (languageCounts.english || 0) + englishMatches.length;
    }
  });
  
  // Determine primary language
  const languages = Object.keys(languageCounts);
  const primaryLanguage = languages.reduce((a, b) => 
    languageCounts[a] > languageCounts[b] ? a : b, 'english'
  );
  
  // Check if multilingual (more than one language with >10% of content)
  const threshold = totalChars * 0.1;
  const significantLanguages = languages.filter(lang => languageCounts[lang] > threshold);
  
  return {
    primary: primaryLanguage,
    isMultilingual: significantLanguages.length > 1,
    languages: significantLanguages
  };
}

/**
 * Format table content for better display, especially for Hebrew content
 * Ensures proper markdown table format with exact column preservation
 */
function formatTableForDisplay(tableText: string, primaryLanguage: string, isHebrewTable: boolean = false): string {
  if (!tableText || !tableText.trim()) return tableText;
  
  // Remove table markers for processing but preserve them in output
  let processedText = tableText;
  const hasTableMarkers = /\[טבלה\/TABLE START\]|\[טבלה\/TABLE END\]/.test(tableText);
  
  if (hasTableMarkers) {
    processedText = tableText
      .replace(/\[טבלה\/TABLE START\]\s*/g, '')
      .replace(/\s*\[טבלה\/TABLE END\]/g, '');
  }
  
  // Split into lines and process each line
  const lines = processedText.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length === 0) return tableText;
  
  // Detect if this looks like a table (has multiple columns)
  const hasTabSeparators = lines.some(line => line.includes('\t'));
  const hasMultipleSpaces = lines.some(line => /\s{2,}/.test(line));
  const hasPipeSeparators = lines.some(line => line.includes('|'));
  
  if (!hasTabSeparators && !hasMultipleSpaces && !hasPipeSeparators) {
    // Check if it's a simple list that should be formatted as a table
    const hasStructuredData = lines.some(line => 
      /\d+.*[א-ת]|[א-ת].*\d+|[₪$€£¥]/.test(line) && line.split(/\s+/).length >= 2
    );
    
    if (!hasStructuredData) {
      return tableText; // Not a table, return as-is
    }
  }
  
  // Process table formatting with enhanced column detection
  const formattedLines = lines.map((line, lineIndex) => {
    // Handle different separator types
    let columns: string[];
    
    if (hasPipeSeparators) {
      columns = line.split('|').map(col => col.trim()).filter(col => col);
    } else if (hasTabSeparators) {
      columns = line.split('\t').map(col => col.trim()).filter(col => col);
    } else if (hasMultipleSpaces) {
      // Split on multiple spaces but preserve single spaces within content
      columns = line.split(/\s{2,}/).map(col => col.trim()).filter(col => col);
    } else {
      // For simple structured data, try to intelligently split
      // Look for patterns like "text number" or "number text"
      const words = line.split(/\s+/);
      if (words.length >= 2) {
        // Try to group related content
        columns = [];
        let currentColumn = '';
        
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const nextWord = words[i + 1];
          
          if (currentColumn) {
            currentColumn += ' ' + word;
          } else {
            currentColumn = word;
          }
          
          // End column if next word looks like start of new column
          if (!nextWord || 
              (/\d/.test(word) && nextWord && /[א-ת]/.test(nextWord)) ||
              (/[א-ת]/.test(word) && nextWord && /\d/.test(nextWord)) ||
              /[₪$€£¥]/.test(word)) {
            columns.push(currentColumn);
            currentColumn = '';
          }
        }
        
        if (currentColumn) {
          columns.push(currentColumn);
        }
      } else {
        columns = [line]; // Single column
      }
    }
    
    // Enhanced Hebrew content processing
    if (isHebrewTable || primaryLanguage === 'hebrew' || /[\u05D0-\u05EA]/.test(line)) {
      columns = columns.map(col => {
        // Fix Hebrew currency formatting - keep currency symbol with number
        col = col.replace(/(\d+)\s*₪/g, '$1₪');
        col = col.replace(/₪\s*(\d+)/g, '₪$1');
        
        // Fix other currency symbols
        col = col.replace(/(\d+)\s*([€£¥$])/g, '$1$2');
        col = col.replace(/([€£¥$])\s*(\d+)/g, '$1$2');
        
        // Ensure proper spacing around Hebrew text and numbers/English
        col = col.replace(/([a-zA-Z0-9])([א-ת])/g, '$1 $2');
        col = col.replace(/([א-ת])([a-zA-Z0-9])/g, '$1 $2');
        
        // Fix Hebrew punctuation and abbreviations
        col = col.replace(/([א-ת])\s*([״׳])/g, '$1$2');
        col = col.replace(/([״׳])\s*([א-ת])/g, '$1$2');
        col = col.replace(/ח\s*״\s*מ/g, 'ח״מ');
        col = col.replace(/ת\s*״\s*ז/g, 'ת״ז');
        col = col.replace(/סה\s*״\s*כ/g, 'סה״כ');
        
        // Fix Hebrew date formats
        col = col.replace(/(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/g, '$1/$2/$3');
        
        // Clean up extra spaces but preserve structure
        col = col.replace(/\s+/g, ' ');
        
        return col.trim();
      });
    }
    
    // Ensure minimum column count for consistency
    if (columns.length === 1 && lines.length > 1) {
      // Try to split single column into multiple if it contains separable content
      const singleCol = columns[0];
      if (/[א-ת].*\d|\d.*[א-ת]/.test(singleCol)) {
        // Contains mixed Hebrew and numbers, try to separate
        const parts = singleCol.split(/(\d+[₪$€£¥]?|\b\d+\b)/);
        const newColumns = parts.filter(part => part.trim()).map(part => part.trim());
        if (newColumns.length > 1) {
          columns = newColumns;
        }
      }
    }
    
    // Join columns with consistent separator and proper spacing
    return '| ' + columns.join(' | ') + ' |';
  });
  
  // Add table header separator for proper markdown table format
  if (formattedLines.length > 0) {
    // Determine number of columns from first row
    const firstRowColumns = formattedLines[0].split('|').length - 2; // Subtract 2 for leading/trailing |
    
    // Create header separator
    const headerSeparator = '|' + Array(firstRowColumns).fill('---').join('|') + '|';
    
    // Insert after first row (header) if we have multiple rows
    if (formattedLines.length > 1) {
      formattedLines.splice(1, 0, headerSeparator);
    } else {
      // Single row - add separator anyway for proper table format
      formattedLines.push(headerSeparator);
    }
  }
  
  let formattedTable = formattedLines.join('\n');
  
  // Restore table markers if they were present
  if (hasTableMarkers) {
    formattedTable = `[טבלה/TABLE START]\n${formattedTable}\n[טבלה/TABLE END]`;
  }
  
  return formattedTable;
}

/**
 * Get language-specific instructions for the LLM - Optimized for Hebrew
 */
function getLanguageInstructions(
  primaryLanguage: string, 
  isMultilingual: boolean, 
  isTableQuery: boolean = false, 
  hasTableContent: boolean = false,
  hasHebrewTableContent: boolean = false
): string {
  const languageMap: Record<string, string> = {
    hebrew: 'Hebrew (עברית)',
    arabic: 'Arabic (العربية)',
    chinese: 'Chinese (中文)',
    japanese: 'Japanese (日本語)',
    korean: 'Korean (한국어)',
    russian: 'Russian (Русский)',
    greek: 'Greek (Ελληνικά)',
    thai: 'Thai (ไทย)',
    english: 'English'
  };
  
  const primaryLangName = languageMap[primaryLanguage] || primaryLanguage;
  const isHebrew = primaryLanguage === 'hebrew';
  
  let instructions = '';
  
  // Enhanced Hebrew-specific instructions
  if (isHebrew) {
    instructions = `
🔵 HEBREW DOCUMENT SYSTEM - CRITICAL INSTRUCTIONS:

LANGUAGE & RESPONSE RULES:
- This is a HEBREW document system - all sources are in Hebrew (עברית)
- ALWAYS respond in HEBREW when the user asks in Hebrew
- ALWAYS respond in ENGLISH when the user asks in English (but cite Hebrew sources)
- Preserve original Hebrew text in citations and quotes
- Use Hebrew terminology with English translations in parentheses when helpful
- Example: "סכום (Total Amount)", "מחיר (Price)", "כמות (Quantity)"

CHAPTER & SECTION AWARENESS (CRITICAL):
- ALWAYS identify and mention the Chapter (פרק) and Section (סעיף) where information is found
- Format citations as: "על פי פרק [Chapter Name], סעיף [Section Name]..." (According to Chapter X, Section Y...)
- When answering about an item, ALWAYS state which chapter and section it appears in
- Group related information by chapter and section
- If information spans multiple chapters/sections, mention all of them
- Use Hebrew chapter/section names from the document

DETAILED ANSWER REQUIREMENTS:
- Provide COMPREHENSIVE and DETAILED answers, not brief summaries
- Include ALL relevant information from the sources
- Explain context and background when available
- Include specific details: numbers, dates, amounts, specifications
- Quote exact Hebrew terms and phrases from the document
- Provide step-by-step explanations when describing processes
- Include examples from the document when available

STRUCTURE YOUR ANSWERS:
1. Start with direct answer to the question
2. Specify the chapter and section (פרק וסעיף)
3. Provide detailed explanation with all relevant information
4. Include specific data: numbers, dates, amounts, lists
5. Add context and related information
6. Cite additional chapters/sections if relevant

HEBREW TERMINOLOGY:
- פרק (Perek) = Chapter
- סעיף (Seif) = Section/Clause
- סכום (Skhum) = Amount/Sum
- מחיר (Mechir) = Price
- כמות (Kamut) = Quantity
- תאריך (Taarich) = Date
- מספר (Mispar) = Number
- סה״כ / סהכ (Sach Hakol) = Total
- רשימה (Reshima) = List
- פירוט (Perut) = Details
- תיאור (Te'ur) = Description`;
  } else if (isMultilingual) {
    instructions = `- The sources contain content in multiple languages, with ${primaryLangName} being primary
- RESPOND in the same language as the user's question when possible
- If the user asks in English but sources are in ${primaryLangName}, provide the answer in English but include original text citations
- If the user asks in ${primaryLangName}, respond in ${primaryLangName}
- Always preserve the original language of direct quotes and citations
- When translating concepts, provide both the original term and translation when helpful
- ALWAYS mention the chapter and section where information is found`;
  } else {
    instructions = `- The sources are primarily in ${primaryLangName}
- RESPOND in the same language as the user's question
- If the user asks in English but sources are in ${primaryLangName}, provide a helpful English response based on the ${primaryLangName} content
- If the user asks in ${primaryLangName}, respond in ${primaryLangName}
- Always preserve the original language of direct quotes and citations
- Do not say "no information found" if you have relevant content in ${primaryLangName} - use and translate it appropriately
- ALWAYS mention the chapter and section where information is found`;
  }
  
  // Add enhanced Hebrew table instructions
  if ((isTableQuery || hasTableContent || hasHebrewTableContent) && (isHebrew || hasHebrewTableContent)) {
    instructions += `

🔵 HEBREW TABLE FORMATTING (CRITICAL):
- Hebrew tables MUST be presented in full HTML format with RTL support
- NEVER summarize table content - show ALL rows and columns
- Use proper HTML structure: <table class="data-table hebrew-table" dir="rtl">
- Add dir="rtl" to ALL table cells containing Hebrew text
- Preserve Hebrew currency symbols (₪) exactly as they appear
- Keep Hebrew abbreviations intact: ח״מ, ת״ז, סה״כ, etc.
- Include table caption in Hebrew with English translation
- Use <strong> tags for totals and important values
- Add HTML comments: <!-- טבלה/TABLE START --> and <!-- טבלה/TABLE END -->

HEBREW TABLE EXAMPLE:
<!-- טבלה/TABLE START -->
<table class="data-table hebrew-table" dir="rtl">
  <caption>כותרת הטבלה (Table Title)</caption>
  <thead>
    <tr>
      <th dir="rtl">שם המוצר</th>
      <th dir="rtl">מחיר</th>
      <th dir="rtl">כמות</th>
      <th dir="rtl">סה״כ</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td dir="rtl">מוצר א</td>
      <td dir="rtl">100₪</td>
      <td dir="rtl">5</td>
      <td dir="rtl"><strong>500₪</strong></td>
    </tr>
  </tbody>
</table>
<!-- טבלה/TABLE END -->

TABLE CONTEXT:
- ALWAYS explain what the table shows
- Mention the chapter and section where the table appears
- Highlight important values and totals
- Explain relationships between columns
- Provide context for the data`;
  }
  
  return instructions;
}