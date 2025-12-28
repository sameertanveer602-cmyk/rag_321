# Hebrew RAG System - Usage Guide

## Overview
This RAG system is **specifically optimized for Hebrew documents** with automatic chapter and section detection, detailed responses, and perfect Hebrew support.

## Key Features

### 1. Automatic Chapter & Section Detection
The system automatically detects and tracks:
- **פרק (Perek)** - Chapters
- **סעיף (Seif)** - Sections/Clauses
- Document structure and hierarchy
- Page numbers and locations

### 2. Detailed Hebrew Responses
When you ask about any item, the system will:
- ✅ State which chapter and section it's in
- ✅ Provide comprehensive details (not summaries)
- ✅ Quote exact Hebrew terms from the document
- ✅ Include all relevant data: numbers, dates, amounts
- ✅ Explain context and background
- ✅ Reference related chapters/sections

### 3. Perfect Hebrew Support
- ✅ Hebrew text extraction from PDFs, DOCX, images
- ✅ Hebrew OCR with bilingual support (עברית + English)
- ✅ Hebrew table detection and formatting
- ✅ RTL (Right-to-Left) text direction
- ✅ Hebrew currency symbols (₪)
- ✅ Hebrew abbreviations (ח״מ, ת״ז, סה״כ)

## How to Use

### Step 1: Upload Hebrew Document
```
1. Click "Upload Document" button
2. Select your Hebrew PDF, DOCX, or image file
3. Wait for processing (automatic chapter/section detection)
4. Document is ready for queries
```

### Step 2: Ask Questions in Hebrew or English

#### Example Questions in Hebrew:
```
מה המחיר של מוצר X?
(What is the price of product X?)

באיזה פרק מופיע מידע על Y?
(In which chapter does information about Y appear?)

מה הסכום הכולל בטבלה?
(What is the total amount in the table?)

תן לי פירוט מלא על Z
(Give me full details about Z)
```

#### Example Questions in English:
```
What is the price of product X?
In which chapter does information about Y appear?
What is the total amount in the table?
Give me full details about Z
```

### Step 3: Get Detailed Responses

The system will provide:

#### Response Structure:
```html
<h1>תשובה ישירה (Direct Answer)</h1>
<p>Direct answer to your question</p>

<h2>מיקום במסמך (Location in Document)</h2>
<p>המידע נמצא בפרק "שם הפרק", סעיף "שם הסעיף", עמוד 5</p>
<cite>על פי פרק "שם הפרק", סעיף "שם הסעיף"</cite>

<h2>פירוט מלא (Full Details)</h2>
<p>Comprehensive explanation with all relevant information:</p>
<ul>
  <li>Specific data point 1</li>
  <li>Specific data point 2</li>
  <li>Exact Hebrew terms: "מונח בעברית"</li>
</ul>

<h2>הקשר נוסף (Additional Context)</h2>
<p>Related information from other chapters/sections</p>
```

## Example Usage Scenarios

### Scenario 1: Finding Item Price

**Question (Hebrew):**
```
מה המחיר של מוצר "שולחן עץ"?
```

**Expected Response:**
```html
<h1>מחיר מוצר "שולחן עץ"</h1>

<h2>מיקום במסמך</h2>
<p>המידע נמצא בפרק "מחירון מוצרים", סעיף "ריהוט", עמוד 12</p>
<cite>על פי פרק "מחירון מוצרים", סעיף "ריהוט"</cite>

<h2>פירוט מלא</h2>
<p>מחיר מוצר "שולחן עץ" הוא <strong>1,500₪</strong></p>
<ul>
  <li>קוד מוצר: 12345</li>
  <li>גודל: 120x80 ס"מ</li>
  <li>חומר: עץ אלון מלא</li>
  <li>זמן אספקה: 14 ימי עסקים</li>
</ul>

<h2>הקשר נוסף</h2>
<p>מוצרים דומים מופיעים גם בפרק "ריהוט משרדי", סעיף "שולחנות"</p>
```

### Scenario 2: Finding Information in Tables

**Question (English):**
```
Show me the financial summary table
```

**Expected Response:**
```html
<h1>Financial Summary Table</h1>

<h2>Location in Document</h2>
<p>The table appears in Chapter "Financial Reports", Section "Annual Summary", Page 25</p>
<cite>According to Chapter "Financial Reports", Section "Annual Summary"</cite>

<h2>Table Data</h2>
<!-- טבלה/TABLE START -->
<table class="data-table hebrew-table" dir="rtl">
  <caption>סיכום פיננסי שנתי (Annual Financial Summary)</caption>
  <thead>
    <tr>
      <th dir="rtl">פריט (Item)</th>
      <th dir="rtl">סכום (Amount)</th>
      <th dir="rtl">אחוז (Percentage)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td dir="rtl">הכנסות</td>
      <td dir="rtl">1,000,000₪</td>
      <td dir="rtl">100%</td>
    </tr>
    <tr>
      <td dir="rtl">הוצאות</td>
      <td dir="rtl">750,000₪</td>
      <td dir="rtl">75%</td>
    </tr>
    <tr class="total-row">
      <td dir="rtl"><strong>רווח נקי</strong></td>
      <td dir="rtl"><strong>250,000₪</strong></td>
      <td dir="rtl"><strong>25%</strong></td>
    </tr>
  </tbody>
</table>
<!-- טבלה/TABLE END -->

<h2>Analysis</h2>
<p>The table shows a net profit of 250,000₪, representing 25% profit margin.</p>
```

### Scenario 3: Multi-Chapter Information

**Question (Hebrew):**
```
תן לי מידע מלא על דרישות הבטיחות
```

**Expected Response:**
```html
<h1>דרישות בטיחות - מידע מלא</h1>

<h2>מיקום במסמך</h2>
<p>המידע מופיע במספר מקומות:</p>
<ul>
  <li><cite>פרק "בטיחות כללית", סעיף "דרישות יסוד"</cite></li>
  <li><cite>פרק "ציוד מגן", סעיף "רשימת ציוד חובה"</cite></li>
  <li><cite>פרק "נהלי חירום", סעיף "הוראות בטיחות"</cite></li>
</ul>

<h2>פירוט מלא</h2>

<h3>דרישות יסוד (פרק "בטיחות כללית")</h3>
<ol>
  <li>חובת לבישת ציוד מגן אישי בכל עת</li>
  <li>הכשרת בטיחות חובה לכל העובדים</li>
  <li>בדיקות תקופתיות של ציוד הבטיחות</li>
</ol>

<h3>ציוד מגן חובה (פרק "ציוד מגן")</h3>
<ul>
  <li>קסדת מגן - תקן ת"י 1397</li>
  <li>משקפי מגן - תקן ת"י 1398</li>
  <li>נעלי בטיחות - תקן ת"י 1399</li>
  <li>אוזניות מגן - תקן ת"י 1400</li>
</ul>

<h3>נהלי חירום (פרק "נהלי חירום")</h3>
<p>במקרה חירום יש לפעול לפי הנהלים המפורטים בסעיף "הוראות בטיחות":</p>
<ol>
  <li>הפסקת עבודה מיידית</li>
  <li>פינוי מסודר של כל העובדים</li>
  <li>התראה למנהל הבטיחות</li>
  <li>תיעוד האירוע</li>
</ol>

<h2>הקשר נוסף</h2>
<p>מידע נוסף על בטיחות מופיע גם בפרק "אחריות משפטית", סעיף "חובות המעסיק"</p>
```

## Query Tips for Best Results

### 1. Be Specific
❌ Bad: "מה כתוב?"
✅ Good: "מה המחיר של מוצר X בפרק Y?"

### 2. Use Hebrew Keywords
- מחיר (Price)
- סכום (Amount)
- כמות (Quantity)
- תאריך (Date)
- פרק (Chapter)
- סעיף (Section)
- טבלה (Table)
- רשימה (List)

### 3. Ask for Details
❌ Bad: "מידע על X"
✅ Good: "תן לי פירוט מלא על X כולל מחיר, כמות ומיקום במסמך"

### 4. Reference Structure
✅ "באיזה פרק מופיע...?"
✅ "מה כתוב בסעיף...?"
✅ "תן לי את כל המידע מפרק..."

## Response Features

### Automatic Features:
1. **Chapter/Section Citation**: Always included when available
2. **Detailed Explanations**: Comprehensive, not brief
3. **Exact Quotes**: Hebrew terms quoted exactly
4. **Structured Format**: Clear HTML hierarchy
5. **Table Formatting**: Proper HTML tables with RTL support
6. **Context**: Related information from other sections

### Hebrew-Specific Features:
1. **RTL Text Direction**: `dir="rtl"` for Hebrew content
2. **Currency Symbols**: ₪ (Shekel) preserved
3. **Abbreviations**: ח״מ, ת״ז, סה״כ maintained
4. **Date Formats**: Hebrew date formats preserved
5. **Terminology**: Hebrew business/legal terms intact

## Troubleshooting

### Issue: Response is too brief
**Solution**: Ask for "פירוט מלא" (full details) or "מידע מפורט" (detailed information)

### Issue: Chapter/Section not mentioned
**Solution**: The document may not have clear chapter/section markers. Try asking: "באיזה חלק של המסמך...?"

### Issue: Hebrew text appears wrong
**Solution**: Ensure your browser supports Hebrew (RTL) text. The system uses `dir="rtl"` attributes.

### Issue: Table not formatted properly
**Solution**: The system only formats actual tables (2+ columns, 3+ rows). Lists and paragraphs are not formatted as tables.

## Best Practices

### For Document Upload:
1. ✅ Use clear Hebrew fonts in PDFs
2. ✅ Ensure good scan quality for OCR
3. ✅ Include clear chapter/section headings
4. ✅ Use standard Hebrew formatting

### For Queries:
1. ✅ Ask in Hebrew for Hebrew documents
2. ✅ Be specific about what you need
3. ✅ Request chapter/section information
4. ✅ Ask for detailed explanations

### For Tables:
1. ✅ Ask to "show the table" or "הצג את הטבלה"
2. ✅ Request specific table by chapter/section
3. ✅ Ask for explanation of table data
4. ✅ Request totals and summaries

## Example Queries

### Financial Documents:
```
מה הסכום הכולל בטבלת ההוצאות?
באיזה פרק מופיעה טבלת ההכנסות?
תן לי פירוט מלא של כל הסכומים בפרק "תקציב"
```

### Legal Documents:
```
מה כתוב בסעיף 5 של פרק "התחייבויות"?
תן לי את כל הדרישות מפרק "תנאים כלליים"
באיזה סעיף מופיעה ההגדרה של "צד ג'"?
```

### Technical Documents:
```
מה המפרט הטכני של מוצר X?
תן לי את כל דרישות ההתקנה מפרק "הוראות התקנה"
באיזה פרק מופיעה טבלת המידות?
```

## Summary

This Hebrew RAG system provides:
- ✅ **Automatic chapter/section detection**
- ✅ **Detailed, comprehensive responses**
- ✅ **Perfect Hebrew support with RTL**
- ✅ **Exact location references**
- ✅ **Complete table formatting**
- ✅ **Bilingual capability (Hebrew/English)**

Ask questions naturally in Hebrew or English, and get detailed answers with exact chapter and section references!
