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
 * Chunk extracted content using LangChain RecursiveCharacterTextSplitter
 * Each extraction type is chunked separately as per requirements
 */
export async function chunkContent(
  extractedContent: ExtractedContent[],
  chunkSize: number = 500,
  chunkOverlap: number = 50
): Promise<ProcessedChunk[]> {
  console.log(`🔄 Chunking ${extractedContent.length} extracted elements...`);
  console.log(`📏 Chunk size: ${chunkSize}, overlap: ${chunkOverlap}`);
  
  const processedChunks: ProcessedChunk[] = [];
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
  });
  
  for (let i = 0; i < extractedContent.length; i++) {
    const content = extractedContent[i];
    console.log(`📄 Chunking element ${i + 1}/${extractedContent.length} (${content.type})`);
    
    try {
      if (content.type === 'table') {
        // Special handling for tables - preserve row/column structure
        const tableChunks = await chunkTableContent(content, textSplitter);
        processedChunks.push(...tableChunks);
      } else {
        // Standard text chunking for other types
        const chunks = await textSplitter.splitText(content.text);
        
        chunks.forEach((chunk, chunkIndex) => {
          processedChunks.push({
            text: chunk,
            metadata: {
              ...content.metadata,
              chunk_index: chunkIndex,
              total_chunks: chunks.length
            }
          });
        });
      }
    } catch (error) {
      console.error(`❌ Error chunking content element ${i + 1}:`, error);
      // Add as single chunk if chunking fails
      processedChunks.push({
        text: content.text,
        metadata: {
          ...content.metadata,
          chunk_index: 0,
          total_chunks: 1,
          chunking_error: true
        }
      });
    }
  }
  
  console.log(`✅ Created ${processedChunks.length} chunks from ${extractedContent.length} elements`);
  return processedChunks;
}

/**
 * Special chunking for table content to preserve structure
 */
async function chunkTableContent(
  tableContent: ExtractedContent,
  textSplitter: RecursiveCharacterTextSplitter
): Promise<ProcessedChunk[]> {
  const chunks: ProcessedChunk[] = [];
  const tableText = tableContent.text;
  const rows = tableText.split('\n').filter(row => row.trim());
  
  if (rows.length <= 1) {
    // Single row or empty table - use standard chunking
    const textChunks = await textSplitter.splitText(tableText);
    textChunks.forEach((chunk, index) => {
      chunks.push({
        text: chunk,
        metadata: {
          ...tableContent.metadata,
          chunk_index: index,
          total_chunks: textChunks.length
        }
      });
    });
    return chunks;
  }
  
  // Multi-row table - chunk by rows while preserving structure
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const row of rows) {
    const testChunk = currentChunk ? `${currentChunk}\n${row}` : row;
    
    if (testChunk.length > 500 && currentChunk) {
      // Current chunk is full, save it and start new one
      chunks.push({
        text: currentChunk,
        metadata: {
          ...tableContent.metadata,
          chunk_index: chunkIndex++,
          is_table_chunk: true
        }
      });
      currentChunk = row;
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
        total_chunks: chunkIndex + 1
      }
    });
  }
  
  return chunks;
}

// =============================================================================
// INDIVIDUAL EMBEDDING PROCESSING (NO BATCHING)
// =============================================================================

/**
 * Process embeddings one by one and store using LangChain SupabaseVectorStore
 * CRITICAL: Individual processing to avoid Gemini API 100-request batch limit
 */
/**
 * Process embeddings one by one and store using LangChain SupabaseVectorStore
 * CRITICAL: Individual processing to avoid Gemini API 100-request batch limit
 * Using LangChain's proper vector storage which handles vector types correctly
 */
export async function storeDocumentsWithEmbeddings(
  chunks: ProcessedChunk[],
  documentUuid: string
): Promise<void> {
  console.log(`🚀 Processing ${chunks.length} chunks with individual embeddings...`);
  console.log(`📋 Document UUID: ${documentUuid}`);
  console.log('⚠️  Using individual embedding calls to avoid batch limits');
  console.log('🔧 Using LangChain SupabaseVectorStore for proper vector storage');
  
  const vectorStore = getVectorStore();
  const startTime = Date.now();
  
  // Process chunks one by one using LangChain SupabaseVectorStore
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const progress = `${i + 1}/${chunks.length}`;
    
    console.log(`📝 Processing chunk ${progress}: ${chunk.text.substring(0, 50)}...`);
    
    try {
      // Create LangChain Document with metadata
      const document = new Document({
        pageContent: chunk.text,
        metadata: {
          ...chunk.metadata,
          doc_uuid: documentUuid, // Store UUID in metadata for reference
          chunk_id: `${documentUuid}-${chunk.metadata.chunk_index}`,
        }
      });
      
      // Use LangChain SupabaseVectorStore - this should handle vector storage properly
      await vectorStore.addDocuments([document]);
      
      console.log(`✅ Chunk ${progress} processed and stored via LangChain`);
      
      // Small delay to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Progress update every 10 chunks
      if ((i + 1) % 10 === 0) {
        const elapsed = Date.now() - startTime;
        const rate = (i + 1) / (elapsed / 1000);
        console.log(`📊 Progress: ${i + 1}/${chunks.length} (${rate.toFixed(1)} chunks/sec)`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to process chunk ${progress}:`, error);
      
      // If LangChain fails, the issue might be with the doc_id foreign key
      // Let's try to work around this by temporarily making doc_id nullable
      console.log(`🔄 Retrying chunk ${progress} with workaround...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        // Try direct insertion with string format as fallback
        const embeddings = getEmbeddings();
        const embedding = await embeddings.embedQuery(chunk.text);
        
        const { error: directError } = await supabaseAdmin
          .from('document_chunks')
          .insert({
            doc_id: documentUuid,
            content: chunk.text,
            embedding: `[${embedding.join(',')}]`, // Store as string format
            metadata: {
              ...chunk.metadata,
              doc_uuid: documentUuid,
              chunk_id: `${documentUuid}-${chunk.metadata.chunk_index}`,
            }
          });
        
        if (directError) {
          throw new Error(`Direct insertion failed: ${directError.message}`);
        }
        
        console.log(`✅ Chunk ${progress} processed via direct insertion`);
      } catch (retryError) {
        console.error(`❌ Chunk ${progress} failed after retry:`, retryError);
        throw new Error(`Failed to process chunk ${i + 1} after retry: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
      }
    }
  }
  
  const totalTime = Date.now() - startTime;
  const avgTime = totalTime / chunks.length;
  
  console.log(`✅ Successfully processed all ${chunks.length} chunks`);
  console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(1)}s (avg: ${avgTime.toFixed(0)}ms/chunk)`);
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
 * Enhanced for multilingual content support
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
  
  console.log(`🌐 Detected primary language: ${primaryLanguage}${isMultilingual ? ' (multilingual content)' : ''}`);
  
  // Build context from retrieved chunks with structure information
  const context = retrievedChunks
    .map((chunk, index) => {
      const metadata = chunk.metadata || {};
      const sourceInfo = [
        `Source ${index + 1}: ${metadata.source_filename || 'Document'}`,
        metadata.extraction_type && `Type: ${metadata.extraction_type}`,
        metadata.page_number && `Page: ${metadata.page_number}`,
        metadata.table_index !== undefined && `Table: ${metadata.table_index}`,
        metadata.chapter && `Chapter: "${metadata.chapter}"`,
        metadata.section && `Section: "${metadata.section}"`
      ].filter(Boolean).join(', ');
      
      // Add structure context to the chunk text
      let structuredText = chunk.text;
      if (metadata.chapter || metadata.section) {
        const structurePrefix = [];
        if (metadata.chapter) structurePrefix.push(`Chapter: ${metadata.chapter}`);
        if (metadata.section) structurePrefix.push(`Section: ${metadata.section}`);
        structuredText = `[${structurePrefix.join(' | ')}]\n${chunk.text}`;
      }
      
      return `[${sourceInfo} | Relevance: ${(chunk.score * 100).toFixed(1)}%]\n${structuredText}\n`;
    })
    .join('\n---\n\n');
  
  // Construct multilingual RAG prompt
  const languageInstructions = getLanguageInstructions(primaryLanguage, isMultilingual);
  
  const prompt = `You are an expert AI assistant that provides accurate answers based on retrieved source material in multiple languages.

MULTILINGUAL INSTRUCTIONS:
${languageInstructions}

GENERAL INSTRUCTIONS:
- Answer the question using ONLY the information provided in the sources below
- Be precise and factual - do not hallucinate or add information not in the sources
- When citing sources, ALWAYS include chapter and section information when available
- Use this format for citations: [Source N: Chapter "Chapter Name", Section "Section Name"]
- If no chapter/section info is available, use: [Source N]
- If the sources contain tables, preserve the table structure in your response
- If the sources contain OCR text from images, reference it appropriately
- If the sources don't contain sufficient information to answer the question, say so clearly
- Organize your response by chapter and section when multiple sources span different parts of the document

RETRIEVED SOURCES:
${context}

QUESTION: ${query}

ANSWER:`;

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
  
  // Check if query is asking about tables
  const isTableQuery = /table|טבלה|נתונים|מחירים|רשימה|סכום|מספרים|תוצאות|דוח|סטטיסטיקה/i.test(query);
  const hasTableContent = retrievedChunks.some(chunk => chunk.metadata?.extraction_type === 'table');
  
  console.log(`📊 Table query detected: ${isTableQuery}, Has table content: ${hasTableContent}`);
  
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
      
      // Add content type information
      if (metadata.extraction_type === 'table') {
        sourceInfo += ` | TYPE: TABLE DATA`;
      } else if (metadata.extraction_type === 'image_ocr') {
        sourceInfo += ` | TYPE: OCR FROM IMAGE`;
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
      if (metadata.extraction_type === 'table') {
        structuredText = formatTableForDisplay(structuredText, primaryLanguage);
      }
      
      return `[${sourceInfo}]\n${structuredText}\n`;
    })
    .join('\n---\n\n');
  
  // Get language-specific instructions with enhanced table handling
  const languageInstructions = getLanguageInstructions(primaryLanguage, isMultilingual, isTableQuery, hasTableContent);
  
  // Construct chat prompt with history and structure awareness
  const prompt = `You are a helpful AI assistant in a conversation. Use the retrieved sources to answer questions accurately.

MULTILINGUAL INSTRUCTIONS:
${languageInstructions}

GENERAL INSTRUCTIONS:
- Answer based on the retrieved sources and conversation context
- Be conversational but accurate - don't hallucinate
- When referencing sources, include chapter and section information when available
- Use natural language for citations like "According to Chapter X, Section Y..." or "As mentioned in the [Chapter Name] section..."
- Consider the conversation history for context
- Organize information by document structure when helpful

${isTableQuery || hasTableContent ? `
TABLE FORMATTING INSTRUCTIONS:
- When presenting table data, preserve the original table structure and formatting
- For Hebrew tables, maintain right-to-left text direction where appropriate
- Use clear column separators (|) and row breaks for table display
- Include Hebrew currency symbols (₪) and numbers as they appear in the source
- When translating table headers, provide both Hebrew and English when helpful
- Preserve numerical data exactly as it appears in the source
- If table data is incomplete or unclear, mention this limitation
` : ''}

${historyText ? `CONVERSATION HISTORY:\n${historyText}\n\n` : ''}RETRIEVED SOURCES:
${context}

CURRENT QUESTION: ${query}

RESPONSE:`;

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
 */
function formatTableForDisplay(tableText: string, primaryLanguage: string): string {
  if (!tableText || !tableText.trim()) return tableText;
  
  // Split into lines and process each line
  const lines = tableText.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length === 0) return tableText;
  
  // Detect if this looks like a table (has multiple columns)
  const hasTabSeparators = lines.some(line => line.includes('\t'));
  const hasMultipleSpaces = lines.some(line => /\s{2,}/.test(line));
  const hasPipeSeparators = lines.some(line => line.includes('|'));
  
  if (!hasTabSeparators && !hasMultipleSpaces && !hasPipeSeparators) {
    return tableText; // Not a table, return as-is
  }
  
  // Process table formatting
  const formattedLines = lines.map(line => {
    // Handle different separator types
    let columns: string[];
    
    if (hasPipeSeparators) {
      columns = line.split('|').map(col => col.trim()).filter(col => col);
    } else if (hasTabSeparators) {
      columns = line.split('\t').map(col => col.trim()).filter(col => col);
    } else {
      // Split on multiple spaces
      columns = line.split(/\s{2,}/).map(col => col.trim()).filter(col => col);
    }
    
    // For Hebrew content, ensure proper spacing and currency formatting
    if (primaryLanguage === 'hebrew') {
      columns = columns.map(col => {
        // Fix Hebrew currency formatting
        col = col.replace(/(\d)\s*₪/g, '$1₪');
        col = col.replace(/₪\s*(\d)/g, '₪$1');
        
        // Ensure proper spacing around Hebrew text
        col = col.replace(/([a-zA-Z0-9])([א-ת])/g, '$1 $2');
        col = col.replace(/([א-ת])([a-zA-Z0-9])/g, '$1 $2');
        
        return col.trim();
      });
    }
    
    // Join columns with consistent separator
    return '| ' + columns.join(' | ') + ' |';
  });
  
  // Add table header separator for better formatting
  if (formattedLines.length > 1) {
    const headerSeparator = '|' + formattedLines[0].split('|').slice(1, -1).map(() => '---').join('|') + '|';
    formattedLines.splice(1, 0, headerSeparator);
  }
  
  return formattedLines.join('\n');
}

/**
 * Get language-specific instructions for the LLM
 */
function getLanguageInstructions(
  primaryLanguage: string, 
  isMultilingual: boolean, 
  isTableQuery: boolean = false, 
  hasTableContent: boolean = false
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
  
  let instructions = '';
  
  if (isMultilingual) {
    instructions = `- The sources contain content in multiple languages, with ${primaryLangName} being primary
- RESPOND in the same language as the user's question when possible
- If the user asks in English but sources are in ${primaryLangName}, provide the answer in English but include original text citations
- If the user asks in ${primaryLangName}, respond in ${primaryLangName}
- Always preserve the original language of direct quotes and citations
- When translating concepts, provide both the original term and translation when helpful`;
  } else {
    instructions = `- The sources are primarily in ${primaryLangName}
- RESPOND in the same language as the user's question
- If the user asks in English but sources are in ${primaryLangName}, provide a helpful English response based on the ${primaryLangName} content
- If the user asks in ${primaryLangName}, respond in ${primaryLangName}
- Always preserve the original language of direct quotes and citations
- Do not say "no information found" if you have relevant content in ${primaryLangName} - use and translate it appropriately`;
  }
  
  // Add Hebrew-specific table instructions
  if ((isTableQuery || hasTableContent) && primaryLanguage === 'hebrew') {
    instructions += `

HEBREW TABLE SPECIFIC INSTRUCTIONS:
- When presenting Hebrew table data, maintain the original Hebrew text and numbers
- Preserve Hebrew currency symbols (₪) and their positioning
- Keep Hebrew column headers in Hebrew with English translations in parentheses when helpful
- Maintain right-to-left text flow for Hebrew content within tables
- Use clear table formatting with | separators between columns
- Present numerical data exactly as it appears in the Hebrew source
- When explaining table content, use Hebrew terms for financial/business concepts when they appear in the source
- Example table format:
  | שם המוצר (Product Name) | מחיר (Price) | כמות (Quantity) |
  |------------------------|-------------|----------------|
  | מוצר א                  | 100₪       | 5              |`;
  }
  
  return instructions;
}