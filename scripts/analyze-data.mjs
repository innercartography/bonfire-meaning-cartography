/**
 * analyze-data.mjs — PASS 2
 * Rebuilt analysis pipeline with:
 * - Sharper concept filtering (20-30 high-value concepts)
 * - Better term merging/normalization
 * - Meaningful clusters with plain-English labels
 * - Richer actor modeling with drift/novelty metrics
 * - Stronger relation typing
 * - Temporal era segmentation
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const DATA_DIR = resolve('./public/data');
const messages = JSON.parse(readFileSync(join(DATA_DIR, 'normalized_messages.json'), 'utf-8'));

console.log(`Loaded ${messages.length} messages`);

// ============================================================
// UTILITIES
// ============================================================
const msgById = new Map();
for (const m of messages) msgById.set(m.canonical_id, m);

function getWeekBucket(timestamp) {
  if (!timestamp) return 'unknown';
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const week = Math.floor((d.getTime() - new Date(year, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Divide the full timeline into thirds
const allTimestamps = messages.filter(m => m.timestamp).map(m => m.timestamp).sort();
const totalMsgs = allTimestamps.length;
const ERA_BOUNDARIES = {
  early_end: allTimestamps[Math.floor(totalMsgs / 3)],
  mid_end: allTimestamps[Math.floor(totalMsgs * 2 / 3)],
};
function getEra(ts) {
  if (!ts) return 'unknown';
  if (ts <= ERA_BOUNDARIES.early_end) return 'early';
  if (ts <= ERA_BOUNDARIES.mid_end) return 'middle';
  return 'late';
}

// ============================================================
// EXPANDED STOPWORDS — aggressively filter non-conceptual terms
// ============================================================
const STOPWORDS = new Set([
  // Standard
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can',
  'could','of','in','to','for','with','on','at','from','by','about','as','into',
  'through','during','before','after','above','below','between','under','again',
  'further','then','once','here','there','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','nor','not','only',
  'own','same','so','than','too','very','just','because','but','and','or','if',
  'while','up','out','that','this','these','those','what','which','who','whom',
  'it','its','you','your','we','our','they','them','their','he','she','him','her',
  'me','my','i','also','like','get','got','one','two','three','much','many',
  'really','right','well','know','think','make','see','go','come','take','give',
  'say','want','need','way','look','use','even','thing','things','something',
  'anything','nothing','yeah','yes','no','ok','okay','hey','hi','hello','thanks',
  'thank','lol','haha','sure','cool','nice','good','great','going','actually',
  'maybe','still','already','someone','people','let','bit','lot','kind','part',
  'try','new','work','keep','put','back','don','re','ve','ll','doesn','didn',
  'isn','wasn','aren','won','wouldn','couldn','shouldn','hasn','haven','welcome',
  'join','joined','group','chat','message','send','sent','reply','feel','free',
  'question','anyone','definitely','probably','absolutely','exactly','literally',
  'basically','happening','happen','happens','happened','always','never',
  'sometimes','everything','nothing','anything','point','start','help','time',
  'idea','around','different','thought','big','real','first','last','next','long',
  'own','since','able','done','made','making','etc','now','rather','any','love',
  'everyone','important','interesting','talking','understand','believe','working',
  'means','meaning','based','looking','whole','place','move','moving','call',
  'called','calling','true','process','create','creating','align','aligned',
  'level','sense','using','specific','explore','example','model','build','begin',
  'run','running','world','through','over','become','becomes','turn','turns',
  'talk','talking','matter','matters','set','sets','version','entire','focus',
  'define','potential','allow','allows','present','action','actions','plays',
  'playing','play','clear','open','shared','sharing','share','bring','brings',
  'role','roles','play','type','types','form','forms','value','values','high',
  'exist','exists','consider','directly','completely',
  // Chat noise
  'lmao','omg','wow','wait','gonna','wanna','kinda','gotta','btw','imo','imho',
  'nah','yep','yup','sup','bruh','dude','guys','yo','tbh','rn','dm','pic',
]);

// ============================================================
// CURATED SEED CONCEPTS with merge groups
// ============================================================
const CONCEPT_SEEDS = {
  // Infrastructure
  'knowledge graph': { category: 'infra', terms: ['knowledge graph', 'knowledge graphs', 'kg'] },
  'graph': { category: 'infra', terms: ['graph', 'graphs', 'graph-based'] },
  'protocol': { category: 'infra', terms: ['protocol', 'protocols'] },
  'infrastructure': { category: 'infra', terms: ['infrastructure', 'infra'] },
  'blockchain': { category: 'infra', terms: ['blockchain', 'blockchains', 'on-chain', 'onchain'] },
  'ethereum': { category: 'infra', terms: ['ethereum', 'eth'] },
  'token': { category: 'infra', terms: ['token', 'tokens', 'tokenization', 'tokenized'] },
  'node': { category: 'infra', terms: ['node', 'nodes'] },
  'network': { category: 'infra', terms: ['network', 'networks', 'mesh'] },
  'web3': { category: 'infra', terms: ['web3', 'web 3'] },
  'data': { category: 'infra', terms: ['data', 'dataset', 'datasets'] },
  
  // Narrative / symbolic
  'narrative': { category: 'narrative', terms: ['narrative', 'narratives', 'storytelling'] },
  'storyliving': { category: 'narrative', terms: ['storyliving', 'story living', 'storylive'] },
  'lore': { category: 'narrative', terms: ['lore', 'worldbuilding', 'world building', 'worldbuild'] },
  'canon': { category: 'narrative', terms: ['canon', 'canonical'] },
  'myth': { category: 'narrative', terms: ['myth', 'myths', 'mythology', 'mythic', 'mythological'] },
  'screenplay': { category: 'narrative', terms: ['screenplay', 'screenwriting', 'script'] },
  
  // Governance / coordination
  'governance': { category: 'governance', terms: ['governance', 'govern'] },
  'coordination': { category: 'governance', terms: ['coordination', 'coordinate', 'coordinating'] },
  'decentralization': { category: 'governance', terms: ['decentralization', 'decentralize', 'decentralized'] },
  'dao': { category: 'governance', terms: ['dao', 'daos'] },
  'stewardship': { category: 'governance', terms: ['stewardship', 'steward', 'stewards'] },
  'sovereignty': { category: 'governance', terms: ['sovereignty', 'sovereign'] },
  
  // Social / community
  'community': { category: 'social', terms: ['community', 'communities'] },
  'identity': { category: 'social', terms: ['identity', 'identities'] },
  'trust': { category: 'social', terms: ['trust', 'trustless', 'trustworthy'] },
  'collective intelligence': { category: 'social', terms: ['collective intelligence', 'collective', 'swarm intelligence'] },
  'culture': { category: 'social', terms: ['culture', 'cultural', 'cultures'] },
  
  // Hybrid / conceptual
  'agent': { category: 'hybrid', terms: ['agent', 'agents', 'agentic', 'agent-based'] },
  'ai': { category: 'hybrid', terms: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'llms'] },
  'memory': { category: 'hybrid', terms: ['memory', 'memories', 'recall'] },
  'resilience': { category: 'hybrid', terms: ['resilience', 'resilient', 'antifragile'] },
  'emergence': { category: 'hybrid', terms: ['emergence', 'emergent', 'emerging'] },
  'territory': { category: 'hybrid', terms: ['territory', 'territories', 'territorial'] },
  'framework': { category: 'hybrid', terms: ['framework', 'frameworks'] },
  'cosmolocal': { category: 'hybrid', terms: ['cosmolocal', 'cosmo-local', 'cosmo local'] },
  
  // Symbolic / philosophical
  'archetype': { category: 'symbolic', terms: ['archetype', 'archetypes', 'archetypal'] },
  'ontology': { category: 'symbolic', terms: ['ontology', 'ontological', 'ontologies'] },
  'consciousness': { category: 'symbolic', terms: ['consciousness', 'conscious', 'awareness'] },
  'sacred': { category: 'symbolic', terms: ['sacred', 'sacredness'] },
  'ritual': { category: 'symbolic', terms: ['ritual', 'rituals', 'ceremony', 'ceremonies'] },
};

// ============================================================
// STEP 1: CONCEPT EXTRACTION — seed-first, then discover
// ============================================================
console.log('\n--- Concept Extraction (Pass 2) ---');

function tokenize(text) {
  return text.toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function getBigrams(tokens) {
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const bg = `${tokens[i]} ${tokens[i + 1]}`;
    if (!STOPWORDS.has(tokens[i]) && !STOPWORDS.has(tokens[i + 1])) {
      bigrams.push(bg);
    }
  }
  return bigrams;
}

// Phase A: Match seed concepts against messages
const seedMatches = new Map();
for (const [conceptLabel, config] of Object.entries(CONCEPT_SEEDS)) {
  seedMatches.set(conceptLabel, {
    label: conceptLabel,
    category: config.category,
    terms: config.terms,
    messages: [],
    authors: new Set(),
    weekBuckets: new Set(),
    eras: { early: 0, middle: 0, late: 0 },
  });
}

for (const msg of messages) {
  const textLower = msg.text.toLowerCase();
  const week = getWeekBucket(msg.timestamp);
  const era = getEra(msg.timestamp);

  for (const [conceptLabel, config] of Object.entries(CONCEPT_SEEDS)) {
    const matched = config.terms.some(term => {
      if (term.includes(' ')) return textLower.includes(term);
      return new RegExp(`\\b${term}\\b`).test(textLower);
    });
    if (matched) {
      const entry = seedMatches.get(conceptLabel);
      entry.messages.push(msg.canonical_id);
      entry.authors.add(msg.author);
      entry.weekBuckets.add(week);
      entry.eras[era]++;
    }
  }
}

// Phase B: Discover non-seed concepts from frequency analysis
const termStats = new Map();
for (const msg of messages) {
  const tokens = tokenize(msg.text);
  const bigrams = getBigrams(tokens);
  const allTerms = [...new Set([...tokens, ...bigrams])];
  const week = getWeekBucket(msg.timestamp);

  for (const term of allTerms) {
    // Skip if it's already covered by a seed concept
    let coveredBySeed = false;
    for (const config of Object.values(CONCEPT_SEEDS)) {
      if (config.terms.includes(term)) { coveredBySeed = true; break; }
    }
    if (coveredBySeed) continue;

    if (!termStats.has(term)) {
      termStats.set(term, { term, count: 0, authors: new Set(), weeks: new Set(), msgs: [] });
    }
    const s = termStats.get(term);
    s.count++;
    s.authors.add(msg.author);
    s.weeks.add(week);
    s.msgs.push(msg.canonical_id);
  }
}

// Phase C: Promote discovered terms — strict criteria
const discoveredConcepts = [];
for (const [term, stats] of termStats.entries()) {
  if (stats.count < 15) continue; // higher threshold
  if (stats.authors.size < 4) continue; // must be multi-author
  if (stats.weeks.size < 4) continue; // must span time
  if (term.length < 4) continue; // no short words

  // Check context diversity
  const uniqueContexts = new Set();
  for (const id of stats.msgs.slice(0, 40)) {
    const msg = msgById.get(id);
    if (msg) uniqueContexts.add(msg.text.slice(0, 80));
  }
  const diversity = uniqueContexts.size / Math.min(stats.msgs.length, 40);
  if (diversity < 0.5) continue;

  // Extra blocklist for chat-speak and usernames
  const EXTRA_BLOCK = /^(plat0x|jb87ua|socrat|kropp|josh|egg|mila|bret|iqra|pixie|juan|tessa|daniel|pablo|francesca|sizzle|rose|safeguard|syntony|phillip|http|www|gm|ser|fren|anon|defi|nft|nfts|based|pretty|quite|super|best|ever|seem|seems|getting|trying|saying|coming|sitting|having|taking|giving|letting|telling|showing|putting|setting|thinking|looking|finding|asking|being|system|systems|human|humans|building|crypto|web3)$/;
  if (EXTRA_BLOCK.test(term)) continue;

  discoveredConcepts.push({
    label: term,
    category: 'discovered',
    terms: [term],
    count: stats.count,
    author_count: stats.authors.size,
    week_count: stats.weeks.size,
    diversity,
  });
}
discoveredConcepts.sort((a, b) => {
  const scoreA = a.count * 0.3 + a.author_count * 15 + a.week_count * 5 + a.diversity * 50;
  const scoreB = b.count * 0.3 + b.author_count * 15 + b.week_count * 5 + b.diversity * 50;
  return scoreB - scoreA;
});

console.log(`Discovered ${discoveredConcepts.length} potential non-seed concepts`);
console.log('Top discovered:', discoveredConcepts.slice(0, 10).map(c => `${c.label}(${c.count})`).join(', '));

// Phase D: Build final concept set (20-30 total)
const SEED_MIN_MENTIONS = 8;
const SEED_MIN_AUTHORS = 2;

const finalConcepts = [];
const mergeDebug = [];

// Add qualifying seed concepts
for (const [label, entry] of seedMatches.entries()) {
  if (entry.messages.length < SEED_MIN_MENTIONS) {
    mergeDebug.push({ label, action: 'rejected_seed', reason: `only ${entry.messages.length} mentions`, count: entry.messages.length });
    continue;
  }
  if (entry.authors.size < SEED_MIN_AUTHORS) {
    mergeDebug.push({ label, action: 'rejected_seed', reason: `only ${entry.authors.size} authors`, count: entry.messages.length });
    continue;
  }

  // Check for subsumption: skip "graph" if "knowledge graph" is much bigger
  if (label === 'graph') {
    const kgEntry = seedMatches.get('knowledge graph');
    // Keep both — they're distinct concepts
  }

  finalConcepts.push({
    id: `concept_${label.replace(/[^a-z0-9]/g, '_')}`,
    label,
    category: entry.category,
    terms: entry.terms,
    mention_count: entry.messages.length,
    artifact_ids: entry.messages,
    actor_ids: [...entry.authors],
    week_buckets: [...entry.weekBuckets],
    eras: { ...entry.eras },
    first_seen: null,
    last_seen: null,
    groundedness_score: 0,
    abstraction_score: 0,
    evolution_summary: '',
  });
}

// Add top discovered concepts (up to fill 30 total)
const slotsLeft = 30 - finalConcepts.length;
for (const dc of discoveredConcepts.slice(0, Math.max(0, slotsLeft))) {
  // Find messages
  const matchedMsgs = [];
  const authors = new Set();
  const weeks = new Set();
  const eras = { early: 0, middle: 0, late: 0 };
  for (const msg of messages) {
    if (new RegExp(`\\b${dc.label}\\b`, 'i').test(msg.text)) {
      matchedMsgs.push(msg.canonical_id);
      authors.add(msg.author);
      weeks.add(getWeekBucket(msg.timestamp));
      eras[getEra(msg.timestamp)]++;
    }
  }
  finalConcepts.push({
    id: `concept_${dc.label.replace(/[^a-z0-9]/g, '_')}`,
    label: dc.label,
    category: 'discovered',
    terms: dc.terms,
    mention_count: matchedMsgs.length,
    artifact_ids: matchedMsgs,
    actor_ids: [...authors],
    week_buckets: [...weeks],
    eras,
    first_seen: null,
    last_seen: null,
    groundedness_score: 0,
    abstraction_score: 0,
    evolution_summary: '',
  });
}

// Sort by mention count
finalConcepts.sort((a, b) => b.mention_count - a.mention_count);

// Compute first/last seen
for (const concept of finalConcepts) {
  const timestamps = concept.artifact_ids
    .map(id => msgById.get(id)?.timestamp)
    .filter(Boolean)
    .sort();
  concept.first_seen = timestamps[0] || null;
  concept.last_seen = timestamps[timestamps.length - 1] || null;
}

console.log(`\nFinal concepts: ${finalConcepts.length}`);
for (const c of finalConcepts) {
  console.log(`  ${c.label} | ${c.category} | ${c.mention_count} mentions | ${c.actor_ids.length} authors`);
}

writeFileSync(join(DATA_DIR, 'concept_merge_debug.json'), JSON.stringify(mergeDebug, null, 2));

// ============================================================
// STEP 2: GROUNDEDNESS & ABSTRACTION SCORING
// ============================================================
console.log('\n--- Groundedness & Abstraction Scoring ---');

const GROUNDED_PATTERNS = [
  /https?:\/\/\S+/i,
  /\b(github|gitlab|npm|pip|docker|api|sdk|endpoint|repo|repository|codebase)\b/i,
  /\b(deploy|implement|build|ship|test|debug|code|script|function|class|module|compile|install)\b/i,
  /\b(database|server|client|frontend|backend|pipeline|schema|query|sql|json|csv)\b/i,
  /\b(budget|cost|revenue|funding|price|payment|milestone|deadline)\b/i,
  /\b(contract|audit|spec|specification|documentation|docs|readme)\b/i,
  /\b(step \d|phase \d|version \d|v\d|pr |pull request|issue #|ticket)\b/i,
  /\b(tool|platform|app|application|software|library|package|dependency)\b/i,
  /\b(specifically|concretely|measurably|operationally|pragmatically)\b/i,
  /\b(solidity|rust|python|javascript|typescript|react|node)\b/i,
  /```/,
];

const ABSTRACT_PATTERNS = [
  /\b(transcend|transcendence|cosmic|universal|infinite|eternal|sacred|divine)\b/i,
  /\b(ontolog|epistemolog|metaphysic|phenomenolog|teleolog)\b/i,
  /\b(essence|soul|spirit|consciousness|awakening|enlighten|illuminat)\b/i,
  /\b(mythic|archetypal|symbolic|primordial|alchemical|mystical)\b/i,
  /\b(emerge|emergence|unfold|manifest|embody|incarnat|crystalliz)\b/i,
  /\b(paradigm|worldview|cosmolog|cosmovision|grand.*narrative)\b/i,
  /\b(collective.*intelligence|hive.*mind|noosphere|egregore|morphic)\b/i,
  /\b(fractal|holographic|recursive|self-similar|holonic)\b/i,
  /\b(resonan|vibrat|frequenc|harmoni|attune|align.*with.*the)\b/i,
  /\b(destiny|prophecy|evolution.*of.*consciousness|ascen[ds])\b/i,
  /\b(meta-?narrative|meta-?pattern|meta-?layer|meta-?structure)\b/i,
];

for (const msg of messages) {
  let gScore = 0, aScore = 0;
  for (const p of GROUNDED_PATTERNS) if (p.test(msg.text)) gScore++;
  for (const p of ABSTRACT_PATTERNS) if (p.test(msg.text)) aScore++;
  msg.groundedness_score = Math.min(1, gScore / 3);
  msg.abstraction_score = Math.min(1, aScore / 2);
}

// Score concepts
for (const concept of finalConcepts) {
  let totalG = 0, totalA = 0, count = 0;
  for (const id of concept.artifact_ids.slice(0, 300)) {
    const msg = msgById.get(id);
    if (msg) { totalG += msg.groundedness_score; totalA += msg.abstraction_score; count++; }
  }
  concept.groundedness_score = count ? +(totalG / count).toFixed(3) : 0;
  concept.abstraction_score = count ? +(totalA / count).toFixed(3) : 0;
}

// ============================================================
// STEP 3: CONCEPT↔ARTIFACT RELATION TYPING (stronger rules)
// ============================================================
console.log('\n--- Relation Typing (Pass 2) ---');

function classifyRelation(msg, concept, sortedConceptMsgs) {
  const textLower = msg.text.toLowerCase();
  const msgIndex = sortedConceptMsgs.indexOf(msg.canonical_id);

  // Seed: first 5 mentions of a concept
  if (msgIndex >= 0 && msgIndex < 5) return 'seed';

  // Challenge: questioning/pushback language
  if (/\b(but|however|disagree|concern|risk|problem|issue|careful|caution|skeptic|challenge|worry|danger|overstat|mislead|not sure|don't think|isn't|aren't|won't work|unrealistic|too abstract|vague)\b/i.test(textLower)) return 'challenge';

  // Reframe: redefining/shifting language
  if (/\b(actually|instead|rather than|reframe|rethink|reconsider|alternatively|different way|think of.*as|more like|not.*but|what if we|could also be|another way|pivot|shift)\b/i.test(textLower)) return 'reframe';

  // Amplify: short affirmations, reactions, emoji-heavy
  const isShort = msg.text.length < 120;
  if (isShort && /(!{2,}|💯|🔥|👏|exactly|yes|this[!.]|100%|agree|love this|so true|right on|amen|preach|fire|based)/i.test(textLower)) return 'amplify';

  return 'reference';
}

const conceptRelations = {};
for (const concept of finalConcepts) {
  const sorted = concept.artifact_ids
    .map(id => ({ id, ts: msgById.get(id)?.timestamp || '' }))
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map(x => x.id);

  const relations = {};
  const counts = { seed: 0, reference: 0, amplify: 0, reframe: 0, challenge: 0 };
  for (const id of concept.artifact_ids) {
    const msg = msgById.get(id);
    if (msg) {
      const rel = classifyRelation(msg, concept, sorted);
      relations[id] = rel;
      counts[rel]++;
    }
  }
  conceptRelations[concept.id] = { relations, counts };
}

// ============================================================
// STEP 4: CONCEPT EVOLUTION SUMMARIES
// ============================================================
console.log('\n--- Concept Evolution ---');

for (const concept of finalConcepts) {
  const related = concept.artifact_ids
    .map(id => msgById.get(id))
    .filter(m => m && m.timestamp)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (related.length < 3) {
    concept.evolution_summary = 'Limited usage — insufficient data for evolution analysis.';
    continue;
  }

  const third = Math.floor(related.length / 3);
  const early = related.slice(0, third);
  const mid = related.slice(third, third * 2);
  const late = related.slice(third * 2);

  const avgScores = (msgs) => ({
    g: msgs.reduce((s, m) => s + (m.groundedness_score || 0), 0) / msgs.length,
    a: msgs.reduce((s, m) => s + (m.abstraction_score || 0), 0) / msgs.length,
  });

  const earlyS = avgScores(early);
  const lateS = avgScores(late);

  const rels = conceptRelations[concept.id]?.counts || {};
  const topActors = [...new Set(related.map(m => m.author))]
    .map(a => ({ a, n: related.filter(m => m.author === a).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(x => x.a);

  // Early actor vs late actor comparison
  const earlyActors = [...new Set(early.map(m => m.author))];
  const lateActors = [...new Set(late.map(m => m.author))];
  const newLateActors = lateActors.filter(a => !earlyActors.includes(a));

  const gDelta = lateS.g - earlyS.g;
  const aDelta = lateS.a - earlyS.a;
  let trend = '';
  if (gDelta > 0.05 && aDelta < 0) trend = 'Became more grounded over time.';
  else if (aDelta > 0.05 && gDelta < 0) trend = 'Drifted toward abstraction over time.';
  else if (gDelta > 0.05 && aDelta > 0.05) trend = 'Both grounding and abstraction increased — contested concept.';
  else trend = 'Remained relatively stable in groundedness/abstraction balance.';

  const spreadNote = newLateActors.length > 3
    ? `Spread to ${newLateActors.length} new actors in later period.`
    : '';

  concept.evolution_summary =
    `${related.length} total mentions. ` +
    `Early: G=${earlyS.g.toFixed(2)}, A=${earlyS.a.toFixed(2)}. ` +
    `Late: G=${lateS.g.toFixed(2)}, A=${lateS.a.toFixed(2)}. ` +
    `${trend} ${spreadNote} ` +
    `Relations: ${rels.seed || 0} seeds, ${rels.reference || 0} references, ` +
    `${rels.amplify || 0} amplifications, ${rels.reframe || 0} reframes, ${rels.challenge || 0} challenges. ` +
    `Key shapers: ${topActors.join(', ')}.`;

  // Store era breakdown
  concept.era_scores = {
    early: { groundedness: +earlyS.g.toFixed(3), abstraction: +earlyS.a.toFixed(3), count: early.length },
    middle: { groundedness: +avgScores(mid).g.toFixed(3), abstraction: +avgScores(mid).a.toFixed(3), count: mid.length },
    late: { groundedness: +lateS.g.toFixed(3), abstraction: +lateS.a.toFixed(3), count: late.length },
  };

  concept.relation_counts = rels;
}

// ============================================================
// STEP 5: IMPROVED CLUSTERING — by era + concept profile
// ============================================================
console.log('\n--- Clustering (Pass 2) ---');

// Strategy: segment by era, then within each era group by dominant concept patterns
// This avoids repetitive "knowledge + bonfire + graph" labels

const ERA_NAMES = ['early', 'middle', 'late'];

// Group messages by era
const eraBuckets = { early: [], middle: [], late: [] };
for (const msg of messages) {
  if (!msg.timestamp) continue;
  eraBuckets[getEra(msg.timestamp)].push(msg);
}

// Within each era, identify distinct thematic zones by concept co-occurrence
function findEraThemes(eraMsgs, eraName) {
  // Score each concept's presence in this era
  const conceptPresence = new Map();
  for (const concept of finalConcepts) {
    const eraMsgIds = new Set(eraMsgs.map(m => m.canonical_id));
    const overlap = concept.artifact_ids.filter(id => eraMsgIds.has(id));
    if (overlap.length >= 5) {
      conceptPresence.set(concept.id, {
        concept,
        count: overlap.length,
        fraction: overlap.length / eraMsgs.length,
        msgIds: overlap,
      });
    }
  }

  // Find distinct concept groups by checking which concepts co-occur in messages
  const conceptPairs = new Map();
  for (const msg of eraMsgs) {
    const msgConcepts = [];
    for (const [cid, cp] of conceptPresence.entries()) {
      if (cp.msgIds.includes(msg.canonical_id)) {
        msgConcepts.push(cid);
      }
    }
    for (let i = 0; i < msgConcepts.length; i++) {
      for (let j = i + 1; j < msgConcepts.length; j++) {
        const key = [msgConcepts[i], msgConcepts[j]].sort().join('|');
        conceptPairs.set(key, (conceptPairs.get(key) || 0) + 1);
      }
    }
  }

  // Greedy clustering: group concepts that strongly co-occur
  const ranked = [...conceptPresence.entries()]
    .sort((a, b) => b[1].count - a[1].count);

  const usedConcepts = new Set();
  const themes = [];

  for (const [primaryId, primary] of ranked) {
    if (usedConcepts.has(primaryId)) continue;
    if (primary.count < 5) continue;

    // Find co-occurring concepts
    const group = [primaryId];
    usedConcepts.add(primaryId);

    for (const [otherId, other] of ranked) {
      if (usedConcepts.has(otherId)) continue;
      const pairKey = [primaryId, otherId].sort().join('|');
      const cooccurrence = conceptPairs.get(pairKey) || 0;
      const minCount = Math.min(primary.count, other.count);
      if (cooccurrence > minCount * 0.2 && group.length < 4) {
        group.push(otherId);
        usedConcepts.add(otherId);
      }
    }

    // Collect all messages for this theme
    const themeMsgIds = new Set();
    for (const cid of group) {
      const cp = conceptPresence.get(cid);
      if (cp) cp.msgIds.forEach(id => themeMsgIds.add(id));
    }

    if (themeMsgIds.size < 15) continue; // too small

    themes.push({
      conceptIds: group,
      msgIds: [...themeMsgIds],
      era: eraName,
    });
  }

  // Add a "general" cluster for messages not in any theme
  const themedMsgIds = new Set();
  for (const t of themes) t.msgIds.forEach(id => themedMsgIds.add(id));
  const unthemed = eraMsgs.filter(m => !themedMsgIds.has(m.canonical_id));
  if (unthemed.length >= 20) {
    themes.push({
      conceptIds: [],
      msgIds: unthemed.map(m => m.canonical_id),
      era: eraName,
      isGeneral: true,
    });
  }

  return themes;
}

// Build all clusters
const allThemes = [];
for (const era of ERA_NAMES) {
  const themes = findEraThemes(eraBuckets[era], era);
  allThemes.push(...themes);
}

// Symbol assignment
const CLUSTER_SYMBOLS = {
  infra: '⚙️', narrative: '📖', governance: '🏛️', social: '🤝',
  hybrid: '🔮', symbolic: '🔱', discovered: '💡',
};
const ERA_PREFIXES = { early: 'Genesis', middle: 'Growth', late: 'Convergence' };

const CAUTION_SYMBOLS = ['🌫️', '⚠️'];
const HEALTHY_SYMBOLS = ['⚓', '🔥', '🌉', '💡', '🌱', '🏛️'];

const finalClusters = allThemes.map((theme, i) => {
  const conceptLabels = theme.conceptIds
    .map(id => finalConcepts.find(c => c.id === id))
    .filter(Boolean);

  // Determine dominant category
  const catCounts = {};
  for (const c of conceptLabels) {
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
  }
  const dominantCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'hybrid';

  // Compute scores
  let totalG = 0, totalA = 0, count = 0;
  const authors = new Set();
  for (const id of theme.msgIds) {
    const msg = msgById.get(id);
    if (msg) {
      totalG += msg.groundedness_score || 0;
      totalA += msg.abstraction_score || 0;
      count++;
      authors.add(msg.author);
    }
  }
  const avgG = count ? totalG / count : 0;
  const avgA = count ? totalA / count : 0;

  // Generate human-readable label
  let label;
  if (theme.isGeneral) {
    label = `${ERA_PREFIXES[theme.era]}: General Discussion`;
  } else {
    const names = conceptLabels.slice(0, 2).map(c => c.label);
    label = `${ERA_PREFIXES[theme.era]}: ${names.join(' & ')}`;
  }

  // Determine cluster symbol based on health
  let symbol;
  if (avgA > avgG * 2 && avgA > 0.15) {
    symbol = CAUTION_SYMBOLS[i % CAUTION_SYMBOLS.length];
  } else {
    symbol = CLUSTER_SYMBOLS[dominantCategory] || '💡';
  }

  // Count relation types
  const relCounts = { seed: 0, reference: 0, amplify: 0, reframe: 0, challenge: 0 };
  for (const cid of theme.conceptIds) {
    const crels = conceptRelations[cid];
    if (!crels) continue;
    for (const id of theme.msgIds) {
      if (crels.relations[id]) relCounts[crels.relations[id]]++;
    }
  }

  // Generate summary
  const topAuthors = [...authors]
    .map(a => ({ a, n: theme.msgIds.filter(id => msgById.get(id)?.author === a).length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map(x => x.a);

  let summary = `${theme.msgIds.length} messages in the ${theme.era} period. `;
  if (!theme.isGeneral) {
    summary += `Focused on ${conceptLabels.map(c => c.label).join(', ')}. `;
  }
  summary += `${authors.size} active participants. `;
  if (avgG > avgA) summary += `Discourse tends grounded (G=${avgG.toFixed(2)} vs A=${avgA.toFixed(2)}). `;
  else if (avgA > avgG) summary += `Discourse leans abstract (A=${avgA.toFixed(2)} vs G=${avgG.toFixed(2)}). `;
  summary += `Key voices: ${topAuthors.join(', ')}.`;

  // Caution notes
  let caution = null;
  if (avgA > 0.2 && avgG < 0.1) caution = 'High abstraction with low grounding — potential narrative drift zone.';
  if (relCounts.amplify > relCounts.challenge * 5 && relCounts.amplify > 10) caution = 'Heavy amplification with minimal challenge — echo chamber risk.';

  // Time boundaries
  const timestamps = theme.msgIds
    .map(id => msgById.get(id)?.timestamp)
    .filter(Boolean)
    .sort();

  return {
    id: `cluster_${i}`,
    label,
    summary,
    symbol,
    category: dominantCategory,
    era: theme.era,
    concept_ids: theme.conceptIds,
    artifact_ids: theme.msgIds,
    actor_ids: [...authors],
    time_span: {
      start: timestamps[0] || null,
      end: timestamps[timestamps.length - 1] || null,
      era: theme.era,
    },
    avg_groundedness: +avgG.toFixed(3),
    avg_abstraction: +avgA.toFixed(3),
    relation_counts: relCounts,
    top_actors: topAuthors,
    caution,
  };
});

writeFileSync(join(DATA_DIR, 'clusters.json'), JSON.stringify(finalClusters, null, 2));
writeFileSync(join(DATA_DIR, 'cluster_label_debug.json'), JSON.stringify(
  finalClusters.map(c => ({ id: c.id, label: c.label, era: c.era, msgs: c.artifact_ids.length, concepts: c.concept_ids })),
  null, 2
));
console.log(`\nClusters: ${finalClusters.length}`);
for (const c of finalClusters) {
  console.log(`  ${c.id} | ${c.label} | ${c.artifact_ids.length} msgs | ${c.era}`);
}

// ============================================================
// STEP 6: IMPROVED ACTOR MODELING
// ============================================================
console.log('\n--- Actor Modeling (Pass 2) ---');

const actorMap = new Map();
for (const msg of messages) {
  if (!actorMap.has(msg.author)) {
    actorMap.set(msg.author, {
      display_name: msg.author,
      messages: [],
      replyTargets: new Map(), // who they reply to
      repliedBy: new Map(),    // who replies to them
      conceptMentions: new Map(),
      weekActivity: new Map(),
      eraActivity: { early: 0, middle: 0, late: 0 },
    });
  }
  const actor = actorMap.get(msg.author);
  actor.messages.push(msg);
  const era = getEra(msg.timestamp);
  actor.eraActivity[era]++;
  const week = getWeekBucket(msg.timestamp);
  actor.weekActivity.set(week, (actor.weekActivity.get(week) || 0) + 1);
}

// Build reply network
for (const msg of messages) {
  if (!msg.reply_to) continue;
  const target = msgById.get(msg.reply_to);
  if (!target) continue;

  const sourceActor = actorMap.get(msg.author);
  const targetActor = actorMap.get(target.author);
  if (sourceActor) sourceActor.replyTargets.set(target.author, (sourceActor.replyTargets.get(target.author) || 0) + 1);
  if (targetActor) targetActor.repliedBy.set(msg.author, (targetActor.repliedBy.get(msg.author) || 0) + 1);
}

// Concept mentions per actor
for (const concept of finalConcepts) {
  for (const id of concept.artifact_ids) {
    const msg = msgById.get(id);
    if (!msg) continue;
    const actor = actorMap.get(msg.author);
    if (!actor) continue;
    if (!actor.conceptMentions.has(concept.id)) actor.conceptMentions.set(concept.id, { count: 0, relations: {} });
    const entry = actor.conceptMentions.get(concept.id);
    entry.count++;
    const rel = conceptRelations[concept.id]?.relations[id];
    if (rel) entry.relations[rel] = (entry.relations[rel] || 0) + 1;
  }
}

// Bot detection
const BOT_PATTERNS = [/^rose$/i, /^safeguard$/i, /^combot$/i, /bot$/i, /^shieldy/i, /^miss.*rose/i, /^tessa/i];

// Compute vocabulary novelty: ratio of unique words to total words
function vocabNovelty(msgs) {
  const allWords = [];
  const uniqueWords = new Set();
  for (const m of msgs.slice(0, 100)) {
    const words = m.text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    allWords.push(...words);
    words.forEach(w => uniqueWords.add(w));
  }
  return allWords.length ? uniqueWords.size / allWords.length : 0;
}

// Build final actors
const actors = [...actorMap.entries()]
  .filter(([_, a]) => a.messages.length >= 3)
  .map(([name, a]) => {
    const msgs = a.messages;
    const msgCount = msgs.length;
    const replyCount = msgs.filter(m => m.reply_to).length;
    const threadStarts = msgs.filter(m => !m.reply_to).length;
    const repliesReceived = [...a.repliedBy.values()].reduce((s, v) => s + v, 0);
    const avgLen = msgs.reduce((s, m) => s + m.text.length, 0) / msgCount;
    const extLinks = msgs.filter(m => /https?:\/\/\S+/.test(m.text)).length;
    const timestamps = msgs.filter(m => m.timestamp).map(m => m.timestamp).sort();

    const isBot = BOT_PATTERNS.some(p => p.test(name)) || (msgCount > 50 && avgLen < 30);

    // Concept seeding: how many concepts did this actor introduce first?
    let conceptSeedCount = 0;
    for (const concept of finalConcepts) {
      const sorted = concept.artifact_ids
        .map(id => msgById.get(id))
        .filter(m => m && m.timestamp)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      if (sorted.length > 0 && sorted[0].author === name) conceptSeedCount++;
    }

    // Relation rates
    let totalSeed = 0, totalRef = 0, totalAmplify = 0, totalReframe = 0, totalChallenge = 0;
    for (const [cid, entry] of a.conceptMentions.entries()) {
      totalSeed += entry.relations.seed || 0;
      totalRef += entry.relations.reference || 0;
      totalAmplify += entry.relations.amplify || 0;
      totalReframe += entry.relations.reframe || 0;
      totalChallenge += entry.relations.challenge || 0;
    }
    const totalRels = totalSeed + totalRef + totalAmplify + totalReframe + totalChallenge || 1;

    // Vocabulary novelty
    const novelty = vocabNovelty(msgs);

    // Operationality: fraction of messages with grounded content
    const operationality = msgs.reduce((s, m) => s + (m.groundedness_score || 0), 0) / msgCount;

    // Abstraction drift: compare early vs late abstraction scores
    const earlyMsgs = msgs.filter(m => getEra(m.timestamp) === 'early');
    const lateMsgs = msgs.filter(m => getEra(m.timestamp) === 'late');
    const earlyAbstraction = earlyMsgs.length ? earlyMsgs.reduce((s, m) => s + (m.abstraction_score || 0), 0) / earlyMsgs.length : 0;
    const lateAbstraction = lateMsgs.length ? lateMsgs.reduce((s, m) => s + (m.abstraction_score || 0), 0) / lateMsgs.length : 0;
    const abstractionDrift = lateAbstraction - earlyAbstraction;

    // Reply centrality: normalized replies received
    const maxReplies = Math.max(...[...actorMap.values()].map(a => [...a.repliedBy.values()].reduce((s, v) => s + v, 0)));
    const replyCentrality = maxReplies ? repliesReceived / maxReplies : 0;

    // Behavioral scores
    const initiatorScore = Math.min(1, threadStarts / Math.max(1, msgCount));
    const responderScore = Math.min(1, replyCount / Math.max(1, msgCount));
    const synthesisScore = Math.min(1, (avgLen / 400) * Math.min(1, a.conceptMentions.size / 8));
    const amplificationRate = totalAmplify / totalRels;
    const reframingRate = totalReframe / totalRels;
    const challengeRate = totalChallenge / totalRels;
    const seedingRate = totalSeed / totalRels;
    const resourceScore = Math.min(1, extLinks / Math.max(1, msgCount) * 5);

    // Derive labels — strict thresholds
    const labels = [];
    if (conceptSeedCount >= 3 || seedingRate > 0.15) labels.push('catalyst-like');
    if (synthesisScore > 0.35 && novelty > 0.3) labels.push('synthesizer-like');
    if (amplificationRate > 0.2 && avgLen < 100) labels.push('amplifier-like');
    if (operationality > 0.25) labels.push('grounder-like');
    if (challengeRate > 0.1) labels.push('critic-like');
    if (resourceScore > 0.15) labels.push('resource-linker-like');
    if (reframingRate > 0.15) labels.push('reframer-like');

    // Generate grounded summary
    let summary = `${name} contributed ${msgCount} messages`;
    if (isBot) summary += ` (bot)`;
    summary += `. `;
    if (labels.length > 0) summary += `Communication pattern: ${labels.join(', ')}. `;
    if (operationality > 0.2) summary += `Tends toward operational/grounded discourse. `;
    if (abstractionDrift > 0.1) summary += `Shows increasing abstraction over time. `;
    if (abstractionDrift < -0.05) summary += `Became more grounded over time. `;
    if (conceptSeedCount > 0) summary += `Introduced ${conceptSeedCount} concepts first. `;
    if (replyCentrality > 0.3) summary += `High reply centrality — frequently engaged by others. `;

    // Top concepts
    const topConcepts = [...a.conceptMentions.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([id]) => id);

    // Most active clusters
    const actorMsgSet = new Set(msgs.map(m => m.canonical_id));
    const clusterActivity = finalClusters
      .map(c => ({ id: c.id, overlap: c.artifact_ids.filter(id => actorMsgSet.has(id)).length }))
      .filter(c => c.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3)
      .map(c => c.id);

    return {
      id: `actor_${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
      display_name: name,
      actor_kind: isBot ? 'bot' : 'human',
      message_count: msgCount,
      reply_count: replyCount,
      replies_received: repliesReceived,
      thread_initiations: threadStarts,
      concept_seed_count: conceptSeedCount,
      external_links_count: extLinks,
      avg_message_length: Math.round(avgLen),
      first_seen: timestamps[0] || null,
      last_seen: timestamps[timestamps.length - 1] || null,
      era_activity: a.eraActivity,
      // Scores
      initiator_score: +initiatorScore.toFixed(3),
      responder_score: +responderScore.toFixed(3),
      synthesis_score: +synthesisScore.toFixed(3),
      amplification_rate: +amplificationRate.toFixed(3),
      reframing_rate: +reframingRate.toFixed(3),
      challenge_rate: +challengeRate.toFixed(3),
      seeding_rate: +seedingRate.toFixed(3),
      resource_sharing_score: +resourceScore.toFixed(3),
      vocabulary_novelty: +novelty.toFixed(3),
      operationality_score: +operationality.toFixed(3),
      abstraction_drift: +abstractionDrift.toFixed(3),
      reply_centrality: +replyCentrality.toFixed(3),
      // Derived
      labels,
      summary,
      concept_ids: topConcepts,
      cluster_ids: clusterActivity,
      message_ids: msgs.slice(0, 50).map(m => m.canonical_id),
    };
  })
  .sort((a, b) => b.message_count - a.message_count);

writeFileSync(join(DATA_DIR, 'actors.json'), JSON.stringify(actors, null, 2));
console.log(`\nActors: ${actors.length}`);
for (const a of actors.slice(0, 10)) {
  console.log(`  ${a.display_name} | ${a.actor_kind} | ${a.message_count} msgs | ${a.labels.join(', ')}`);
}

// ============================================================
// STEP 7: GRAPH EDGES
// ============================================================
console.log('\n--- Graph Edges ---');

const edges = [];

// Concept ↔ concept: shared artifacts (threshold higher)
for (let i = 0; i < finalConcepts.length; i++) {
  const setI = new Set(finalConcepts[i].artifact_ids);
  for (let j = i + 1; j < finalConcepts.length; j++) {
    const shared = finalConcepts[j].artifact_ids.filter(id => setI.has(id));
    if (shared.length >= 10) {
      edges.push({
        source: finalConcepts[i].id, target: finalConcepts[j].id,
        type: 'concept-concept', weight: shared.length,
      });
    }
  }
}

// Actor ↔ concept (top actors only)
for (const actor of actors.slice(0, 25)) {
  for (const cid of actor.concept_ids.slice(0, 5)) {
    const concept = finalConcepts.find(c => c.id === cid);
    if (!concept) continue;
    const actorMsgSet = new Set(actor.message_ids);
    const overlap = concept.artifact_ids.filter(id => actorMsgSet.has(id)).length;
    if (overlap >= 5) {
      edges.push({ source: actor.id, target: cid, type: 'actor-concept', weight: overlap });
    }
  }
}

// Actor ↔ actor reply edges
const actorReplyEdges = new Map();
for (const msg of messages) {
  if (!msg.reply_to) continue;
  const target = msgById.get(msg.reply_to);
  if (!target || msg.author === target.author) continue;
  const src = actors.find(a => a.display_name === msg.author);
  const tgt = actors.find(a => a.display_name === target.author);
  if (!src || !tgt || src.message_count < 15 || tgt.message_count < 15) continue;
  const key = [src.id, tgt.id].sort().join('|');
  actorReplyEdges.set(key, (actorReplyEdges.get(key) || 0) + 1);
}
for (const [key, weight] of actorReplyEdges.entries()) {
  if (weight < 3) continue;
  const [a, b] = key.split('|');
  edges.push({ source: a, target: b, type: 'actor-actor', weight });
}

writeFileSync(join(DATA_DIR, 'graph_edges.json'), JSON.stringify(edges, null, 2));
console.log(`Edges: ${edges.length}`);

// ============================================================
// STEP 8: TIMELINE STATES
// ============================================================
console.log('\n--- Timeline States ---');

const weekBuckets = new Map();
for (const msg of messages) {
  const week = getWeekBucket(msg.timestamp);
  if (!weekBuckets.has(week)) weekBuckets.set(week, []);
  weekBuckets.get(week).push(msg);
}

const sortedWeeks = [...weekBuckets.keys()].filter(w => w !== 'unknown').sort();
const timelineStates = sortedWeeks.map(week => {
  const msgs = weekBuckets.get(week) || [];
  let totalG = 0, totalA = 0;
  for (const msg of msgs) {
    totalG += msg.groundedness_score || 0;
    totalA += msg.abstraction_score || 0;
  }

  // Count concept mentions this week
  const conceptCounts = new Map();
  for (const concept of finalConcepts) {
    const weekMsgSet = new Set(msgs.map(m => m.canonical_id));
    const overlap = concept.artifact_ids.filter(id => weekMsgSet.has(id)).length;
    if (overlap > 0) conceptCounts.set(concept.id, overlap);
  }

  return {
    week,
    era: getEra(msgs[0]?.timestamp),
    message_count: msgs.length,
    active_authors: [...new Set(msgs.map(m => m.author))].length,
    top_concepts: [...conceptCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ concept_id: id, count })),
    avg_groundedness: msgs.length ? +(totalG / msgs.length).toFixed(3) : 0,
    avg_abstraction: msgs.length ? +(totalA / msgs.length).toFixed(3) : 0,
  };
});

writeFileSync(join(DATA_DIR, 'timeline_states.json'), JSON.stringify(timelineStates, null, 2));
console.log(`Timeline states: ${timelineStates.length}`);

// ============================================================
// STEP 9: SAVE CONCEPTS + ENRICHED MESSAGES
// ============================================================

// Save concepts (trim artifact_ids for file size)
const conceptsOutput = finalConcepts.map(c => ({
  ...c,
  artifact_ids: c.artifact_ids.slice(0, 150),
  actor_ids: c.actor_ids.slice(0, 30),
  week_buckets: undefined, // no need in frontend
}));
writeFileSync(join(DATA_DIR, 'concepts.json'), JSON.stringify(conceptsOutput, null, 2));

// Save enriched messages
const enrichedMessages = messages.map(m => ({
  canonical_id: m.canonical_id,
  telegram_id: m.telegram_id,
  source_file: m.source_file,
  author: m.author,
  timestamp: m.timestamp,
  text: m.text,
  reply_to: m.reply_to,
  groundedness_score: +(m.groundedness_score || 0).toFixed(3),
  abstraction_score: +(m.abstraction_score || 0).toFixed(3),
  era: getEra(m.timestamp),
}));
writeFileSync(join(DATA_DIR, 'normalized_messages.json'), JSON.stringify(enrichedMessages, null, 2));

// ============================================================
// ERA BOUNDARIES for frontend
// ============================================================
writeFileSync(join(DATA_DIR, 'era_boundaries.json'), JSON.stringify({
  early: { end: ERA_BOUNDARIES.early_end },
  middle: { end: ERA_BOUNDARIES.mid_end },
  late: { end: allTimestamps[allTimestamps.length - 1] },
}, null, 2));

// ============================================================
// SUMMARY
// ============================================================
console.log('\n=== PASS 2 ANALYSIS COMPLETE ===');
console.log(`Messages: ${messages.length}`);
console.log(`Concepts: ${finalConcepts.length}`);
console.log(`Actors: ${actors.length}`);
console.log(`Clusters: ${finalClusters.length}`);
console.log(`Edges: ${edges.length}`);
console.log(`Timeline: ${timelineStates.length} weeks`);
