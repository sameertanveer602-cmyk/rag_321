# Hebrew RAG System - Complete Guide

## Overview
This RAG system is **fully optimized for Hebrew documents** with comprehensive support for:
- ✅ Hebrew text extraction from PDFs, DOCX, images
- ✅ Hebrew OCR with Tesseract
- ✅ Hebrew table detection and extraction
- ✅ Hebrew-aware chunking and embedding
- ✅ RTL (Right-to-Left) text direction support
- ✅ Hebrew currency symbols (₪) and formatting
- ✅ Hebrew-English bilingual content

## Text Extraction Libraries

### 1. PDF Extraction: `pdf-parse`
**Purpose**: Extract text from PDF files

**Hebrew Support**:
- ✅ Extracts Hebrew text natively
- ✅ Preserves Hebrew character encoding (UTF-8)
- ✅ Handles mixed Hebrew-English content
- ✅ Supports Hebrew fonts and Unicode

**Usage in System**:
```typescript
import pdfParse from 'pdf-parse';

const pdfData = await pdfParse(buffer);
const text = pdfData.text; // Contains Hebrew text
```

### 2. DOCX Extraction: `mammoth`
**Purpose**: Extract text and tables from Word documents

**Hebrew Support**:
- ✅ Extracts Hebrew text from DOCX files
- ✅ Preserves Hebrew formatting
- ✅ Handles Hebrew tables
- ✅ Supports RTL text direction

**Usage in System**:
```typescript
import * as mammoth from 'mammoth';

const textResult = await mammoth.extractRawText({ buffer });
const hebrewText = textResult.value;

const htmlResult = await mammoth.convertToHtml({ buffer });
const hebrewTables = extractTablesFromHtml(htmlResult.value);
```

### 3. OCR: `tesseract.js`
**Purpose**: Extract text from images and scanned documents

**Hebrew Support**:
- ✅ **Bilingual OCR**: English + Hebrew simultaneously
- ✅ Hebrew character recognition
- ✅ Hebrew table detection
- ✅ Mixed Hebrew-English content

**Configuration**:
```typescript
import { createWorker, PSM } from 'tesseract.js';

// Initialize with both English and Hebrew
const worker = await createWorker(['eng', 'heb'], 1, {
  logger: (m) => console.log(`OCR progress: ${(m.progress * 100).toFixed(1)}%`)
});

// Configure for Hebrew
await worker.setParameters({
  tessedit_pageseg_mode: PSM.AUTO, // Automatic page segmentation
  preserve_interword_spaces: '1',  // Preserve spacing
  // NO character whitelist - allows Hebrew characters
});

const { data: { text, confidence } } = await worker.recognize(imageBuffer);
```

## Hebrew Table Detection

### Detection Patterns
The system detects Hebrew tables using multiple indicators:

#### 1. Hebrew Currency Symbols
```typescript
const hasCurrency = /[₪$€£¥]/.test(text);
```

#### 2. Hebrew Table Keywords
```typescript
const hebrewTableKeywords = /סכום|מחיר|כמות|תאריך|שם|מספר|סה״כ|סהכ|ח״מ|חמ|ת״ז|תז|קוד|רשימה|פירוט|תיאור|טבלה|נתונים|דוח|סטטיסטיקה/;
```

**Common Hebrew Table Terms**:
- סכום (Amount)
- מחיר (Price)
- כמות (Quantity)
- תאריך (Date)
- שם (Name)
- מספר (Number)
- סה״כ / סהכ (Total)
- ח״מ / חמ (Signature)
- ת״ז / תז (ID Number)
- קוד (Code)
- רשימה (List)
- פירוט (Details)
- תיאור (Description)
- טבלה (Table)
- נתונים (Data)
- דוח (Report)
- סטטיסטיקה (Statistics)

#### 3. Hebrew Number Patterns
```typescript
const hasHebrewNumbers = /[\u05D0-\u05EA].*\d.*[\u05D0-\u05EA]|\d.*[\u05D0-\u05EA].*\d/.test(text);
```

#### 4. Hebrew Date Formats
```typescript
const hasDatePatterns = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(text);
```

### Table Extraction Process

1. **Detection**: Identify table-like structures
2. **Validation**: Verify it's actually a table (not regular text)
3. **Extraction**: Extract with proper structure
4. **Cleaning**: Clean Hebrew text and formatting
5. **Marking**: Add Hebrew table markers

```typescript
// Hebrew table markers
const markedTable = `[טבלה/TABLE START]\n${tableText}\n[טבלה/TABLE END]`;
```

## Hebrew Text Cleaning

### Cleaning Functions

#### 1. Clean Hebrew Table Text
```typescript
function cleanHebrewTableForStorage(tableText: string): string {
  return tableText
    // Normalize whitespace
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
```

#### 2. Clean OCR Text
```typescript
function cleanOcrText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[|]{2,}/g, '|')
    .replace(/[-]{3,}/g, '---')
    .replace(/[_]{3,}/g, '___')
    .trim();
}
```

## Hebrew Chunking Strategy

### Special Handling for Hebrew Content

```typescript
// Detect Hebrew content
const hasHebrew = /[\u05D0-\u05EA]/.test(text);

// Adjust chunk size for Hebrew
if (hasHebrew) {
  adaptiveChunkSize = Math.min(adaptiveChunkSize, 900);
  adaptiveOverlap = Math.max(adaptiveOverlap, 100);
}
```

### Hebrew Table Chunking

**Hebrew tables are ALWAYS kept complete** (single chunk):
```typescript
if (hasHebrew || hasHebrewTableKeywords || tableText.length <= 1000) {
  // Keep complete as single chunk
  chunks.push({
    text: cleanedTableText,
    metadata: {
      is_table_chunk: true,
      is_hebrew_table: true,
      table_language: 'hebrew',
      complete_table_preserved: true
    }
  });
}
```

## Hebrew Response Generation

### HTML Table Format with RTL Support

```html
<!-- טבלה/TABLE START -->
<table class="data-table hebrew-table" dir="rtl">
  <caption>כותרת הטבלה (Table Title)</caption>
  <thead>
    <tr>
      <th dir="rtl">שם המוצר (Product Name)</th>
      <th dir="rtl">מחיר (Price)</th>
      <th dir="rtl">כמות (Quantity)</th>
      <th dir="rtl">סה״כ (Total)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td dir="rtl">מוצר א</td>
      <td dir="rtl">100₪</td>
      <td dir="rtl">5</td>
      <td dir="rtl"><strong>500₪</strong></td>
    </tr>
    <tr>
      <td dir="rtl">מוצר ב</td>
      <td dir="rtl">250₪</td>
      <td dir="rtl">2</td>
      <td dir="rtl"><strong>500₪</strong></td>
    </tr>
    <tr class="total-row">
      <td dir="rtl"><strong>סה״כ (Grand Total)</strong></td>
      <td dir="rtl"></td>
      <td dir="rtl"></td>
      <td dir="rtl"><strong>1,000₪</strong></td>
    </tr>
  </tbody>
</table>
<!-- טבלה/TABLE END -->
```

### Key Features:
- `dir="rtl"` for right-to-left text direction
- Hebrew table markers as HTML comments
- Proper currency symbol placement (₪)
- Hebrew-English bilingual headers
- Semantic HTML structure

## Language Detection

### Automatic Language Detection
```typescript
function detectContentLanguages(chunks: RetrievedChunk[]): {
  primary: string;
  isMultilingual: boolean;
  languages: string[];
} {
  const languagePatterns = {
    hebrew: /[\u0590-\u05FF]/,
    arabic: /[\u0600-\u06FF]/,
    english: /[a-zA-Z]/
  };
  
  // Count characters for each language
  // Determine primary language
  // Check if multilingual
  
  return {
    primary: 'hebrew',
    isMultilingual: true,
    languages: ['hebrew', 'english']
  };
}
```

### Multilingual Response Instructions

```typescript
const languageInstructions = `
- The sources contain content in multiple languages, with Hebrew (עברית) being primary
- RESPOND in the same language as the user's question
- If the user asks in English but sources are in Hebrew, provide the answer in English but include original Hebrew citations
- If the user asks in Hebrew, respond in Hebrew
- Always preserve the original language of direct quotes and citations
- When translating concepts, provide both the original term and translation
`;
```

## Embedding Strategy for Hebrew

### Gemini Embeddings
The system uses Google's Gemini `text-embedding-004` model which:
- ✅ Supports Hebrew natively
- ✅ Handles multilingual content
- ✅ 768-dimensional embeddings
- ✅ Optimized for semantic search

```typescript
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GEMINI_API_KEY,
  modelName: 'text-embedding-004'
});
```

### Hebrew-Aware Chunking
- Hebrew tables: Single complete chunk
- Hebrew text: Adjusted chunk size (≤900 chars)
- Hebrew-English mix: Increased overlap (≥100 chars)

## Testing with Hebrew Documents

### Supported File Types
1. **PDF**: Hebrew text, tables, mixed content
2. **DOCX**: Hebrew documents with tables
3. **Images**: Scanned Hebrew documents (OCR)
4. **PPTX**: Hebrew presentations

### Test Document Recommendations
- Financial reports in Hebrew (with ₪ currency)
- Government forms with Hebrew tables
- Mixed Hebrew-English business documents
- Scanned Hebrew documents (for OCR testing)

### Expected Output

**Console Output**:
```
📊 Processing table chunk: Hebrew=true, Currency=true, Keywords=true
🔤 Creating complete table as single chunk to preserve structure
✅ Created 1 unique chunks
📊 Coverage: 1250/1250 chars (100.0%)
🎯 Zero duplicates guaranteed via content hashing
```

**Response Format**:
- Hebrew tables in proper HTML format
- RTL text direction preserved
- Currency symbols (₪) maintained
- Hebrew keywords and abbreviations intact

## Troubleshooting Hebrew Issues

### Issue: Hebrew Text Appears as Gibberish
**Solution**: Ensure UTF-8 encoding throughout the pipeline
```typescript
const text = buffer.toString('utf-8');
```

### Issue: Hebrew Tables Not Detected
**Solution**: Check if Hebrew keywords are present
```typescript
const hasHebrewKeywords = /סכום|מחיר|כמות/.test(text);
```

### Issue: RTL Text Direction Wrong
**Solution**: Add `dir="rtl"` attribute to HTML elements
```html
<td dir="rtl">טקסט בעברית</td>
```

### Issue: Currency Symbols Misplaced
**Solution**: Clean currency symbol spacing
```typescript
text = text.replace(/(\d)\s*₪/g, '$1₪');
```

## Performance Optimization for Hebrew

### 1. Hebrew Table Optimization
- Keep Hebrew tables complete (no splitting)
- Single chunk per Hebrew table
- Faster retrieval and better context

### 2. OCR Optimization
- Bilingual OCR (eng+heb) in single pass
- Confidence threshold: 30% for Hebrew (lower than English)
- Automatic page segmentation

### 3. Embedding Optimization
- Adaptive chunk sizes for Hebrew content
- Increased overlap for context preservation
- Deduplication via content hashing

## Best Practices

### 1. Document Preparation
- ✅ Use clear Hebrew fonts in PDFs
- ✅ Ensure high-quality scans for OCR
- ✅ Include table headers in Hebrew
- ✅ Use standard Hebrew date formats

### 2. Query Formulation
- ✅ Ask questions in Hebrew for Hebrew documents
- ✅ Use Hebrew table keywords (סכום, מחיר, etc.)
- ✅ Include currency symbols (₪) in queries
- ✅ Use Hebrew abbreviations (סה״כ, ח״מ, etc.)

### 3. Response Validation
- ✅ Check RTL text direction
- ✅ Verify currency symbols are correct
- ✅ Ensure Hebrew abbreviations are intact
- ✅ Validate table structure preservation

## Summary

This RAG system is **production-ready for Hebrew documents** with:

✅ **Complete Hebrew Support**: Text extraction, OCR, tables  
✅ **Bilingual Capability**: Hebrew-English mixed content  
✅ **RTL Support**: Proper text direction in responses  
✅ **Currency Handling**: Israeli Shekel (₪) and others  
✅ **Table Preservation**: Hebrew tables kept complete  
✅ **Semantic Search**: Hebrew-aware embeddings  
✅ **Optimized Performance**: Adaptive chunking for Hebrew  

The system uses industry-standard libraries (`pdf-parse`, `mammoth`, `tesseract.js`) with proper Hebrew configuration and custom Hebrew-aware processing logic.
