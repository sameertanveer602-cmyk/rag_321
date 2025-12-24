// =============================================================================
// RAG SEARCH API ENDPOINT
// Exact implementation of RAGSearchRequest/RAGSearchResponse models
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { similaritySearch, generateRAGResponse } from '@/lib/langchain';
import { RAGSearchRequest, RAGSearchResponse } from '@/lib/types';

/**
 * RAG Search API Endpoint
 * 
 * Request Model (RAGSearchRequest):
 * - query: string (required) - The search query
 * - top_k?: number (default: 5) - Number of chunks to retrieve
 * - include_sources?: boolean (default: true) - Include source chunks in response
 * - metadata_filters?: dict - Filter by metadata fields
 * 
 * Response Model (RAGSearchResponse):
 * - answer: string - AI-generated answer based on retrieved context
 * - sources?: RetrievedChunk[] - Retrieved source chunks with scores
 * 
 * Flow:
 * 1. Embed query via LangChain Gemini embeddings
 * 2. Similarity search using pgvector + LangChain retriever
 * 3. Include metadata filters
 * 4. Reject irrelevant chunks below threshold
 * 5. Construct retrieval augmented prompt including sources + metadata
 * 6. Ask Gemini to avoid hallucination
 * 7. If tables present → keep table formatting
 * 8. If OCR text present → include references
 * 9. Return structured response
 */
export async function POST(request: NextRequest) {
  console.log('🔍 RAG search request received');
  
  try {
    // Parse and validate request
    const body: RAGSearchRequest = await request.json();
    const { 
      query, 
      top_k = 5, 
      include_sources = true, 
      metadata_filters 
    } = body;
    
    // Validate required fields
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and cannot be empty', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    
    if (top_k < 1 || top_k > 50) {
      return NextResponse.json(
        { error: 'top_k must be between 1 and 50', code: 'INVALID_TOP_K' },
        { status: 400 }
      );
    }
    
    console.log(`🔎 Query: "${query}"`);
    console.log(`📊 Retrieving top ${top_k} results`);
    console.log(`🏷️  Metadata filters:`, metadata_filters || 'none');
    
    // STEP 1: Perform vector similarity search using LangChain
    console.log('🧠 Performing vector similarity search...');
    const retrievedChunks = await similaritySearch(query.trim(), top_k, metadata_filters);
    
    if (retrievedChunks.length === 0) {
      console.log('⚠️  No relevant chunks found');
      const response: RAGSearchResponse = {
        answer: "I couldn't find any relevant information in the uploaded documents to answer your question. Please ensure you have uploaded relevant documents or try rephrasing your query with different keywords.",
        sources: include_sources ? [] : undefined
      };
      return NextResponse.json(response);
    }
    
    console.log(`✅ Found ${retrievedChunks.length} relevant chunks`);
    
    // STEP 2: Filter by minimum similarity threshold
    // Use lower threshold for multilingual content as embeddings may have different similarity patterns
    const minThreshold = 0.05; // Lowered threshold for better multilingual support
    const relevantChunks = retrievedChunks.filter(chunk => chunk.score >= minThreshold);
    
    if (relevantChunks.length === 0) {
      console.log(`⚠️  No chunks above similarity threshold (${minThreshold})`);
      const response: RAGSearchResponse = {
        answer: "The available documents don't contain sufficiently relevant information to answer your question accurately. Please try a different query or upload more relevant documents.",
        sources: include_sources ? retrievedChunks : undefined // Show all chunks even if below threshold
      };
      return NextResponse.json(response);
    }
    
    console.log(`✅ ${relevantChunks.length} chunks above similarity threshold`);
    
    // Log chunk details for debugging
    relevantChunks.forEach((chunk, index) => {
      const type = chunk.metadata?.extraction_type || 'unknown';
      const filename = chunk.metadata?.source_filename || 'unknown';
      console.log(`📄 Chunk ${index + 1}: ${type} from ${filename} (score: ${chunk.score.toFixed(3)})`);
    });
    
    // STEP 3: Generate RAG response using Gemini LLM
    console.log('🤖 Generating RAG response...');
    const answer = await generateRAGResponse(query.trim(), relevantChunks);
    console.log(`✅ Generated response (${answer.length} characters)`);
    
    // STEP 4: Build structured response
    const response: RAGSearchResponse = {
      answer,
      sources: include_sources ? relevantChunks : undefined
    };
    
    console.log('🎉 RAG search completed successfully');
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ RAG search failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'RAG search failed',
        code: 'SEARCH_ERROR'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check and API documentation
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/rag-search',
    method: 'POST',
    description: 'Semantic search with RAG response generation',
    request_model: {
      query: 'string (required) - The search query',
      top_k: 'number (optional, default: 5) - Number of chunks to retrieve',
      include_sources: 'boolean (optional, default: true) - Include source chunks',
      metadata_filters: 'object (optional) - Filter by metadata fields'
    },
    response_model: {
      answer: 'string - AI-generated answer',
      sources: 'RetrievedChunk[] (optional) - Source chunks with scores'
    },
    example_request: {
      query: "What are the main topics discussed in the documents?",
      top_k: 5,
      include_sources: true,
      metadata_filters: {
        extraction_type: "text"
      }
    }
  });
}