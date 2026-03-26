/**
 * parse-markdown.mjs
 * Parses markdown conversation exports into normalized_messages.json
 * 
 * Supports:
 * - ChatGPT markdown exports (## You / ## ChatGPT pattern)
 * - Generic conversation logs (Author: message pattern)
 * - Plain markdown notes with headings as boundaries
 * - Mixed folder of .md files treated as a thread corpus
 * 
 * Usage:
 *   node scripts/parse-markdown.mjs [source_dir]
 * 
 * Default source_dir: ./markdown_threads/
 * Output: ./public/data/normalized_messages.json
 *         ./public/data/source_manifest.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename, extname } from 'path';

// ── Config ──────────────────────────────────────────────────────
const SOURCE_DIR = resolve(process.argv[2] || './markdown_threads');
const OUTPUT_DIR = resolve('./public/data');

if (!existsSync(SOURCE_DIR)) {
  console.error(`\n❌ Source directory not found: ${SOURCE_DIR}`);
  console.error(`\nUsage: node scripts/parse-markdown.mjs [path/to/markdown/folder]`);
  console.error(`\nExpected structure:`);
  console.error(`  markdown_threads/`);
  console.error(`  ├── conversation-1.md`);
  console.error(`  ├── conversation-2.md`);
  console.error(`  └── notes.md`);
  process.exit(1);
}

// ── Collect all .md files ───────────────────────────────────────
function collectMarkdownFiles(dir, depth = 0) {
  const files = [];
  if (depth > 3) return files; // max recursion depth
  
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('.')) {
      files.push(...collectMarkdownFiles(fullPath, depth + 1));
    } else if (stat.isFile() && extname(entry).toLowerCase() === '.md') {
      files.push({ path: fullPath, filename: entry, size: stat.size, modified: stat.mtime });
    }
  }
  return files;
}

const mdFiles = collectMarkdownFiles(SOURCE_DIR);
console.log(`Found ${mdFiles.length} markdown files in ${SOURCE_DIR}`);

if (mdFiles.length === 0) {
  console.error('No .md files found. Exiting.');
  process.exit(1);
}

// ── Detection: what kind of markdown is this? ───────────────────
const FORMAT_PATTERNS = {
  chatgpt: /^#{1,3}\s*(You|ChatGPT|Assistant|User|System)\s*$/m,
  colon_speaker: /^([A-Za-z][A-Za-z0-9_ ]{0,30}):\s+\S/m,
  timestamp_speaker: /^\[?\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}[^\]]*\]?\s+([A-Za-z_]+)/m,
  heading_sections: /^#{1,3}\s+.{3,}/m,
};

function detectFormat(content) {
  if (FORMAT_PATTERNS.chatgpt.test(content)) return 'chatgpt';
  if (FORMAT_PATTERNS.timestamp_speaker.test(content)) return 'timestamp_speaker';
  if (FORMAT_PATTERNS.colon_speaker.test(content)) return 'colon_speaker';
  if (FORMAT_PATTERNS.heading_sections.test(content)) return 'heading_sections';
  return 'plain_text';
}

// ── Parsers ─────────────────────────────────────────────────────

/**
 * Parse ChatGPT-style markdown: 
 * ## You
 * message text
 * ## ChatGPT
 * response text
 */
function parseChatGPTFormat(content, filename) {
  const messages = [];
  // Split on headings that are speaker names
  const sections = content.split(/^(#{1,3}\s*(?:You|ChatGPT|Assistant|User|System)\s*)$/m);
  
  let currentAuthor = null;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;
    
    // Check if this section is a heading
    const headingMatch = section.match(/^#{1,3}\s*(You|ChatGPT|Assistant|User|System)\s*$/);
    if (headingMatch) {
      currentAuthor = headingMatch[1];
      if (currentAuthor === 'User') currentAuthor = 'You';
      if (currentAuthor === 'Assistant') currentAuthor = 'ChatGPT';
      continue;
    }
    
    if (currentAuthor && section.length > 0) {
      messages.push({
        author: currentAuthor,
        text: section.replace(/^\n+|\n+$/g, ''),
        source_file: filename,
      });
    }
  }
  return messages;
}

/**
 * Parse "Speaker: message" format
 * Handles multi-line messages until next speaker
 */
function parseColonFormat(content, filename) {
  const messages = [];
  const lines = content.split('\n');
  let currentAuthor = null;
  let currentText = [];
  
  for (const line of lines) {
    const speakerMatch = line.match(/^([A-Za-z][A-Za-z0-9_ ]{0,30}):\s+(.*)/);
    if (speakerMatch) {
      // Save previous message
      if (currentAuthor && currentText.length > 0) {
        messages.push({
          author: currentAuthor,
          text: currentText.join('\n').trim(),
          source_file: filename,
        });
      }
      currentAuthor = speakerMatch[1].trim();
      currentText = [speakerMatch[2]];
    } else {
      currentText.push(line);
    }
  }
  // Don't forget the last message
  if (currentAuthor && currentText.length > 0) {
    messages.push({
      author: currentAuthor,
      text: currentText.join('\n').trim(),
      source_file: filename,
    });
  }
  return messages;
}

/**
 * Parse timestamped speaker format:
 * [2024-03-15 14:30] Alice: message text
 */
function parseTimestampFormat(content, filename) {
  const messages = [];
  const lines = content.split('\n');
  let currentAuthor = null;
  let currentTimestamp = null;
  let currentText = [];
  
  for (const line of lines) {
    const tsMatch = line.match(/^\[?(\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}(?::\d{2})?[^\]]*)\]?\s+([A-Za-z_][A-Za-z0-9_ ]*):\s*(.*)/);
    if (tsMatch) {
      if (currentAuthor && currentText.length > 0) {
        messages.push({
          author: currentAuthor,
          text: currentText.join('\n').trim(),
          timestamp: normalizeTimestamp(currentTimestamp),
          source_file: filename,
        });
      }
      currentTimestamp = tsMatch[1];
      currentAuthor = tsMatch[2].trim();
      currentText = [tsMatch[3]];
    } else {
      currentText.push(line);
    }
  }
  if (currentAuthor && currentText.length > 0) {
    messages.push({
      author: currentAuthor,
      text: currentText.join('\n').trim(),
      timestamp: normalizeTimestamp(currentTimestamp),
      source_file: filename,
    });
  }
  return messages;
}

/**
 * Parse heading-sectioned notes:
 * # Topic Name
 * Notes and thoughts about this topic...
 * ## Subtopic
 * More specific notes...
 */
function parseHeadingSections(content, filename) {
  const messages = [];
  // Use the filename (without .md) as the author
  const author = basename(filename, '.md').replace(/[-_]/g, ' ');
  const sections = content.split(/^(#{1,3}\s+.+)$/m);
  
  let currentHeading = null;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim();
    if (!section) continue;
    
    if (/^#{1,3}\s+/.test(section)) {
      currentHeading = section.replace(/^#{1,3}\s+/, '').trim();
      continue;
    }
    
    if (section.length > 10) { // Skip very short fragments
      messages.push({
        author,
        text: currentHeading ? `[${currentHeading}] ${section}` : section,
        source_file: filename,
      });
    }
  }
  return messages;
}

/**
 * Parse plain text as a single-author document
 * Split on paragraph boundaries (double newline)
 */
function parsePlainText(content, filename) {
  const messages = [];
  const author = basename(filename, '.md').replace(/[-_]/g, ' ');
  const paragraphs = content.split(/\n{2,}/);
  
  for (const para of paragraphs) {
    const text = para.trim();
    if (text.length > 15) { // Skip very short paragraphs
      messages.push({
        author,
        text,
        source_file: filename,
      });
    }
  }
  return messages;
}

// ── Timestamp normalization ─────────────────────────────────────
function normalizeTimestamp(ts) {
  if (!ts) return null;
  try {
    const d = new Date(ts.replace(/\//g, '-'));
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch { return null; }
}

// ── Main processing loop ────────────────────────────────────────
const allMessages = [];
const sourceFiles = [];
let canonicalCounter = 0;

// Sort files by modification time for rough chronological ordering
mdFiles.sort((a, b) => a.modified - b.modified);

for (const file of mdFiles) {
  console.log(`\nParsing: ${file.filename}`);
  const content = readFileSync(file.path, 'utf-8');
  const format = detectFormat(content);
  console.log(`  Format detected: ${format}`);
  
  let parsed;
  switch (format) {
    case 'chatgpt':          parsed = parseChatGPTFormat(content, file.filename); break;
    case 'colon_speaker':    parsed = parseColonFormat(content, file.filename); break;
    case 'timestamp_speaker': parsed = parseTimestampFormat(content, file.filename); break;
    case 'heading_sections': parsed = parseHeadingSections(content, file.filename); break;
    default:                 parsed = parsePlainText(content, file.filename); break;
  }
  
  console.log(`  Messages extracted: ${parsed.length}`);
  
  // Assign canonical IDs and synthetic timestamps if missing
  const fileStartTime = file.modified ? new Date(file.modified) : new Date();
  
  for (let i = 0; i < parsed.length; i++) {
    const msg = parsed[i];
    const canonicalId = `msg_${String(canonicalCounter++).padStart(6, '0')}`;
    
    // Generate synthetic timestamp if missing, spaced 30 seconds apart
    const timestamp = msg.timestamp || new Date(
      fileStartTime.getTime() - (parsed.length - i) * 30000
    ).toISOString();
    
    allMessages.push({
      canonical_id: canonicalId,
      telegram_id: null,
      source_file: msg.source_file,
      author: msg.author,
      timestamp,
      text: msg.text,
      reply_to: null,
    });
  }
  
  sourceFiles.push({
    filename: file.filename,
    path: file.path,
    format,
    messages_extracted: parsed.length,
    size_bytes: file.size,
    modified: file.modified?.toISOString() || null,
  });
}

// ── Infer reply chains ──────────────────────────────────────────
// In conversation formats, treat sequential messages between two speakers
// as implicit reply chains
console.log('\nInferring reply chains...');
let inferredReplies = 0;

for (let i = 1; i < allMessages.length; i++) {
  const prev = allMessages[i - 1];
  const curr = allMessages[i];
  
  // Only infer replies within the same source file
  if (curr.source_file !== prev.source_file) continue;
  
  // If different author, treat as reply to previous
  if (curr.author !== prev.author) {
    curr.reply_to = prev.canonical_id;
    inferredReplies++;
  }
}

console.log(`Inferred ${inferredReplies} reply relationships`);

// ── Write output ────────────────────────────────────────────────
const outputPath = join(OUTPUT_DIR, 'normalized_messages.json');
writeFileSync(outputPath, JSON.stringify(allMessages, null, 2));
console.log(`\n✅ Wrote ${allMessages.length} messages to ${outputPath}`);

// ── Write source manifest ───────────────────────────────────────
const timestamps = allMessages.filter(m => m.timestamp).map(m => m.timestamp).sort();
const authors = new Map();
for (const msg of allMessages) {
  authors.set(msg.author, (authors.get(msg.author) || 0) + 1);
}

const manifest = {
  source: {
    type: 'markdown_export',
    parser: 'parse-markdown.mjs',
    source_directory: SOURCE_DIR,
    files: sourceFiles,
    total_files: sourceFiles.length,
    total_messages: allMessages.length,
    date_range: timestamps.length >= 2 
      ? [timestamps[0], timestamps[timestamps.length - 1]]
      : null,
    unique_authors: authors.size,
    top_authors: [...authors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count })),
    pipeline_version: '3.0',
    parsed_at: new Date().toISOString(),
  },
  methodology: {
    format_detection: 'Heuristic pattern matching against known conversation formats',
    timestamp_handling: 'Preserved when present in source; synthetic timestamps generated from file modification time when absent',
    reply_inference: 'Sequential messages between different speakers treated as implicit replies within the same file',
    author_detection: 'Format-specific: heading names (ChatGPT), colon prefix (generic), filename fallback (notes)',
  },
};

const manifestPath = join(OUTPUT_DIR, 'source_manifest.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Wrote source manifest to ${manifestPath}`);

// ── Summary ─────────────────────────────────────────────────────
console.log('\n═══ Markdown Parse Summary ═══');
console.log(`  Files processed:    ${sourceFiles.length}`);
console.log(`  Total messages:     ${allMessages.length}`);
console.log(`  Unique authors:     ${authors.size}`);
console.log(`  Inferred replies:   ${inferredReplies}`);
if (timestamps.length >= 2) {
  console.log(`  Date range:         ${timestamps[0].slice(0, 10)} → ${timestamps[timestamps.length - 1].slice(0, 10)}`);
}
console.log('  Formats detected:');
const formatCounts = {};
for (const f of sourceFiles) formatCounts[f.format] = (formatCounts[f.format] || 0) + 1;
for (const [fmt, count] of Object.entries(formatCounts)) {
  console.log(`    ${fmt}: ${count} files`);
}
console.log('══════════════════════════════\n');
console.log('Next steps:');
console.log('  node scripts/analyze-data.mjs');
console.log('  node scripts/meaning-evolution.mjs');
console.log('  node scripts/detect-harmonics.mjs');
