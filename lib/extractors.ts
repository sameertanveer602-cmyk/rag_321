// =============================================================================
// ADVANCED DOCUMENT CONTENT EXTRACTORS
// Production-grade extractors with comprehensive image extraction, OCR, and structure detection
// =============================================================================

import { ExtractedContent, ExtractionType, SupportedMimeType } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Check if we're in build mode
const isBuildTime = typeof window === 'undefined' && process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV;

// Module references for dynamic loading
let pdfParse: any;
let mammoth: any;
let tesseract: any;

// Document structure detection interfaces
interface DocumentStructure {
  chapters: ChapterInfo[];
  sections: SectionInfo[];
  currentChapter?: string;
  currentSection?: string;
}

interface ChapterInfo {
  title: string;
  level: number;
  startIndex: number;
  endIndex?: number;
  pageNumber?: number;
}

interface SectionInfo {
  title: string;
  level: number;
  startIndex: number;
  endIndex?: number;
  chapter?: string;
  pageNumber?: number;
}

// Dynamic imports for optional dependencies
let pdf2pic: any = null;
let pdfPoppler: any = null;
let JSZip: any = null;
let sharp: any = null;

// Initialize optional dependencies
async function initializeDependencies() {
  // Skip initialization during build time
  if (isBuildTime) {
    console.log('⚠️ Skipping dependency initialization during build time');
    return;
  }

  try {
    // Load main modules dynamically
    if (!pdfParse) {
      pdfParse = (await import('pdf-parse')).default;
    }
    if (!mammoth) {
      mammoth = await import('mammoth');
    }
    if (!tesseract) {
      tesseract = await import('tesseract.js');
    }
    
    if (!pdf2pic) {
      pdf2pic = await import('pdf2pic').then(m => m.default);
    }
    if (!pdfPoppler) {
      pdfPoppler = await import('pdf-poppler').then(m => m.default);
    }
    if (!JSZip) {
      JSZip = await import('jszip').then(m => m.default);
    }
    if (!sharp) {
      sharp = await import('sharp').then(m => m.default);
    }
  } catch (error) {
    console.warn('⚠️  Some advanced extraction dependencies not available:', error instanceof Error ? error.message : String(error));
  }
}

// =============================================================================
// DOCUMENT STRUCTURE DETECTION
// =============================================================================

/**
 * Detect chapters and sections from document text
 */
function detectDocumentStructure(text: string): DocumentStructure {
  const lines = text.split('\n');
  const structure: DocumentStructure = {
    chapters: [],
    sections: []
  };
  
  // Patterns for detecting chapters and sections
  const chapterPatterns = [
    /^(chapter\s+\d+|ch\s*\d+|chapter\s+[ivxlcdm]+)\s*[:\-\.]?\s*(.+)/i,
    /^(\d+\.\s*)(.+)/,
    /^([ivxlcdm]+\.\s*)(.+)/i,
    /^(part\s+\d+|part\s+[ivxlcdm]+)\s*[:\-\.]?\s*(.+)/i,
    /^(unit\s+\d+)\s*[:\-\.]?\s*(.+)/i
  ];
  
  const sectionPatterns = [
    /^(\d+\.\d+\s*)(.+)/,
    /^(\d+\.\d+\.\d+\s*)(.+)/,
    /^(section\s+\d+|sec\s*\d+)\s*[:\-\.]?\s*(.+)/i,
    /^([a-z]\.\s*)(.+)/i,
    /^(\w+\s+\d+\.\d+)\s*[:\-\.]?\s*(.+)/i
  ];
  
  const headingPatterns = [
    /^#{1,6}\s+(.+)/, // Markdown headers
    /^(.+)\n[=\-]{3,}/, // Underlined headers
    /^([A-Z][A-Z\s]{10,})$/, // ALL CAPS headers
  ];
  
  let currentChapter: string | undefined;
  let chapterIndex = 0;
  let sectionIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check for chapter patterns
    let isChapter = false;
    for (const pattern of chapterPatterns) {
      const match = line.match(pattern);
      if (match) {
        const chapterTitle = match[2]?.trim() || match[1]?.trim();
        if (chapterTitle && chapterTitle.length > 3 && chapterTitle.length < 100) {
          structure.chapters.push({
            title: chapterTitle,
            level: 1,
            startIndex: i,
            pageNumber: Math.floor(i / 50) + 1 // Rough page estimation
          });
          currentChapter = chapterTitle;
          chapterIndex++;
          isChapter = true;
          break;
        }
      }
    }
    
    if (isChapter) continue;
    
    // Check for section patterns
    let isSection = false;
    for (const pattern of sectionPatterns) {
      const match = line.match(pattern);
      if (match) {
        const sectionTitle = match[2]?.trim() || match[1]?.trim();
        if (sectionTitle && sectionTitle.length > 3 && sectionTitle.length < 100) {
          const level = (match[1]?.split('.').length || 1) + 1;
          structure.sections.push({
            title: sectionTitle,
            level: level,
            startIndex: i,
            chapter: currentChapter,
            pageNumber: Math.floor(i / 50) + 1
          });
          sectionIndex++;
          isSection = true;
          break;
        }
      }
    }
    
    if (isSection) continue;
    
    // Check for general heading patterns
    for (const pattern of headingPatterns) {
      const match = line.match(pattern);
      if (match) {
        const title = match[1]?.trim();
        if (title && title.length > 3 && title.length < 100) {
          // Determine if it's more likely a chapter or section based on context
          const isLikelyChapter = /^(introduction|conclusion|summary|overview|background|methodology|results|discussion|references|appendix|bibliography)/i.test(title);
          
          if (isLikelyChapter || !currentChapter) {
            structure.chapters.push({
              title: title,
              level: 1,
              startIndex: i,
              pageNumber: Math.floor(i / 50) + 1
            });
            currentChapter = title;
          } else {
            structure.sections.push({
              title: title,
              level: 2,
              startIndex: i,
              chapter: currentChapter,
              pageNumber: Math.floor(i / 50) + 1
            });
          }
          break;
        }
      }
    }
  }
  
  // Set end indices for chapters and sections
  for (let i = 0; i < structure.chapters.length; i++) {
    const nextChapter = structure.chapters[i + 1];
    if (nextChapter) {
      structure.chapters[i].endIndex = nextChapter.startIndex - 1;
    } else {
      structure.chapters[i].endIndex = lines.length - 1;
    }
  }
  
  for (let i = 0; i < structure.sections.length; i++) {
    const nextSection = structure.sections[i + 1];
    const nextChapter = structure.chapters.find(ch => ch.startIndex > structure.sections[i].startIndex);
    
    if (nextSection && (!nextChapter || nextSection.startIndex < nextChapter.startIndex)) {
      structure.sections[i].endIndex = nextSection.startIndex - 1;
    } else if (nextChapter) {
      structure.sections[i].endIndex = nextChapter.startIndex - 1;
    } else {
      structure.sections[i].endIndex = lines.length - 1;
    }
  }
  
  return structure;
}

/**
 * Find the current chapter and section for a given text position
 */
function findCurrentStructure(structure: DocumentStructure, textIndex: number): { chapter?: string; section?: string } {
  let currentChapter: string | undefined;
  let currentSection: string | undefined;
  
  // Find the most recent chapter before this position
  for (const chapter of structure.chapters) {
    if (chapter.startIndex <= textIndex && (!chapter.endIndex || textIndex <= chapter.endIndex)) {
      currentChapter = chapter.title;
      break;
    }
  }
  
  // Find the most recent section before this position
  for (const section of structure.sections) {
    if (section.startIndex <= textIndex && (!section.endIndex || textIndex <= section.endIndex)) {
      currentSection = section.title;
      break;
    }
  }
  
  return { chapter: currentChapter, section: currentSection };
}

/**
 * Add structure information to extracted content
 */
function enrichContentWithStructure(
  extractedContent: ExtractedContent[], 
  text: string, 
  structure: DocumentStructure
): ExtractedContent[] {
  const lines = text.split('\n');
  
  return extractedContent.map(content => {
    // Find approximate position of this content in the original text
    const contentStart = text.indexOf(content.text.substring(0, 50));
    const lineIndex = contentStart >= 0 ? text.substring(0, contentStart).split('\n').length - 1 : 0;
    
    // Find current chapter and section
    const currentStructure = findCurrentStructure(structure, lineIndex);
    
    // Enrich metadata with structure information
    const enrichedMetadata = {
      ...content.metadata,
      ...(currentStructure.chapter && { chapter: currentStructure.chapter }),
      ...(currentStructure.section && { section: currentStructure.section }),
      document_structure: {
        total_chapters: structure.chapters.length,
        total_sections: structure.sections.length,
        has_structure: structure.chapters.length > 0 || structure.sections.length > 0
      }
    };
    
    return {
      ...content,
      metadata: enrichedMetadata
    };
  });
}

// =============================================================================
// MAIN EXTRACTION FUNCTION WITH STRUCTURE DETECTION
// =============================================================================

/**
 * Extract content from any supported file type with advanced image extraction and structure detection
 */
export async function extractContent(
  buffer: Buffer,
  filename: string,
  mimeType: SupportedMimeType
): Promise<ExtractedContent[]> {
  console.log(`🔍 Extracting content from ${filename} (${mimeType})`);
  
  // Skip extraction during build time - return minimal placeholder
  if (isBuildTime) {
    console.log('⚠️ Skipping extraction during build time');
    return [{
      text: `Placeholder content for ${filename}`,
      type: 'text' as ExtractionType,
      metadata: {
        source_filename: filename,
        extraction_type: 'text' as ExtractionType,
        build_time_placeholder: true
      }
    }];
  }
  
  // Initialize dependencies
  try {
    await initializeDependencies();
  } catch (error) {
    console.error('Failed to initialize dependencies:', error);
    return [{
      text: `Error initializing extractors for ${filename}`,
      type: 'text' as ExtractionType,
      metadata: {
        source_filename: filename,
        extraction_type: 'text' as ExtractionType,
        error: 'dependency_initialization_failed'
      }
    }];
  }
  
  const startTime = Date.now();
  let extractedContent: ExtractedContent[] = [];
  let fullText = '';
  
  try {
    switch (mimeType) {
      case 'text/plain':
        extractedContent = await extractTextFile(buffer, filename);
        fullText = buffer.toString('utf-8');
        break;
      case 'application/json':
        extractedContent = await extractJsonFile(buffer, filename);
        fullText = buffer.toString('utf-8');
        break;
      case 'application/pdf':
        const pdfResult = await extractPdfFileAdvanced(buffer, filename);
        extractedContent = pdfResult.content;
        fullText = pdfResult.fullText;
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docxResult = await extractDocxFileAdvanced(buffer, filename);
        extractedContent = docxResult.content;
        fullText = docxResult.fullText;
        break;
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        const pptxResult = await extractPptxFileAdvanced(buffer, filename);
        extractedContent = pptxResult.content;
        fullText = pptxResult.fullText;
        break;
      case 'image/jpeg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
        extractedContent = await extractImageFileAdvanced(buffer, filename);
        fullText = extractedContent.map(c => c.text).join('\n');
        break;
      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
    
    // Detect document structure from full text
    console.log(`📚 Detecting document structure...`);
    const structure = detectDocumentStructure(fullText);
    
    console.log(`📊 Structure detected: ${structure.chapters.length} chapters, ${structure.sections.length} sections`);
    
    if (structure.chapters.length > 0) {
      console.log(`📖 Chapters found:`);
      structure.chapters.forEach((ch, i) => {
        console.log(`   ${i + 1}. ${ch.title} (page ${ch.pageNumber})`);
      });
    }
    
    if (structure.sections.length > 0) {
      console.log(`📑 Sections found:`);
      structure.sections.slice(0, 5).forEach((sec, i) => {
        console.log(`   ${i + 1}. ${sec.title} ${sec.chapter ? `(in: ${sec.chapter})` : ''}`);
      });
      if (structure.sections.length > 5) {
        console.log(`   ... and ${structure.sections.length - 5} more sections`);
      }
    }
    
    // Enrich extracted content with structure information
    extractedContent = enrichContentWithStructure(extractedContent, fullText, structure);
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ Extracted ${extractedContent.length} elements from ${filename} in ${processingTime}ms`);
    
    // Log extraction summary with structure info
    const summary = extractedContent.reduce((acc, content) => {
      acc[content.type] = (acc[content.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`📊 Extraction summary:`, summary);
    
    return extractedContent;
  } catch (error) {
    console.error(`❌ Failed to extract content from ${filename}:`, error);
    throw error;
  }
}

// =============================================================================
// ADVANCED PDF EXTRACTOR WITH IMAGE EXTRACTION
// =============================================================================

async function extractPdfFileAdvanced(buffer: Buffer, filename: string): Promise<{content: ExtractedContent[], fullText: string}> {
  const extractedContent: ExtractedContent[] = [];
  let fullText = '';
  
  try {
    // Step 1: Extract text content using pdf-parse
    console.log(`📄 Extracting text from PDF: ${filename}`);
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;
    fullText = text;
    
    if (text.trim()) {
      extractedContent.push({
        text: text.trim(),
        type: 'text',
        metadata: {
          source_filename: filename,
          extraction_type: 'text',
          page_number: pdfData.numpages || 1,
          total_pages: pdfData.numpages || 1
        }
      });
    }
    
    // Step 2: Extract images from PDF using multiple approaches
    console.log(`🖼️  Extracting images from PDF: ${filename}`);
    
    // Create temporary directory for processing
    const tempDir = path.join(os.tmpdir(), `pdf_extract_${uuidv4()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    
    try {
      // Approach 1: Convert PDF pages to images and run OCR
      if (pdf2pic) {
        const imageContent = await extractImagesFromPdfPages(buffer, filename, tempDir);
        extractedContent.push(...imageContent);
      }
      
      // Approach 2: Extract embedded images using pdf-poppler
      if (pdfPoppler) {
        const embeddedImages = await extractEmbeddedImagesFromPdf(buffer, filename, tempDir);
        extractedContent.push(...embeddedImages);
      }
      
      // Step 3: Extract tables from text
      const tables = extractTablesFromPdfText(text);
      tables.forEach((table, index) => {
        extractedContent.push({
          text: table,
          type: 'table',
          metadata: {
            source_filename: filename,
            extraction_type: 'table',
            table_index: index,
            page_number: 1
          }
        });
      });
      
    } finally {
      // Cleanup temporary directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('⚠️  Failed to cleanup temp directory:', cleanupError);
      }
    }
    
    return { content: extractedContent, fullText };
  } catch (error) {
    throw new Error(`Advanced PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert PDF pages to images and run OCR
 */
async function extractImagesFromPdfPages(buffer: Buffer, filename: string, tempDir: string): Promise<ExtractedContent[]> {
  const extractedContent: ExtractedContent[] = [];
  
  try {
    if (!pdf2pic) {
      console.log('⚠️  pdf2pic not available, skipping page-to-image conversion');
      return [];
    }
    
    console.log(`📄 Converting PDF pages to images for OCR...`);
    
    // Save PDF to temporary file
    const tempPdfPath = path.join(tempDir, 'temp.pdf');
    fs.writeFileSync(tempPdfPath, buffer);
    
    // Convert PDF pages to images
    const convert = pdf2pic.fromPath(tempPdfPath, {
      density: 300, // High DPI for better OCR
      saveFilename: 'page',
      savePath: tempDir,
      format: 'png',
      width: 2000,
      height: 2000
    });
    
    // Convert first 10 pages (to avoid excessive processing)
    const maxPages = 10;
    const results = await convert.bulk(-1, { responseType: 'buffer' });
    
    console.log(`🖼️  Converted ${results.length} pages to images`);
    
    // Run OCR on each page image
    for (let i = 0; i < Math.min(results.length, maxPages); i++) {
      const result = results[i];
      const pageNumber = i + 1;
      
      console.log(`🔍 Running OCR on page ${pageNumber}...`);
      
      try {
        if (!tesseract) {
          throw new Error('Tesseract not available');
        }
        const { createWorker, PSM } = tesseract;
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO, // Automatic page segmentation
          preserve_interword_spaces: '1',
        });
        
        const { data: { text, confidence } } = await worker.recognize(result.buffer);
        await worker.terminate();
        
        if (text.trim() && confidence > 30) {
          extractedContent.push({
            text: cleanOcrText(text.trim()),
            type: 'image_ocr',
            metadata: {
              source_filename: filename,
              extraction_type: 'image_ocr',
              page_number: pageNumber,
              ocr_confidence: confidence,
              is_full_page_ocr: true
            }
          });
          
          console.log(`✅ Page ${pageNumber} OCR completed (confidence: ${confidence.toFixed(1)}%)`);
        }
      } catch (ocrError) {
        console.error(`❌ OCR failed for page ${pageNumber}:`, ocrError);
      }
    }
    
  } catch (error) {
    console.error('❌ PDF page-to-image conversion failed:', error);
  }
  
  return extractedContent;
}

/**
 * Extract embedded images from PDF using pdf-poppler
 */
async function extractEmbeddedImagesFromPdf(buffer: Buffer, filename: string, tempDir: string): Promise<ExtractedContent[]> {
  const extractedContent: ExtractedContent[] = [];
  
  try {
    if (!pdfPoppler) {
      console.log('⚠️  pdf-poppler not available, skipping embedded image extraction');
      return [];
    }
    
    console.log(`🖼️  Extracting embedded images from PDF...`);
    
    // Save PDF to temporary file
    const tempPdfPath = path.join(tempDir, 'temp_embedded.pdf');
    fs.writeFileSync(tempPdfPath, buffer);
    
    // Extract images using pdf-poppler
    const options = {
      format: 'png',
      out_dir: tempDir,
      out_prefix: 'embedded_img',
      page: null // Extract from all pages
    };
    
    const imageFiles = await pdfPoppler.convert(tempPdfPath, options);
    
    if (imageFiles && imageFiles.length > 0) {
      console.log(`🖼️  Found ${imageFiles.length} embedded images`);
      
      // Run OCR on each extracted image
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        
        try {
          const imageBuffer = fs.readFileSync(imagePath);
          
          if (!tesseract) {
            throw new Error('Tesseract not available');
          }
          const { createWorker } = tesseract;
          const worker = await createWorker('eng');
          const { data: { text, confidence } } = await worker.recognize(imageBuffer);
          await worker.terminate();
          
          if (text.trim() && confidence > 25) {
            extractedContent.push({
              text: cleanOcrText(text.trim()),
              type: 'image_ocr',
              metadata: {
                source_filename: filename,
                extraction_type: 'image_ocr',
                image_index: i,
                ocr_confidence: confidence,
                is_embedded_image: true
              }
            });
            
            console.log(`✅ Embedded image ${i + 1} OCR completed (confidence: ${confidence.toFixed(1)}%)`);
          }
        } catch (ocrError) {
          console.error(`❌ OCR failed for embedded image ${i + 1}:`, ocrError);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Embedded image extraction failed:', error);
  }
  
  return extractedContent;
}

// =============================================================================
// ADVANCED DOCX EXTRACTOR WITH IMAGE EXTRACTION
// =============================================================================

async function extractDocxFileAdvanced(buffer: Buffer, filename: string): Promise<{content: ExtractedContent[], fullText: string}> {
  const extractedContent: ExtractedContent[] = [];
  let fullText = '';
  
  try {
    // Check if mammoth is available
    if (!mammoth) {
      throw new Error('Mammoth not available');
    }
    
    // Step 1: Extract text content
    const textResult = await mammoth.extractRawText({ buffer });
    fullText = textResult.value;
    
    if (textResult.value.trim()) {
      extractedContent.push({
        text: textResult.value.trim(),
        type: 'text',
        metadata: {
          source_filename: filename,
          extraction_type: 'text',
          page_number: 1
        }
      });
    }
    
    // Step 2: Extract tables
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const tables = extractTablesFromHtml(htmlResult.value);
    
    tables.forEach((table, index) => {
      extractedContent.push({
        text: table,
        type: 'table',
        metadata: {
          source_filename: filename,
          extraction_type: 'table',
          table_index: index,
          page_number: 1
        }
      });
    });
    
    // Step 3: Extract images from DOCX using ZIP parsing
    console.log(`🖼️  Extracting images from DOCX: ${filename}`);
    const imageContent = await extractImagesFromDocxZip(buffer, filename);
    extractedContent.push(...imageContent);
    
    return { content: extractedContent, fullText };
  } catch (error) {
    throw new Error(`Advanced DOCX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract images from DOCX by parsing the ZIP structure
 */
async function extractImagesFromDocxZip(buffer: Buffer, filename: string): Promise<ExtractedContent[]> {
  const extractedContent: ExtractedContent[] = [];
  
  try {
    if (!JSZip) {
      console.log('⚠️  JSZip not available, skipping DOCX image extraction');
      return [];
    }
    
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(buffer);
    
    // Find image files in the DOCX structure
    const imageFiles: { name: string; data: Buffer }[] = [];
    
    zipContent.forEach((relativePath: string, file: any) => {
      if (relativePath.startsWith('word/media/') && 
          /\.(png|jpg|jpeg|gif|bmp|tiff)$/i.test(relativePath)) {
        imageFiles.push({
          name: relativePath,
          data: file.async('nodebuffer') as any
        });
      }
    });
    
    console.log(`🖼️  Found ${imageFiles.length} images in DOCX`);
    
    // Process each image
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const imageBuffer = await imageFile.data;
      
      console.log(`🔍 Running OCR on DOCX image ${i + 1}: ${imageFile.name}`);
      
      try {
        if (!tesseract) {
          throw new Error('Tesseract not available');
        }
        const { createWorker, PSM } = tesseract;
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: '1',
        });
        
        const { data: { text, confidence } } = await worker.recognize(imageBuffer);
        await worker.terminate();
        
        if (text.trim() && confidence > 30) {
          extractedContent.push({
            text: cleanOcrText(text.trim()),
            type: 'image_ocr',
            metadata: {
              source_filename: filename,
              extraction_type: 'image_ocr',
              image_index: i,
              image_name: path.basename(imageFile.name),
              ocr_confidence: confidence,
              is_docx_image: true
            }
          });
          
          console.log(`✅ DOCX image ${i + 1} OCR completed (confidence: ${confidence.toFixed(1)}%)`);
        }
      } catch (ocrError) {
        console.error(`❌ OCR failed for DOCX image ${i + 1}:`, ocrError);
      }
    }
    
  } catch (error) {
    console.error('❌ DOCX image extraction failed:', error);
  }
  
  return extractedContent;
}

// =============================================================================
// ADVANCED PPTX EXTRACTOR WITH IMAGE EXTRACTION
// =============================================================================

async function extractPptxFileAdvanced(buffer: Buffer, filename: string): Promise<{content: ExtractedContent[], fullText: string}> {
  const extractedContent: ExtractedContent[] = [];
  let fullText = '';
  
  try {
    console.log(`📊 Extracting content from PPTX: ${filename}`);
    
    // Step 1: Extract images from PPTX using ZIP parsing
    const imageContent = await extractImagesFromPptxZip(buffer, filename);
    extractedContent.push(...imageContent);
    
    // Step 2: Basic text extraction (fallback)
    const text = buffer.toString('utf-8');
    const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                         .replace(/\s+/g, ' ')
                         .trim();
    
    fullText = cleanText;
    
    if (cleanText && cleanText.length > 100) {
      extractedContent.push({
        text: cleanText,
        type: 'text',
        metadata: {
          source_filename: filename,
          extraction_type: 'text',
          page_number: 1
        }
      });
    }
    
    return { content: extractedContent, fullText };
  } catch (error) {
    throw new Error(`Advanced PPTX extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract images from PPTX by parsing the ZIP structure
 */
async function extractImagesFromPptxZip(buffer: Buffer, filename: string): Promise<ExtractedContent[]> {
  const extractedContent: ExtractedContent[] = [];
  
  try {
    if (!JSZip) {
      console.log('⚠️  JSZip not available, skipping PPTX image extraction');
      return [];
    }
    
    const zip = new JSZip();
    const zipContent = await zip.loadAsync(buffer);
    
    // Find image files in the PPTX structure
    const imageFiles: { name: string; data: Buffer }[] = [];
    
    zipContent.forEach((relativePath: string, file: any) => {
      if (relativePath.startsWith('ppt/media/') && 
          /\.(png|jpg|jpeg|gif|bmp|tiff)$/i.test(relativePath)) {
        imageFiles.push({
          name: relativePath,
          data: file.async('nodebuffer') as any
        });
      }
    });
    
    console.log(`🖼️  Found ${imageFiles.length} images in PPTX`);
    
    // Process each image
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const imageBuffer = await imageFile.data;
      
      console.log(`🔍 Running OCR on PPTX image ${i + 1}: ${imageFile.name}`);
      
      try {
        if (!tesseract) {
          throw new Error('Tesseract not available');
        }
        const { createWorker, PSM } = tesseract;
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: '1',
        });
        
        const { data: { text, confidence } } = await worker.recognize(imageBuffer);
        await worker.terminate();
        
        if (text.trim() && confidence > 25) { // Lower threshold for presentations
          extractedContent.push({
            text: cleanOcrText(text.trim()),
            type: 'image_ocr',
            metadata: {
              source_filename: filename,
              extraction_type: 'image_ocr',
              image_index: i,
              image_name: path.basename(imageFile.name),
              ocr_confidence: confidence,
              is_pptx_image: true
            }
          });
          
          console.log(`✅ PPTX image ${i + 1} OCR completed (confidence: ${confidence.toFixed(1)}%)`);
        }
      } catch (ocrError) {
        console.error(`❌ OCR failed for PPTX image ${i + 1}:`, ocrError);
      }
    }
    
  } catch (error) {
    console.error('❌ PPTX image extraction failed:', error);
  }
  
  return extractedContent;
}

// =============================================================================
// ADVANCED IMAGE EXTRACTOR
// =============================================================================

async function extractImageFileAdvanced(buffer: Buffer, filename: string): Promise<ExtractedContent[]> {
  const extractedContent: ExtractedContent[] = [];
  
  try {
    console.log(`🔍 Running advanced OCR on ${filename}...`);
    
    // Preprocess image with Sharp if available
    let processedBuffer = buffer;
    if (sharp) {
      try {
        processedBuffer = await sharp(buffer)
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .sharpen()
          .normalize()
          .png()
          .toBuffer();
        
        console.log(`📸 Image preprocessed with Sharp`);
      } catch (sharpError) {
        console.warn('⚠️  Sharp preprocessing failed, using original image');
        processedBuffer = buffer;
      }
    }
    
    // Initialize Tesseract worker with advanced settings
    if (!tesseract) {
      throw new Error('Tesseract not available');
    }
    const { createWorker, PSM } = tesseract;
    const worker = await createWorker(['eng'], 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`📊 OCR progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      }
    });
    
    // Configure Tesseract for maximum accuracy
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,!?@#$%^&*()_+-=[]{}|;:\'\"<>?/~`',
      tessedit_pageseg_mode: PSM.AUTO, // Automatic page segmentation with OSD
      preserve_interword_spaces: '1',
      tessedit_do_invert: '0',
    });
    
    const { data: { text, confidence, words } } = await worker.recognize(processedBuffer);
    await worker.terminate();
    
    if (text.trim()) {
      // Extract main OCR text
      extractedContent.push({
        text: cleanOcrText(text.trim()),
        type: 'image_ocr',
        metadata: {
          source_filename: filename,
          extraction_type: 'image_ocr',
          image_index: 0,
          ocr_confidence: confidence,
          word_count: words?.length || 0,
          is_standalone_image: true
        }
      });
      
      // Try to detect and extract table-like structures
      const tables = extractTablesFromOcrText(text, words || []);
      tables.forEach((table, index) => {
        extractedContent.push({
          text: table.text,
          type: 'table',
          metadata: {
            source_filename: filename,
            extraction_type: 'table',
            table_index: index,
            ocr_confidence: table.confidence,
            is_ocr_table: true
          }
        });
      });
      
      console.log(`✅ Advanced OCR completed for ${filename} (confidence: ${confidence.toFixed(1)}%, ${words?.length || 0} words)`);
    } else {
      console.log(`⚠️  No text detected in ${filename}`);
    }
    
    return extractedContent;
  } catch (error) {
    console.error(`❌ Advanced OCR failed for ${filename}:`, error);
    throw new Error(`Advanced image OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// =============================================================================
// UTILITY FUNCTIONS (keeping existing ones and adding new ones)
// =============================================================================

// ... (keeping all existing utility functions from previous implementation)

async function extractTextFile(buffer: Buffer, filename: string): Promise<ExtractedContent[]> {
  const text = buffer.toString('utf-8');
  
  return [{
    text: text.trim(),
    type: 'text',
    metadata: {
      source_filename: filename,
      extraction_type: 'text',
      page_number: 1
    }
  }];
}

async function extractJsonFile(buffer: Buffer, filename: string): Promise<ExtractedContent[]> {
  try {
    const jsonContent = JSON.parse(buffer.toString('utf-8'));
    const flattenedLines = flattenJsonToLines(jsonContent);
    
    return [{
      text: flattenedLines.join('\n'),
      type: 'json',
      metadata: {
        source_filename: filename,
        extraction_type: 'json',
        page_number: 1
      }
    }];
  } catch (error) {
    throw new Error(`Invalid JSON file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function flattenJsonToLines(obj: any, prefix = ''): string[] {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(...flattenJsonToLines(value, path));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          lines.push(...flattenJsonToLines(item, `${path}[${index}]`));
        } else {
          lines.push(`${path}[${index}] → ${String(item)}`);
        }
      });
    } else {
      lines.push(`${path} → ${String(value)}`);
    }
  }
  
  return lines;
}

function extractTablesFromHtml(html: string): string[] {
  const tables: string[] = [];
  
  const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;
  let match;
  
  while ((match = tableRegex.exec(html)) !== null) {
    const tableHtml = match[1];
    const tableText = convertHtmlTableToText(tableHtml);
    if (tableText.trim()) {
      tables.push(tableText);
    }
  }
  
  return tables;
}

function convertHtmlTableToText(tableHtml: string): string {
  let text = tableHtml
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '')
    .replace(/<td[^>]*>/gi, '\t')
    .replace(/<\/td>/gi, '')
    .replace(/<th[^>]*>/gi, '\t')
    .replace(/<\/th>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  
  text = text.replace(/\n\s*\n/g, '\n').replace(/\t+/g, '\t');
  
  return text;
}

function extractTablesFromPdfText(text: string): string[] {
  const tables: string[] = [];
  
  const lines = text.split('\n');
  let currentTable: string[] = [];
  let inTable = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    const hasMultipleColumns = /\s{3,}/.test(trimmedLine) && trimmedLine.split(/\s{3,}/).length >= 3;
    const hasTabSeparators = trimmedLine.includes('\t') && trimmedLine.split('\t').length >= 3;
    const hasPipeSeparators = trimmedLine.includes('|') && trimmedLine.split('|').length >= 3;
    
    if (hasMultipleColumns || hasTabSeparators || hasPipeSeparators) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }
      currentTable.push(trimmedLine);
    } else {
      if (inTable && currentTable.length >= 2) {
        tables.push(currentTable.join('\n'));
      }
      inTable = false;
      currentTable = [];
    }
  }
  
  if (inTable && currentTable.length >= 2) {
    tables.push(currentTable.join('\n'));
  }
  
  return tables;
}

function extractTablesFromOcrText(text: string, words: any[]): Array<{text: string, confidence: number}> {
  const tables: Array<{text: string, confidence: number}> = [];
  
  try {
    const lineGroups: { [key: number]: any[] } = {};
    const tolerance = 10;
    
    words.forEach(word => {
      if (word.bbox && word.text.trim()) {
        const y = Math.round(word.bbox.y0 / tolerance) * tolerance;
        if (!lineGroups[y]) lineGroups[y] = [];
        lineGroups[y].push(word);
      }
    });
    
    const sortedLines = Object.keys(lineGroups)
      .map(y => parseInt(y))
      .sort((a, b) => a - b)
      .map(y => lineGroups[y]);
    
    let tableLines: any[][] = [];
    let inTable = false;
    
    for (const line of sortedLines) {
      const sortedWords = line.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const isTableRow = sortedWords.length >= 3 && hasRegularSpacing(sortedWords);
      
      if (isTableRow) {
        if (!inTable) {
          inTable = true;
          tableLines = [];
        }
        tableLines.push(sortedWords);
      } else {
        if (inTable && tableLines.length >= 2) {
          const tableText = convertWordsToTableText(tableLines);
          const avgConfidence = calculateAverageConfidence(tableLines);
          
          if (tableText.trim()) {
            tables.push({
              text: tableText,
              confidence: avgConfidence
            });
          }
        }
        inTable = false;
        tableLines = [];
      }
    }
    
    if (inTable && tableLines.length >= 2) {
      const tableText = convertWordsToTableText(tableLines);
      const avgConfidence = calculateAverageConfidence(tableLines);
      
      if (tableText.trim()) {
        tables.push({
          text: tableText,
          confidence: avgConfidence
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Table extraction from OCR failed:', error);
  }
  
  return tables;
}

function hasRegularSpacing(words: any[]): boolean {
  if (words.length < 3) return false;
  
  const gaps = [];
  for (let i = 1; i < words.length; i++) {
    gaps.push(words[i].bbox.x0 - words[i-1].bbox.x1);
  }
  
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const hasLargeGaps = gaps.some(gap => gap > 20);
  
  return hasLargeGaps && avgGap > 15;
}

function convertWordsToTableText(tableLines: any[][]): string {
  const rows = tableLines.map(line => {
    return line.map(word => word.text).join('\t');
  });
  
  return rows.join('\n');
}

function calculateAverageConfidence(tableLines: any[][]): number {
  let totalConfidence = 0;
  let wordCount = 0;
  
  tableLines.forEach(line => {
    line.forEach(word => {
      totalConfidence += word.confidence || 0;
      wordCount++;
    });
  });
  
  return wordCount > 0 ? totalConfidence / wordCount : 0;
}

export function detectMimeType(filename: string): SupportedMimeType | null {
  const ext = filename.toLowerCase().split('.').pop();
  
  const mimeMap: Record<string, SupportedMimeType> = {
    'txt': 'text/plain',
    'json': 'application/json',
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  
  return mimeMap[ext || ''] || null;
}

export function validateFileSize(buffer: Buffer, maxSizeMB = 100): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return buffer.length <= maxSizeBytes;
}

export function cleanOcrText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[|]{2,}/g, '|')
    .replace(/[-]{3,}/g, '---')
    .replace(/[_]{3,}/g, '___')
    .replace(/\b0\b/g, 'O')
    .replace(/\bl\b/g, 'I')
    .replace(/\brn\b/g, 'm')
    .trim();
}