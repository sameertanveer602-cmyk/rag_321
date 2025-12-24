// =============================================================================
// PRODUCTION RAG APPLICATION TYPES
// Exact implementation of provided Pydantic models
// =============================================================================

// =============================================================================
// DOCUMENT UPLOAD TYPES
// =============================================================================

export interface DocumentMetadata {
  doc_id: string;
  chapter?: string;
  section?: string;
  tags?: string[];
}

export interface UploadRequest {
  filename: string;
  content: string;
  metadata?: DocumentMetadata;
  chunk_size?: number;
  chunk_overlap?: number;
}

export interface UploadResponse {
  status: string;
  total_chunks: number;
  doc_id: string;
}

// =============================================================================
// RAG SEARCH TYPES
// =============================================================================

export interface RAGSearchRequest {
  query: string;
  top_k?: number;
  include_sources?: boolean;
  metadata_filters?: Record<string, any>;
}

export interface RetrievedChunk {
  chunk_id: string;
  doc_id: string;
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface RAGSearchResponse {
  answer: string;
  sources?: RetrievedChunk[];
}

// =============================================================================
// CHAT TYPES
// =============================================================================

export interface ChatRequest {
  session_id?: string;
  message: string;
  top_k?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  sources?: RetrievedChunk[];
}

export interface ChatResponse {
  session_id: string;
  answer: string;
  history: ChatMessage[];
  sources?: RetrievedChunk[];
}

// =============================================================================
// INTERNAL PROCESSING TYPES
// =============================================================================

export type ExtractionType = 'text' | 'table' | 'json' | 'image_ocr' | 'graph_ocr';

export interface ExtractedContent {
  text: string;
  type: ExtractionType;
  metadata: {
    source_filename: string;
    extraction_type: ExtractionType;
    page_number?: number;
    table_index?: number;
    image_index?: number;
    [key: string]: any;
  };
}

export interface ProcessedChunk {
  text: string;
  metadata: {
    source_filename: string;
    extraction_type: ExtractionType;
    chunk_index: number;
    page_number?: number;
    table_index?: number;
    image_index?: number;
    [key: string]: any;
  };
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

export interface DocumentRecord {
  id: string;
  filename: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  doc_id: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunkRecord {
  id: string;
  doc_id: string;
  chunk_text: string;
  embedding: number[] | null;
  metadata: {
    source_filename: string;
    extraction_type: ExtractionType;
    chunk_index: number;
    page_number?: number;
    table_index?: number;
    image_index?: number;
    [key: string]: any;
  };
  created_at: string;
}

export interface ChatSessionRecord {
  id: string;
  session_id: string;
  session_name?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SessionMessageRecord {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: RetrievedChunk[];
  metadata: Record<string, any>;
  message_index: number;
  created_at: string;
}

// =============================================================================
// FILE PROCESSING TYPES
// =============================================================================

export interface FileProcessingResult {
  extractedContent: ExtractedContent[];
  totalElements: number;
  processingTime: number;
}

export interface ChunkingResult {
  chunks: ProcessedChunk[];
  totalChunks: number;
  chunkingTime: number;
}

export interface EmbeddingResult {
  embeddings: number[][];
  embeddingTime: number;
  totalEmbeddings: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export interface APIError {
  error: string;
  code: string;
  details?: any;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type SupportedMimeType = 
  | 'text/plain'
  | 'application/json'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';

export interface ProcessingStatus {
  stage: string;
  progress: number;
  message: string;
  timestamp: string;
}