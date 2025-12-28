const fs = require('fs');
const text = fs.readFileSync('DOC-20251221-WA0002_251225_170430.txt', 'utf-8');
const lines = text.split('\n');

console.log('First 50 lines of the document:\n');
lines.slice(0, 50).forEach((line, i) => {
  console.log(`${String(i+1).padStart(3, ' ')}: ${line}`);
});

console.log('\n\nSearching for specific patterns:\n');

// Search for specific Hebrew words
const searchTerms = ['הקדמה', 'עקרונות', 'טבלה', 'דוגמה', 'סעיף'];
searchTerms.forEach(term => {
  const found = [];
  lines.forEach((line, i) => {
    if (line.includes(term)) {
      found.push({ line: i + 1, text: line.trim().substring(0, 100) });
    }
  });
  console.log(`\n"${term}" found ${found.length} times:`);
  found.slice(0, 5).forEach(f => {
    console.log(`   Line ${f.line}: ${f.text}`);
  });
  if (found.length > 5) {
    console.log(`   ... and ${found.length - 5} more`);
  }
});
