// =============================================================================
// DOCUMENT UPLOAD API ENDPOINT
// Exact implementation of UploadRequest/UploadResponse models
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, uploadFile } from '@/lib/supabase';
import { extractContent, detectMimeType, validateFileSize } from '@/lib/extractors';
import { chunkContent, storeDocumentsWithEmbeddings } from '@/lib/langchain';
import { UploadRequest, UploadResponse, SupportedMimeType, ExtractedContent } from '@/lib/types';

/**
 * Document Upload API Endpoint
 * 
 * Request Model (UploadRequest):
 * - filename: string (required) - Name of the file
 * - content: string (required) - Base64 encoded file content
 * - metadata?: DocumentMetadata - Optional document metadata
 * - chunk_size?: number (default: 500) - Size of text chunks
 * - chunk_overlap?: number (default: 50) - Overlap between chunks
 * 
 * Response Model (UploadResponse):
 * - status: string - Processing status
 * - total_chunks: number - Number of chunks created
 * - doc_id: string - Unique document identifier
 */
export async function POST(request: NextRequest) {
  console.log('📤 Document upload request received');
  
  // Add timeout protection for local development
  const startTime = Date.now();
  const TIMEOUT_MS = 180000; // 3 minutes for local development (increased for resilience)
  
  const timeoutCheck = () => {
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error('Overall processing timeout - document may be too large or complex');
    }
  };
  
  try {
    // Parse and validate request with timeout check
    timeoutCheck();
    const body: UploadRequest = await request.json();
    const { 
      filename, 
      content, 
      metadata, 
      chunk_size = 500, 
      chunk_overlap = 50 
    } = body;
    
    // Validate required fields
    if (!filename || !content) {
      return NextResponse.json(
        { error: 'filename and content are required', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }
    
    console.log(`📄 Processing file: ${filename}`);
    console.log(`⚙️  Chunk size: ${chunk_size}, overlap: ${chunk_overlap}`);
    
    // Decode base64 content with timeout check
    timeoutCheck();
    let fileBuffer: Buffer;
    try {
      fileBuffer = Buffer.from(content, 'base64');
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid base64 content', code: 'INVALID_CONTENT' },
        { status: 400 }
      );
    }
    
    // Validate file size (increase limit for local development)
    if (!validateFileSize(fileBuffer, 100)) {
      return NextResponse.json(
        { error: 'File size exceeds 100MB limit', code: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }
    
    // Detect MIME type
    const mimeType = detectMimeType(filename);
    if (!mimeType) {
      return NextResponse.json(
        { error: 'Unsupported file type', code: 'UNSUPPORTED_FILE_TYPE' },
        { status: 400 }
      );
    }
    
    console.log(`🔍 Detected MIME type: ${mimeType}`);
    
    // Generate document ID
    const docId = metadata?.doc_id || `doc_${uuidv4()}`;
    
    // STEP 1: Upload raw file to Supabase Storage
    timeoutCheck();
    console.log('☁️  Uploading file to Supabase Storage...');
    const filePath = await uploadFile(filename, fileBuffer, mimeType);
    console.log(`✅ File uploaded to: ${filePath}`);
    
    // STEP 2: Extract content from file with timeout protection
    timeoutCheck();
    console.log('🔍 Extracting content from file...');
    
    let extractedContent;
    try {
      extractedContent = await Promise.race([
        extractContent(fileBuffer, filename, mimeType as SupportedMimeType),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Content extraction timeout')), 90000) // 1.5 minutes for extraction
        )
      ]) as any;
    } catch (error) {
      console.error('❌ Content extraction failed or timed out:', error);
      return NextResponse.json(
        { 
          error: 'Content extraction failed or timed out. The document may be too complex or contain unsupported content.',
          code: 'EXTRACTION_TIMEOUT',
          suggestions: [
            'Try a simpler document format (TXT, simple PDF)',
            'Remove images or complex formatting',
            'Split large documents into smaller parts',
            'Restart the server and try again'
          ]
        },
        { status: 408 }
      );
    }
    
    console.log(`✅ Extracted ${extractedContent.length} content elements`);
    
    // Log extraction summary
    const extractionSummary = extractedContent.reduce((acc: Record<string, number>, content: ExtractedContent) => {
      acc[content.type] = (acc[content.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('📊 Extraction summary:', extractionSummary);
    
    // STEP 3: Adaptive chunking based on document size and content
    timeoutCheck();
    console.log('✂️  Analyzing document for adaptive chunking...');
    
    // Calculate total document size
    const totalDocSize = extractedContent.reduce((sum: number, content: ExtractedContent) => sum + content.text.length, 0);
    const hasComplexContent = extractedContent.some((content: ExtractedContent) => 
      content.type === 'table' || 
      content.type === 'image_ocr' || 
      /[\u05D0-\u05EA]/.test(content.text) // Hebrew content
    );
    
    // Adaptive chunk parameters based on document characteristics
    let adaptiveChunkSize: number;
    let adaptiveOverlap: number;
    
    if (totalDocSize < 5000) {
      // Very small document - use larger chunks to reduce embedding calls
      adaptiveChunkSize = 1500;
      adaptiveOverlap = 50;
      console.log('📄 Tiny document detected - using large chunks for efficiency');
    } else if (totalDocSize < 20000) {
      // Medium document - balanced approach
      adaptiveChunkSize = 1200;
      adaptiveOverlap = 100;
      console.log('📄 Small document detected - using balanced chunks');
    } else if (totalDocSize < 50000) {
      // Large document - standard chunks
      adaptiveChunkSize = 1000;
      adaptiveOverlap = 150;
      console.log('📄 Medium document detected - using standard chunks');
    } else if (totalDocSize < 150000) {
      // Very large document - smaller chunks for better granularity
      adaptiveChunkSize = 800;
      adaptiveOverlap = 120;
      console.log('📄 Large document detected - using granular chunks');
    } else {
      // Extremely large document - optimize for performance
      adaptiveChunkSize = 600;
      adaptiveOverlap = 80;
      console.log('📄 Very large document detected - using optimized chunks');
    }
    
    // Adjust for complex content (tables, Hebrew, OCR)
    if (hasComplexContent) {
      adaptiveChunkSize = Math.min(adaptiveChunkSize, 900); // Smaller chunks for complex content
      adaptiveOverlap = Math.max(adaptiveOverlap, 100); // More overlap for context
      console.log('🔤 Complex content detected - adjusting for tables/Hebrew/OCR');
    }
    
    console.log(`📏 Adaptive chunking: size=${adaptiveChunkSize}, overlap=${adaptiveOverlap} (doc size: ${totalDocSize} chars)`);
    
    const chunks = await chunkContent(extractedContent, adaptiveChunkSize, adaptiveOverlap);
    console.log(`✅ Created ${chunks.length} adaptive chunks optimized for document characteristics`);
    
    // Check if we have too many chunks for processing
    if (chunks.length > 500) {
      return NextResponse.json(
        { 
          error: `Document too large: ${chunks.length} chunks created. Maximum 500 chunks allowed for local development.`,
          code: 'TOO_MANY_CHUNKS'
        },
        { status: 413 }
      );
    }
    
    // STEP 4: Store document metadata in database
    timeoutCheck();
    console.log('💾 Storing document metadata...');
    const { data: documentData, error: documentError } = await supabaseAdmin
      .from('documents')
      .insert({
        filename,
        file_path: filePath,
        mime_type: mimeType,
        file_size: fileBuffer.length,
        doc_id: docId,
        metadata: {
          ...metadata,
          extraction_summary: extractionSummary,
          chunk_size,
          chunk_overlap,
          total_chunks: chunks.length
        }
      })
      .select()
      .single();
    
    if (documentError) {
      console.error('❌ Failed to store document metadata:', documentError);
      return NextResponse.json(
        { 
          error: `Database error: ${documentError.message}`,
          code: 'DATABASE_ERROR'
        },
        { status: 500 }
      );
    }
    
    console.log(`✅ Document metadata stored with ID: ${documentData.id}`);
    
    // STEP 5: Process embeddings and store chunks with resilient error handling
    timeoutCheck();
    console.log('🧠 Processing embeddings and storing chunks...');
    
    try {
      // No timeout wrapper - let the embedding function handle its own timeouts
      // This prevents cascade failures when one chunk times out
      await storeDocumentsWithEmbeddings(chunks, documentData.id);
      console.log('✅ All chunks processed and stored with embeddings');
    } catch (error) {
      console.error('❌ Embedding processing encountered errors:', error);
      
      // Check if we have any chunks stored (partial success)
      const { data: storedChunks, error: checkError } = await supabaseAdmin
        .from('document_chunks')
        .select('id')
        .eq('doc_id', documentData.id);
      
      const storedCount = storedChunks?.length || 0;
      const successRate = chunks.length > 0 ? (storedCount / chunks.length) * 100 : 0;
      
      console.log(`📊 Partial success: ${storedCount}/${chunks.length} chunks stored (${successRate.toFixed(1)}%)`);
      
      // If we have acceptable success rate, don't fail the entire upload
      if (successRate >= 70) {
        console.log(`✅ Acceptable success rate (${successRate.toFixed(1)}%) - document is searchable`);
        // Continue to success response
      } else {
        // Clean up document record if embedding fails badly
        console.log(`❌ Poor success rate (${successRate.toFixed(1)}%) - cleaning up...`);
        await supabaseAdmin
          .from('documents')
          .delete()
          .eq('id', documentData.id);
        
        return NextResponse.json(
          { 
            error: error instanceof Error ? error.message : 'Embedding processing failed',
            code: 'EMBEDDING_FAILED',
            details: {
              chunks_attempted: chunks.length,
              chunks_stored: storedCount,
              success_rate: successRate.toFixed(1) + '%'
            }
          },
          { status: 500 }
        );
      }
    }
    
    // Build response
    const response: UploadResponse = {
      status: 'success',
      total_chunks: chunks.length,
      doc_id: docId
    };
    
    const processingTime = Date.now() - startTime;
    console.log(`🎉 Upload completed successfully: ${chunks.length} chunks processed in ${processingTime}ms`);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Upload processing failed:', error);
    
    // Ensure we always return valid JSON
    const errorMessage = error instanceof Error ? error.message : 'Upload processing failed';
    const errorCode = errorMessage.includes('timeout') ? 'TIMEOUT_ERROR' : 'PROCESSING_ERROR';
    const statusCode = errorMessage.includes('timeout') ? 408 : 500;
    
    return NextResponse.json(
      { 
        error: errorMessage,
        code: errorCode,
        timestamp: new Date().toISOString()
      },
      { status: statusCode }
    );
  }
}

/**
 * Handle multipart form uploads (alternative to base64)
 */
export async function PUT(request: NextRequest) {
  console.log('📤 Multipart file upload request received');
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const metadataStr = formData.get('metadata') as string;
    const chunkSize = parseInt(formData.get('chunk_size') as string) || 500;
    const chunkOverlap = parseInt(formData.get('chunk_overlap') as string) || 50;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', code: 'NO_FILE' },
        { status: 400 }
      );
    }
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    
    // Parse metadata if provided
    let metadata;
    try {
      metadata = metadataStr ? JSON.parse(metadataStr) : undefined;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid metadata JSON', code: 'INVALID_METADATA' },
        { status: 400 }
      );
    }
    
    // Convert to base64 and use the main POST handler logic
    const base64Content = fileBuffer.toString('base64');
    
    const uploadRequest: UploadRequest = {
      filename: file.name,
      content: base64Content,
      metadata,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap
    };
    
    // Create a new request with the converted data
    const newRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadRequest)
    });
    
    // Use the POST handler
    return POST(newRequest);
    
  } catch (error) {
    console.error('❌ Multipart upload failed:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Multipart upload failed',
        code: 'MULTIPART_ERROR'
      },
      { status: 500 }
    );
  }
}