/**
 * parse-telegram.mjs
 * Parses Telegram Desktop HTML exports into normalized_messages.json
 * 
 * Handles:
 * - Multiple HTML files (messages.html, messages2.html, ... messages9.html)
 * - Message IDs, authors, timestamps, text
 * - "joined" messages (continuation without author re-declaration)
 * - Reply references (same-file and cross-file)
 * - Unified canonical ID namespace
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import * as cheerio from 'cheerio';

// --- Config ---
const EXPORT_DIR = resolve('C:/Users/Michael/Downloads/Telegram Desktop/ChatExport_2026-03-22');
const OUTPUT_DIR = resolve('./public/data');

const HTML_FILES = [];
for (let i = 1; i <= 20; i++) {
  const fname = i === 1 ? 'messages.html' : `messages${i}.html`;
  const fpath = join(EXPORT_DIR, fname);
  if (existsSync(fpath)) HTML_FILES.push({ index: i, path: fpath, filename: fname });
}

console.log(`Found ${HTML_FILES.length} HTML export files`);

// --- Phase 1: Parse all messages ---
const allMessages = [];
const telegramIdToCanonical = new Map(); // "filename#msgId" -> canonical_id

let canonicalCounter = 0;

for (const file of HTML_FILES) {
  console.log(`Parsing ${file.filename}...`);
  const html = readFileSync(file.path, 'utf-8');
  const $ = cheerio.load(html);

  let currentAuthor = null;

  $('div.message').each((_, el) => {
    const $el = $(el);
    const classes = $el.attr('class') || '';

    // Skip service messages (date separators, group events)
    if (classes.includes('service')) return;

    // Get message telegram ID from the element id attribute
    const elementId = $el.attr('id') || '';
    const telegramId = elementId.replace('message', '');
    if (!telegramId) return;

    // Build file-scoped key for cross-file resolution
    const fileKey = `${file.filename}#${telegramId}`;

    // Author: present in non-joined messages
    const fromName = $el.find('.from_name').first().text().trim();
    if (fromName) {
      currentAuthor = fromName;
    }

    // If still no author (shouldn't happen in valid export), skip
    if (!currentAuthor) return;

    // Timestamp from title attribute of .date.details
    const dateEl = $el.find('.date.details').first();
    const dateTitle = dateEl.attr('title') || '';
    const timestamp = parseTelegramDate(dateTitle);

    // Message text
    const textEl = $el.find('.text').first();
    if (!textEl.length) return;
    
    // Get raw HTML, then clean it
    const rawHtml = textEl.html() || '';
    const cleanedText = cleanMessageText(rawHtml);
    
    if (!cleanedText.trim()) return;

    // Reply reference
    let replyToTelegramId = null;
    let replyToFile = null;
    const replyEl = $el.find('.reply_to a').first();
    if (replyEl.length) {
      const href = replyEl.attr('href') || '';
      // Same-file: "#go_to_message10693" or with onclick
      // Cross-file: "messages8.html#go_to_message10689"
      const match = href.match(/(?:([^#]+))?#go_to_message(\d+)/);
      if (match) {
        replyToFile = match[1] || file.filename;
        replyToTelegramId = match[2];
      }
    }

    // Assign canonical ID
    const canonicalId = `msg_${String(canonicalCounter++).padStart(6, '0')}`;
    telegramIdToCanonical.set(fileKey, canonicalId);

    // Also map by just telegram ID for same-file lookups
    // Use filename to disambiguate
    allMessages.push({
      canonical_id: canonicalId,
      telegram_id: telegramId,
      source_file: file.filename,
      author: currentAuthor,
      timestamp: timestamp,
      text: cleanedText,
      _reply_to_telegram_id: replyToTelegramId,
      _reply_to_file: replyToFile,
    });
  });

  console.log(`  -> ${allMessages.length} messages so far`);
}

// --- Phase 2: Resolve reply references ---
console.log('\nResolving reply references...');

// Build a lookup: for each file, map telegram_id -> canonical_id
const fileMessageMap = new Map();
for (const msg of allMessages) {
  const key = `${msg.source_file}#${msg.telegram_id}`;
  fileMessageMap.set(key, msg.canonical_id);
}

let resolvedCount = 0;
let unresolvedCount = 0;

for (const msg of allMessages) {
  if (msg._reply_to_telegram_id) {
    const replyFile = msg._reply_to_file || msg.source_file;
    const key = `${replyFile}#${msg._reply_to_telegram_id}`;
    const resolved = fileMessageMap.get(key);
    if (resolved) {
      msg.reply_to = resolved;
      resolvedCount++;
    } else {
      msg.reply_to = null;
      unresolvedCount++;
    }
  } else {
    msg.reply_to = null;
  }

  // Clean up internal fields
  delete msg._reply_to_telegram_id;
  delete msg._reply_to_file;
}

console.log(`Resolved ${resolvedCount} reply references, ${unresolvedCount} unresolved`);

// --- Phase 3: Write output ---
const outputPath = join(OUTPUT_DIR, 'normalized_messages.json');
writeFileSync(outputPath, JSON.stringify(allMessages, null, 2));
console.log(`\nWrote ${allMessages.length} messages to ${outputPath}`);

// Print stats
const authors = new Map();
for (const msg of allMessages) {
  authors.set(msg.author, (authors.get(msg.author) || 0) + 1);
}
console.log(`\nUnique authors: ${authors.size}`);
const sortedAuthors = [...authors.entries()].sort((a, b) => b[1] - a[1]);
for (const [name, count] of sortedAuthors.slice(0, 20)) {
  console.log(`  ${name}: ${count} messages`);
}

const withReplies = allMessages.filter(m => m.reply_to).length;
console.log(`\nMessages with replies: ${withReplies}`);

const dateRange = allMessages.filter(m => m.timestamp).map(m => new Date(m.timestamp));
if (dateRange.length) {
  const min = new Date(Math.min(...dateRange));
  const max = new Date(Math.max(...dateRange));
  console.log(`Date range: ${min.toISOString().split('T')[0]} to ${max.toISOString().split('T')[0]}`);
}

// --- Source Manifest ---
const timestamps = allMessages.filter(m => m.timestamp).map(m => m.timestamp).sort();
const manifest = {
  source: {
    type: 'telegram_export',
    parser: 'parse-telegram.mjs',
    source_directory: EXPORT_DIR,
    files: HTML_FILES.map(f => ({
      filename: f.filename,
      path: f.path,
    })),
    total_files: HTML_FILES.length,
    total_messages: allMessages.length,
    date_range: timestamps.length >= 2
      ? [timestamps[0], timestamps[timestamps.length - 1]]
      : null,
    unique_authors: authors.size,
    top_authors: sortedAuthors.slice(0, 20).map(([name, count]) => ({ name, count })),
    pipeline_version: '3.0',
    parsed_at: new Date().toISOString(),
  },
  methodology: {
    format_detection: 'Telegram Desktop HTML export auto-detection',
    timestamp_handling: 'Parsed from Telegram date format (DD.MM.YYYY HH:MM:SS UTC±offset)',
    reply_inference: 'Extracted from Telegram reply_to anchor elements with cross-file resolution',
    author_detection: 'Extracted from .from_name elements with joined message continuation',
  },
};

writeFileSync(join(OUTPUT_DIR, 'source_manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nWrote source manifest to ${join(OUTPUT_DIR, 'source_manifest.json')}`);

// --- Utility functions ---

function parseTelegramDate(dateStr) {
  // Format: "13.06.2025 04:43:44 UTC-08:00"
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*(UTC[+-]\d{2}:\d{2})?/);
  if (!match) return null;
  const [, day, month, year, hour, min, sec, tz] = match;
  // Build ISO string
  const tzOffset = tz ? tz.replace('UTC', '') : '+00:00';
  return `${year}-${month}-${day}T${hour}:${min}:${sec}${tzOffset}`;
}

function cleanMessageText(html) {
  // Replace <br> with newlines
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  // Extract link text but keep URLs
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, (_, href, linkText) => {
    // If link text IS the URL, just keep it
    if (linkText.trim() === href.trim()) return href;
    // If it's a mention or named link, keep the text
    return linkText;
  });
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»');
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}
