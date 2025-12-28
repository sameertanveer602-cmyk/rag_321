// =============================================================================
// ADVANCED DOCUMENT CONTENT EXTRACTORS
// Production-grade extractors with comprehensive image extraction, OCR, and structure detection
// =============================================================================

import { ExtractedContent, ExtractionType, SupportedMimeType } from './types';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';
import { createWorker, PSM } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Document structure detection interfaces
interface DocumentStructure {
  chapters: ChapterInfo[];
  sections: SectionInfo[];
  tables: TableInfo[];
  examples: ExampleInfo[];
  pages: PageInfo[];
  currentChapter?: string;
  currentSection?: string;
  currentPage?: number;
}

interface ChapterInfo {
  title: string;
  titleHebrew?: string;
  level: number;
  startIndex: number;
  endIndex?: number;
  pageNumber?: number;
  chapterNumber?: string;
}

interface SectionInfo {
  title: string;
  titleHebrew?: string;
  level: number;
  startIndex: number;
  endIndex?: number;
  chapter?: string;
  pageNumber?: number;
  sectionNumber?: string;
}

interface TableInfo {
  tableNumber?: number;
  title?: string;
  titleHebrew?: string;
  startIndex: number;
  endIndex?: number;
  pageNumber?: number;
  chapter?: string;
  section?: string;
}

interface ExampleInfo {
  exampleNumber?: number;
  title?: string;
  titleHebrew?: string;
  startIndex: number;
  endIndex?: number;
  pageNumber?: number;
  chapter?: string;
  section?: string;
}

interface PageInfo {
  pageNumber: number;
  startIndex: number;
  endIndex?: number;
}

// Dynamic imports for optional dependencies
let pdf2pic: any = null;
let pdfPoppler: any = null;
let JSZip: any = null;

// Initialize optional dependencies
async function initializeDependencies() {
  try {
    if (!pdf2pic) {
      pdf2pic = await import('pdf2pic').then(m => m.default);
    }
    if (!pdfPoppler) {
      pdfPoppler = await import('pdf-poppler').then(m => m.default);
    }
    if (!JSZip) {
      JSZip = await import('jszip').then(m => m.default);
    }
  } catch (error) {
    console.warn('⚠️  Some advanced extraction dependencies not available:', error instanceof Error ? error.message : String(error));
  }
}

// =============================================================================
// DOCUMENT STRUCTURE DETECTION
// =============================================================================

/**
 * Enhanced Hebrew-aware document structure detection
 * Detects chapters, sections, tables, examples, and page numbers from Hebrew regulatory documents
 * Handles RTL markers and Hebrew text encoding
 */
function detectDocumentStructure(text: string): DocumentStructure {
  const lines = text.split('\n');
  const structure: DocumentStructure = {
    chapters: [],
    sections: [],
    tables: [],
    examples: [],
    pages: []
  };
  
  // Clean RTL markers and normalize whitespace for pattern matching
  const cleanLine = (line: string) => {
    return line
      .replace(/[‫‬‪‬]/g, '')  // Remove all RTL/LTR markers
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
  };
  
  // Hebrew chapter patterns (הקדמה, עקרונות כלליים, etc.)
  const hebrewChapterPatterns = [
    /^(הקדמה|מבוא|רקע|סיכום|מסקנות|נספח|תוספת|נספחים|תוספות)$/,
    /^(עקרונות\s+כלליים|עקרונות|כללים|הנחיות|הוראות)$/,
    /^(פרק|חלק)\s+([א-ת]+|[0-9]+|[IVX]+)\s*[:\-\.]?\s*(.+)/,
    /^([א-ת]{3,})\s+([א-ת\s]{5,})$/  // Hebrew title pattern
  ];
  
  // Hebrew section patterns (סעיף 1.1, 2.1, etc.) - more flexible
  const hebrewSectionPatterns = [
    /^(\d+\.\d+)\s+(.{3,})/,  // 1.1, 2.1, etc. with at least 3 chars title
    /^(\d+\.\d+\.\d+)\s+(.{3,})/,  // 1.1.1, 2.1.1, etc.
    /סעיף\s+(\d+\.\d+)\s+(.{3,})/,  // Can appear anywhere in line
    /סעיף\s+(\d+)\s+(.{3,})/,
    /^([א-ת])\.\s+(.{3,})/  // א., ב., ג., etc.
  ];
  
  // Hebrew table patterns (טבלה 1, טבלה 2, etc.) - more flexible
  const hebrewTablePatterns = [
    /טבלה\s*:?\s*(\d+)\s*[:\-\.]?\s*(.{0,})/,  // טבלה 1: Title or טבלה :1
    /^\[טבלה\/TABLE\s+START\]/,
    /table\s+(\d+)\s*[:\-\.]?\s*(.+)/i
  ];
  
  // Hebrew example patterns (דוגמה 1, דוגמה 2, etc.) - more flexible
  const hebrewExamplePatterns = [
    /דוגמה\s*:?\s*(\d+)\s*[:\-\.]?\s*(.{0,})/,  // דוגמה 1: Title or דוגמה :1
    /דוגמא\s*:?\s*(\d+)\s*[:\-\.]?\s*(.{0,})/,
    /example\s+(\d+)\s*[:\-\.]?\s*(.+)/i
  ];
  
  // Page number patterns (at top of pages) - with RTL markers and more strict
  const pageNumberPatterns = [
    /^(\d+)$/,    // Simple numbers on their own line (must be alone)
    /^עמוד\s+(\d+)$/,
    /^page\s+(\d+)$/i
  ];
  
  let currentChapter: string | undefined;
  let currentChapterHebrew: string | undefined;
  let currentSection: string | undefined;
  let currentSectionHebrew: string | undefined;
  let currentSectionNumber: string | undefined;
  let currentPage: number | undefined;
  let inTable = false;
  let currentTableStart: number | undefined;
  let currentTableNumber: number | undefined;
  let currentTableTitle: string | undefined;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    
    // Detect page numbers - must be ONLY a number, nothing else, and reasonable range
    if (cleaned.length <= 3 && /^\d+$/.test(cleaned)) {
      const pageNum = parseInt(cleaned);
      // Only accept page numbers 1-50 and skip if it looks like it's part of other text
      if (pageNum > 0 && pageNum <= 50) {
        // Check if previous and next lines are empty or very short (page numbers are usually isolated)
        const prevLine = i > 0 ? cleanLine(lines[i - 1]) : '';
        const nextLine = i < lines.length - 1 ? cleanLine(lines[i + 1]) : '';
        
        // Page numbers are usually on their own with empty lines around them
        if (prevLine.length < 10 || nextLine.length < 10) {
          currentPage = pageNum;
          structure.pages.push({
            pageNumber: pageNum,
            startIndex: i
          });
          console.log(`📄 Detected page ${pageNum} at line ${i + 1}`);
        }
      }
    }
    
    // Detect Hebrew chapters - be more strict to avoid false positives
    let isChapter = false;
    // Only check for chapters if the line is relatively short (not a paragraph)
    if (cleaned.length < 100) {
      for (const pattern of hebrewChapterPatterns) {
        const match = cleaned.match(pattern);
        if (match) {
          let chapterTitle = '';
          let chapterNumber = '';
          
          if (match[3]) {
            // Pattern with chapter number: פרק 1 - Title
            chapterNumber = match[2];
            chapterTitle = match[3].trim();
          } else if (match[2]) {
            // Pattern with two groups
            chapterTitle = match[2].trim();
          } else {
            // Single word chapter (הקדמה, מבוא, etc.)
            chapterTitle = match[1].trim();
          }
          
          // Only accept if title is reasonable length (not too long, not too short)
          if (chapterTitle && chapterTitle.length >= 2 && chapterTitle.length < 80) {
            structure.chapters.push({
              title: chapterTitle,
              titleHebrew: chapterTitle,
              level: 1,
              startIndex: i,
              pageNumber: currentPage,
              chapterNumber: chapterNumber || undefined
            });
            currentChapter = chapterTitle;
            currentChapterHebrew = chapterTitle;
            console.log(`📖 Detected chapter: "${chapterTitle}" at line ${i + 1}, page ${currentPage}`);
            isChapter = true;
            break;
          }
        }
      }
    }
    
    if (isChapter) continue;
    
    // Detect Hebrew sections - check both current line and combination with next line
    // Be more strict to avoid false positives
    let isSection = false;
    if (cleaned.length < 150) {  // Sections shouldn't be too long
      for (const pattern of hebrewSectionPatterns) {
        const match = cleaned.match(pattern);
        if (match) {
          const sectionNumber = match[1]?.trim();
          let sectionTitle = match[2]?.trim();
          
          // If title is too short or empty, try to get it from the next line
          if ((!sectionTitle || sectionTitle.length < 3) && i + 1 < lines.length) {
            const nextLine = cleanLine(lines[i + 1]);
            if (nextLine && nextLine.length >= 3 && nextLine.length < 100 && !/^\d/.test(nextLine)) {
              sectionTitle = nextLine;
            }
          }
          
          // Only accept if title is reasonable length
          if (sectionTitle && sectionTitle.length >= 2 && sectionTitle.length < 100) {
            const level = sectionNumber ? (sectionNumber.split('.').length + 1) : 2;
            structure.sections.push({
              title: sectionTitle,
              titleHebrew: sectionTitle,
              level: level,
              startIndex: i,
              chapter: currentChapter,
              pageNumber: currentPage,
              sectionNumber: sectionNumber
            });
            currentSection = sectionTitle;
            currentSectionHebrew = sectionTitle;
            currentSectionNumber = sectionNumber;
            console.log(`📑 Detected section ${sectionNumber}: "${sectionTitle}" at line ${i + 1}, page ${currentPage}`);
            isSection = true;
            break;
          }
        }
      }
    }
    
    if (isSection) continue;
    
    // Detect Hebrew tables - handle titles on next line
    for (const pattern of hebrewTablePatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        if (match[0].includes('START')) {
          // Table start marker
          inTable = true;
          currentTableStart = i;
        } else if (match[1]) {
          // Table with number: טבלה 1: Title
          const tableNumber = parseInt(match[1]);
          let tableTitle = match[2]?.trim() || '';
          
          // If title is empty or too short, try next line
          if ((!tableTitle || tableTitle.length < 3) && i + 1 < lines.length) {
            const nextLine = cleanLine(lines[i + 1]);
            if (nextLine && nextLine.length >= 3 && !/^טבלה|^table/i.test(nextLine)) {
              tableTitle = nextLine;
            }
          }
          
          structure.tables.push({
            tableNumber: tableNumber,
            title: tableTitle,
            titleHebrew: tableTitle,
            startIndex: i,
            pageNumber: currentPage,
            chapter: currentChapter,
            section: currentSection
          });
          currentTableNumber = tableNumber;
          currentTableTitle = tableTitle;
          console.log(`📊 Detected table ${tableNumber}: "${tableTitle}" at line ${i + 1}, page ${currentPage}`);
        }
        break;
      }
    }
    
    // Detect table end marker
    if (cleaned.includes('[טבלה/TABLE END]') && inTable && currentTableStart !== undefined) {
      inTable = false;
      // Update the last table's end index
      if (structure.tables.length > 0) {
        structure.tables[structure.tables.length - 1].endIndex = i;
      }
      currentTableStart = undefined;
    }
    
    // Detect Hebrew examples - handle titles on next line
    for (const pattern of hebrewExamplePatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1]) {
        const exampleNumber = parseInt(match[1]);
        let exampleTitle = match[2]?.trim() || '';
        
        // If title is empty or too short, try next line
        if ((!exampleTitle || exampleTitle.length < 3) && i + 1 < lines.length) {
          const nextLine = cleanLine(lines[i + 1]);
          if (nextLine && nextLine.length >= 3 && !/^דוגמה|^example/i.test(nextLine)) {
            exampleTitle = nextLine;
          }
        }
        
        structure.examples.push({
          exampleNumber: exampleNumber,
          title: exampleTitle,
          titleHebrew: exampleTitle,
          startIndex: i,
          pageNumber: currentPage,
          chapter: currentChapter,
          section: currentSection
        });
        console.log(`💡 Detected example ${exampleNumber}: "${exampleTitle}" at line ${i + 1}, page ${currentPage}`);
        break;
      }
    }
  }
  
  // Set end indices for chapters
  for (let i = 0; i < structure.chapters.length; i++) {
    const nextChapter = structure.chapters[i + 1];
    if (nextChapter) {
      structure.chapters[i].endIndex = nextChapter.startIndex - 1;
    } else {
      structure.chapters[i].endIndex = lines.length - 1;
    }
  }
  
  // Set end indices for sections
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
  
  // Set end indices for pages
  for (let i = 0; i < structure.pages.length; i++) {
    const nextPage = structure.pages[i + 1];
    if (nextPage) {
      structure.pages[i].endIndex = nextPage.startIndex - 1;
    } else {
      structure.pages[i].endIndex = lines.length - 1;
    }
  }
  
  return structure;
}

/**
 * Find the current chapter, section, page, table, and example for a given text position
 */
function findCurrentStructure(structure: DocumentStructure, textIndex: number): { 
  chapter?: string; 
  chapterHebrew?: string;
  chapterNumber?: string;
  section?: string; 
  sectionHebrew?: string;
  sectionNumber?: string;
  pageNumber?: number;
  tableNumber?: number;
  exampleNumber?: number;
} {
  let currentChapter: string | undefined;
  let currentChapterHebrew: string | undefined;
  let currentChapterNumber: string | undefined;
  let currentSection: string | undefined;
  let currentSectionHebrew: string | undefined;
  let currentSectionNumber: string | undefined;
  let currentPage: number | undefined;
  let currentTableNumber: number | undefined;
  let currentExampleNumber: number | undefined;
  
  // Find the most recent chapter before or at this position (iterate backward)
  for (let i = structure.chapters.length - 1; i >= 0; i--) {
    const chapter = structure.chapters[i];
    if (chapter.startIndex <= textIndex) {
      currentChapter = chapter.title;
      currentChapterHebrew = chapter.titleHebrew;
      currentChapterNumber = chapter.chapterNumber;
      break;
    }
  }
  
  // Find the most recent section before or at this position (iterate backward)
  for (let i = structure.sections.length - 1; i >= 0; i--) {
    const section = structure.sections[i];
    if (section.startIndex <= textIndex) {
      currentSection = section.title;
      currentSectionHebrew = section.titleHebrew;
      currentSectionNumber = section.sectionNumber;
      break;
    }
  }
  
  // Find the current page (iterate backward)
  for (let i = structure.pages.length - 1; i >= 0; i--) {
    const page = structure.pages[i];
    if (page.startIndex <= textIndex) {
      currentPage = page.pageNumber;
      break;
    }
  }
  
  // Find if we're inside a table (iterate backward)
  for (let i = structure.tables.length - 1; i >= 0; i--) {
    const table = structure.tables[i];
    if (table.startIndex <= textIndex && (!table.endIndex || textIndex <= table.endIndex)) {
      currentTableNumber = table.tableNumber;
      break;
    }
  }
  
  // Find if we're inside an example
  for (const example of structure.examples) {
    if (example.startIndex <= textIndex && (!example.endIndex || textIndex <= example.endIndex)) {
      currentExampleNumber = example.exampleNumber;
      break;
    }
  }
  
  return { 
    chapter: currentChapter,
    chapterHebrew: currentChapterHebrew,
    chapterNumber: currentChapterNumber,
    section: currentSection,
    sectionHebrew: currentSectionHebrew,
    sectionNumber: currentSectionNumber,
    pageNumber: currentPage,
    tableNumber: currentTableNumber,
    exampleNumber: currentExampleNumber
  };
}

/**
 * Add enhanced structure information to extracted content with Hebrew metadata
 */
function enrichContentWithStructure(
  extractedContent: ExtractedContent[], 
  text: string, 
  structure: DocumentStructure
): ExtractedContent[] {
  const lines = text.split('\n');
  
  console.log(`🔍 Enriching ${extractedContent.length} content items with structure metadata...`);
  console.log(`📚 Available structure: ${structure.chapters.length} chapters, ${structure.sections.length} sections, ${structure.tables.length} tables, ${structure.examples.length} examples`);
  
  return extractedContent.map((content, contentIndex) => {
    // Find approximate position of this content in the original text
    // Try multiple methods to find the best match
    let lineIndex = 0;
    
    // Method 1: Search for the beginning of the content
    const searchText = content.text.substring(0, Math.min(100, content.text.length));
    const contentStart = text.indexOf(searchText);
    if (contentStart >= 0) {
      lineIndex = text.substring(0, contentStart).split('\n').length - 1;
    } else {
      // Method 2: Use proportional positioning
      // If we can't find exact match, estimate position based on content index
      lineIndex = Math.floor((contentIndex / extractedContent.length) * lines.length);
    }
    
    // Find current chapter, section, page, table, and example
    const currentStructure = findCurrentStructure(structure, lineIndex);
    
    // Log what we found for debugging
    if (contentIndex < 3) {  // Log first 3 items for debugging
      console.log(`  Item ${contentIndex + 1}: line ${lineIndex}, chapter="${currentStructure.chapter || 'none'}", section="${currentStructure.sectionNumber || 'none'}", page=${currentStructure.pageNumber || 'none'}`);
    }
    
    // Build enhanced metadata with all Hebrew information
    const enrichedMetadata: any = {
      ...content.metadata,
      document_structure: {
        total_chapters: structure.chapters.length,
        total_sections: structure.sections.length,
        total_tables: structure.tables.length,
        total_examples: structure.examples.length,
        total_pages: structure.pages.length,
        has_structure: structure.chapters.length > 0 || structure.sections.length > 0
      }
    };
    
    // Add chapter information (both English and Hebrew)
    if (currentStructure.chapter) {
      enrichedMetadata.chapter = currentStructure.chapter;
    }
    if (currentStructure.chapterHebrew) {
      enrichedMetadata.chapter_hebrew = currentStructure.chapterHebrew;
    }
    if (currentStructure.chapterNumber) {
      enrichedMetadata.chapter_number = currentStructure.chapterNumber;
    }
    
    // Add section information (both English and Hebrew)
    if (currentStructure.section) {
      enrichedMetadata.section = currentStructure.section;
    }
    if (currentStructure.sectionHebrew) {
      enrichedMetadata.section_hebrew = currentStructure.sectionHebrew;
    }
    if (currentStructure.sectionNumber) {
      enrichedMetadata.section_number = currentStructure.sectionNumber;
    }
    
    // Add page number
    if (currentStructure.pageNumber) {
      enrichedMetadata.page_number = currentStructure.pageNumber;
    }
    
    // Add table number if inside a table
    if (currentStructure.tableNumber) {
      enrichedMetadata.table_number = currentStructure.tableNumber;
      enrichedMetadata.is_table_content = true;
    }
    
    // Add example number if inside an example
    if (currentStructure.exampleNumber) {
      enrichedMetadata.example_number = currentStructure.exampleNumber;
      enrichedMetadata.is_example_content = true;
    }
    
    // Add Hebrew document flag if Hebrew content detected
    if (/[\u05D0-\u05EA]/.test(content.text)) {
      enrichedMetadata.is_hebrew_content = true;
      enrichedMetadata.content_language = 'hebrew';
    }
    
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
  
  // Initialize dependencies
  await initializeDependencies();
  
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
    
    console.log(`📊 Structure detected:`);
    console.log(`   📖 Chapters: ${structure.chapters.length}`);
    console.log(`   📑 Sections: ${structure.sections.length}`);
    console.log(`   📊 Tables: ${structure.tables.length}`);
    console.log(`   💡 Examples: ${structure.examples.length}`);
    console.log(`   📄 Pages: ${structure.pages.length}`);
    
    if (structure.chapters.length > 0) {
      console.log(`📖 Chapters found:`);
      structure.chapters.forEach((ch, i) => {
        const chapterInfo = [];
        if (ch.chapterNumber) chapterInfo.push(`#${ch.chapterNumber}`);
        if (ch.titleHebrew) chapterInfo.push(ch.titleHebrew);
        if (ch.pageNumber) chapterInfo.push(`page ${ch.pageNumber}`);
        console.log(`   ${i + 1}. ${chapterInfo.join(' | ')}`);
      });
    }
    
    if (structure.sections.length > 0) {
      console.log(`📑 Sections found (showing first 10):`);
      structure.sections.slice(0, 10).forEach((sec, i) => {
        const sectionInfo = [];
        if (sec.sectionNumber) sectionInfo.push(sec.sectionNumber);
        if (sec.titleHebrew) sectionInfo.push(sec.titleHebrew);
        if (sec.chapter) sectionInfo.push(`in: ${sec.chapter}`);
        if (sec.pageNumber) sectionInfo.push(`page ${sec.pageNumber}`);
        console.log(`   ${i + 1}. ${sectionInfo.join(' | ')}`);
      });
      if (structure.sections.length > 10) {
        console.log(`   ... and ${structure.sections.length - 10} more sections`);
      }
    }
    
    if (structure.tables.length > 0) {
      console.log(`📊 Tables found:`);
      structure.tables.forEach((table, i) => {
        const tableInfo = [];
        if (table.tableNumber) tableInfo.push(`Table ${table.tableNumber}`);
        if (table.titleHebrew) tableInfo.push(table.titleHebrew);
        if (table.pageNumber) tableInfo.push(`page ${table.pageNumber}`);
        console.log(`   ${i + 1}. ${tableInfo.join(' | ')}`);
      });
    }
    
    if (structure.examples.length > 0) {
      console.log(`💡 Examples found:`);
      structure.examples.forEach((ex, i) => {
        const exampleInfo = [];
        if (ex.exampleNumber) exampleInfo.push(`Example ${ex.exampleNumber}`);
        if (ex.titleHebrew) exampleInfo.push(ex.titleHebrew);
        if (ex.pageNumber) exampleInfo.push(`page ${ex.pageNumber}`);
        console.log(`   ${i + 1}. ${exampleInfo.join(' | ')}`);
      });
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
        const worker = await createWorker(['eng', 'heb']);
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
          
          const worker = await createWorker(['eng', 'heb']);
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
        const worker = await createWorker(['eng', 'heb']);
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
        const worker = await createWorker(['eng', 'heb']);
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
    
    // Use original buffer directly (no Sharp preprocessing)
    const processedBuffer = buffer;
    
    // Initialize Tesseract worker with multilingual support (English + Hebrew)
    const worker = await createWorker(['eng', 'heb'], 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`📊 OCR progress: ${(m.progress * 100).toFixed(1)}%`);
        }
      }
    });
    
    // Configure Tesseract for maximum accuracy with multilingual support
    await worker.setParameters({
      // Remove character whitelist to support Hebrew and other scripts
      tessedit_pageseg_mode: PSM.AUTO, // Automatic page segmentation with OSD
      preserve_interword_spaces: '1',
      tessedit_do_invert: '0',
      // Enable better table detection
      tessedit_create_hocr: '1',
      tessedit_create_tsv: '1'
    });
    
    const { data: { text, confidence, words } } = await worker.recognize(processedBuffer);
    await worker.terminate();
    
    // Detect Hebrew content
    const hasHebrew = /[\u05D0-\u05EA]/.test(text);
    const hasNumbers = /\d/.test(text);
    const hasTables = /[\u05D0-\u05EA].*\d|\d.*[\u05D0-\u05EA]|[₪$€£¥]/.test(text);
    
    console.log(`📊 OCR Results: confidence=${confidence.toFixed(1)}%, Hebrew=${hasHebrew}, Tables=${hasTables}`);
    
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
      
      // Try to detect and extract table-like structures - more conservative
      const tables = extractTablesFromOcrText(text, words || []);
      tables.forEach((table, index) => {
        // Only add tables with high confidence and clear structure
        if (table.confidence > 70 && table.text.split('\n').length >= 4) {
          // Add Hebrew table markers for better identification
          const markedTableText = `[טבלה/TABLE START]\n${table.text}\n[טבלה/TABLE END]`;
          
          extractedContent.push({
            text: markedTableText,
            type: 'table',
            metadata: {
              source_filename: filename,
              extraction_type: 'table',
              table_index: index,
              ocr_confidence: table.confidence,
              is_ocr_table: true,
              is_hebrew_table: /[\u05D0-\u05EA]/.test(table.text)
            }
          });
        }
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
  
  // Enhanced regex to capture tables with various attributes including RTL
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
    // Handle table rows
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '')
    // Handle table cells with better spacing for RTL content
    .replace(/<td[^>]*>/gi, '\t')
    .replace(/<\/td>/gi, '')
    .replace(/<th[^>]*>/gi, '\t')
    .replace(/<\/th>/gi, '')
    // Remove all other HTML tags
    .replace(/<[^>]*>/g, '')
    // Handle HTML entities including Hebrew-specific ones
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Handle Hebrew HTML entities
    .replace(/&#(\d+);/g, (match, num) => String.fromCharCode(parseInt(num)))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
  
  // Clean up extra whitespace while preserving Hebrew text structure
  text = text.replace(/\n\s*\n/g, '\n').replace(/\t+/g, '\t');
  
  // Ensure proper spacing for mixed Hebrew-English content
  text = text.replace(/([a-zA-Z])([א-ת])/g, '$1 $2');
  text = text.replace(/([א-ת])([a-zA-Z])/g, '$1 $2');
  
  return text;
}

function extractTablesFromPdfText(text: string): string[] {
  const tables: string[] = [];
  
  const lines = text.split('\n');
  let currentTable: string[] = [];
  let inTable = false;
  let consecutiveTableLines = 0;
  const MIN_TABLE_LINES = 3; // Minimum lines to consider it a real table
  const MIN_COLUMNS = 2; // Minimum columns to consider it a table
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines
    if (!trimmedLine) {
      if (inTable && consecutiveTableLines >= MIN_TABLE_LINES) {
        // End current table if we have enough lines
        const tableText = currentTable.join('\n');
        const cleanedTable = cleanHebrewTableText(tableText);
        
        // Validate it's actually a table before adding
        if (isValidTable(cleanedTable)) {
          const markedTable = `[טבלה/TABLE START]\n${cleanedTable}\n[טבלה/TABLE END]`;
          tables.push(markedTable);
        }
      }
      inTable = false;
      currentTable = [];
      consecutiveTableLines = 0;
      continue;
    }
    
    // Enhanced table detection - more strict criteria
    const hasTabSeparators = trimmedLine.includes('\t') && trimmedLine.split('\t').length >= MIN_COLUMNS;
    const hasPipeSeparators = trimmedLine.includes('|') && trimmedLine.split('|').filter(cell => cell.trim()).length >= MIN_COLUMNS;
    
    // Multiple spaces pattern - but more strict
    const spaceColumns = trimmedLine.split(/\s{3,}/).filter(col => col.trim());
    const hasMultipleSpaces = spaceColumns.length >= MIN_COLUMNS;
    
    // Hebrew-specific table patterns - more conservative
    const hasHebrewNumbers = /[\u05D0-\u05EA].*\d.*[\u05D0-\u05EA]|\d.*[\u05D0-\u05EA].*\d/.test(trimmedLine);
    const hasCurrency = /\d+[₪$€£¥]|[₪$€£¥]\d+/.test(trimmedLine);
    const hasHebrewTableWords = /[\u05D0-\u05EA].*(סכום|מחיר|כמות|תאריך|שם|מספר|סה״כ|סהכ|ח״מ|חמ|ת״ז|תז|קוד|רשימה|פירוט|תיאור|טבלה|נתונים|דוח|סטטיסטיקה)/.test(trimmedLine);
    
    // Date and percentage patterns - more specific
    const hasDatePatterns = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(trimmedLine);
    const hasPercentages = /\d+%/.test(trimmedLine);
    
    // Structured data pattern - numbers with text in organized format
    const hasStructuredData = /^\s*\d+[\.\)]\s+/.test(trimmedLine) || // Numbered lists
                             /^\s*[א-ת]+\s+\d+/.test(trimmedLine) || // Hebrew word + number
                             /^\s*\d+\s+[א-ת]+/.test(trimmedLine);   // Number + Hebrew word
    
    // Table header patterns
    const hasTableHeaders = /^[\u05D0-\u05EA\s]+\|[\u05D0-\u05EA\s]+\|/.test(trimmedLine) || 
                           /^[\u05D0-\u05EA\s]+\s{3,}[\u05D0-\u05EA\s]+\s{3,}/.test(trimmedLine);
    
    // Check for table-like structure - require multiple criteria
    const tableIndicators = [
      hasTabSeparators,
      hasPipeSeparators,
      hasMultipleSpaces,
      hasTableHeaders,
      (hasCurrency && (hasHebrewNumbers || hasStructuredData)),
      (hasHebrewTableWords && (hasDatePatterns || hasPercentages || hasCurrency)),
      (hasDatePatterns && hasPercentages),
      (hasStructuredData && (hasCurrency || hasHebrewTableWords))
    ];
    
    const indicatorCount = tableIndicators.filter(Boolean).length;
    const isTableLike = indicatorCount >= 2 || hasTabSeparators || hasPipeSeparators || hasTableHeaders;
    
    if (isTableLike) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
        consecutiveTableLines = 0;
      }
      currentTable.push(trimmedLine);
      consecutiveTableLines++;
    } else {
      if (inTable && consecutiveTableLines >= MIN_TABLE_LINES) {
        // End current table if we have enough lines
        const tableText = currentTable.join('\n');
        const cleanedTable = cleanHebrewTableText(tableText);
        
        // Validate it's actually a table before adding
        if (isValidTable(cleanedTable)) {
          const markedTable = `[טבלה/TABLE START]\n${cleanedTable}\n[טבלה/TABLE END]`;
          tables.push(markedTable);
        }
      }
      inTable = false;
      currentTable = [];
      consecutiveTableLines = 0;
    }
  }
  
  // Handle table at end of text
  if (inTable && consecutiveTableLines >= MIN_TABLE_LINES) {
    const tableText = currentTable.join('\n');
    const cleanedTable = cleanHebrewTableText(tableText);
    
    if (isValidTable(cleanedTable)) {
      const markedTable = `[טבלה/TABLE START]\n${cleanedTable}\n[טבלה/TABLE END]`;
      tables.push(markedTable);
    }
  }
  
  return tables;
}

// Helper function to validate if extracted content is actually a table
function isValidTable(tableText: string): boolean {
  const lines = tableText.split('\n').filter(line => line.trim());
  
  if (lines.length < 3) return false; // Need at least 3 lines
  
  // Check if lines have consistent column structure
  let columnCounts: number[] = [];
  
  for (const line of lines) {
    let columns = 0;
    
    if (line.includes('\t')) {
      columns = line.split('\t').filter(col => col.trim()).length;
    } else if (line.includes('|')) {
      columns = line.split('|').filter(col => col.trim()).length;
    } else {
      columns = line.split(/\s{3,}/).filter(col => col.trim()).length;
    }
    
    if (columns >= 2) {
      columnCounts.push(columns);
    }
  }
  
  // Need at least 70% of lines to have consistent column count
  if (columnCounts.length < lines.length * 0.7) return false;
  
  // Check for column consistency
  const avgColumns = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
  const consistentColumns = columnCounts.filter(count => Math.abs(count - avgColumns) <= 1);
  
  return consistentColumns.length >= columnCounts.length * 0.7;
}

// Helper function to check if text contains numbers
function hasNumbers(text: string): boolean {
  return /\d/.test(text);
}

// Helper function to clean Hebrew table text
function cleanHebrewTableText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Ensure proper spacing around Hebrew text
    .replace(/([a-zA-Z0-9])([א-ת])/g, '$1 $2')
    .replace(/([א-ת])([a-zA-Z0-9])/g, '$1 $2')
    // Clean up currency symbols
    .replace(/(\d)\s*([₪$€£¥])/g, '$1$2')
    .replace(/([₪$€£¥])\s*(\d)/g, '$1$2')
    // Fix Hebrew punctuation spacing
    .replace(/([א-ת])\s*([״׳])/g, '$1$2')
    .replace(/([״׳])\s*([א-ת])/g, '$1$2')
    // Clean up Hebrew abbreviations
    .replace(/ח\s*״\s*מ/g, 'ח״מ')
    .replace(/ת\s*״\s*ז/g, 'ת״ז')
    .replace(/סה\s*״\s*כ/g, 'סה״כ')
    // Normalize Hebrew date formats
    .replace(/(\d{1,2})\s*[\/\-\.]\s*(\d{1,2})\s*[\/\-\.]\s*(\d{2,4})/g, '$1/$2/$3')
    .trim();
}

function extractTablesFromOcrText(text: string, words: any[]): Array<{text: string, confidence: number}> {
  const tables: Array<{text: string, confidence: number}> = [];
  
  try {
    // Enhanced table detection for multilingual content including Hebrew
    const lineGroups: { [key: number]: any[] } = {};
    const tolerance = 15; // Increased tolerance for better line grouping
    
    // Group words by vertical position (y-coordinate)
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
      // Sort words by x-coordinate (handles both LTR and RTL)
      const sortedWords = line.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      
      // Enhanced table row detection for multilingual content
      const isTableRow = isLikelyTableRow(sortedWords);
      
      if (isTableRow) {
        if (!inTable) {
          inTable = true;
          tableLines = [];
        }
        tableLines.push(sortedWords);
      } else {
        if (inTable && tableLines.length >= 4) { // Increased from 2 to 4 lines minimum
          const tableText = convertWordsToTableText(tableLines);
          const avgConfidence = calculateAverageConfidence(tableLines);
          
          if (tableText.trim() && avgConfidence > 60) { // Increased confidence threshold
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
    
    // Handle table at end of document
    if (inTable && tableLines.length >= 4) { // Increased from 2 to 4 lines minimum
      const tableText = convertWordsToTableText(tableLines);
      const avgConfidence = calculateAverageConfidence(tableLines);
      
      if (tableText.trim() && avgConfidence > 60) { // Increased confidence threshold
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

// Enhanced table row detection for multilingual content
function isLikelyTableRow(words: any[]): boolean {
  if (words.length < 3) return false; // Need at least 3 words for a table row
  
  // Check for regular spacing patterns - more strict
  const hasRegularSpacingPattern = words.length >= 4 && checkRegularSpacing(words);
  
  // Check for numeric content (common in tables)
  const numberCount = words.filter(word => /\d/.test(word.text)).length;
  const hasSignificantNumbers = numberCount >= 2; // Need at least 2 numbers
  
  // Check for common table separators or patterns
  const hasSeparators = words.some(word => /[|│┃┆┇┊┋]/.test(word.text));
  
  // Check for aligned content (similar x-positions across rows)
  const hasAlignment = words.length >= 3;
  
  // Hebrew/RTL specific patterns - more conservative
  const hebrewWords = words.filter(word => /[\u05D0-\u05EA]/.test(word.text));
  const hasHebrewNumbers = words.some(word => /[\u05D0-\u05EA].*\d.*[\u05D0-\u05EA]|\d.*[\u05D0-\u05EA].*\d/.test(word.text));
  
  // Currency symbols common in Hebrew tables
  const hasCurrency = words.some(word => /[₪$€£¥]/.test(word.text));
  
  // Hebrew table keywords - more specific
  const hasHebrewTableKeywords = words.some(word => 
    /^(סכום|מחיר|כמות|תאריך|שם|מספר|סה״כ|סהכ|ח״מ|חמ|ת״ז|תז|קוד)$/.test(word.text)
  );
  
  // Date patterns (Hebrew and international)
  const hasDatePatterns = words.some(word => 
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(word.text)
  );
  
  // Percentage patterns
  const hasPercentages = words.some(word => /^\d+%$/.test(word.text));
  
  // Require multiple strong indicators for table detection
  const strongIndicators = [
    hasRegularSpacingPattern,
    hasSeparators,
    hasHebrewTableKeywords,
    hasDatePatterns,
    hasPercentages,
    (hasCurrency && hasSignificantNumbers),
    (hasHebrewNumbers && hebrewWords.length >= 2)
  ];
  
  const strongCount = strongIndicators.filter(Boolean).length;
  
  // Need at least 2 strong indicators or very clear separators
  return strongCount >= 2 || hasSeparators || hasRegularSpacingPattern;
}

function checkRegularSpacing(words: any[]): boolean {
  if (words.length < 4) return false; // Need at least 4 words for regular spacing
  
  const gaps = [];
  for (let i = 1; i < words.length; i++) {
    gaps.push(words[i].bbox.x0 - words[i-1].bbox.x1);
  }
  
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const hasLargeGaps = gaps.filter(gap => gap > 30).length >= gaps.length * 0.6; // 60% should have large gaps
  const hasConsistentGaps = gaps.filter(gap => Math.abs(gap - avgGap) < avgGap * 0.3).length >= gaps.length * 0.7; // 70% should be consistent
  
  return hasLargeGaps && hasConsistentGaps && avgGap > 25;
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