/**
 * meaning-evolution.mjs — Pass 3
 * Meaning Evolution Layer: deterministic glyph tagging, hybrid session detection,
 * adaptive compression, resonance metrics.
 *
 * CONSTRAINTS (user-corrected):
 * 1. Hybrid session boundaries: time gap >2h OR concept overlap <0.35
 * 2. Max 2 glyphs per message: 1 primary (relation) + 0-1 tone
 * 3. Never modify graph_edges.json — edge meaning → edge_meaning.json
 * 4. Adaptive phase count: 1/2/3 based on session size
 * 5. Debug outputs (session_debug.json, glyph_debug.json) required before final
 * 6. Run small subset first, validate, then full dataset
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const DATA_DIR = resolve('./public/data');

// ── Load Pass 2 outputs ─────────────────────────────────────
const messages = JSON.parse(readFileSync(join(DATA_DIR, 'normalized_messages.json'), 'utf-8'));
const concepts = JSON.parse(readFileSync(join(DATA_DIR, 'concepts.json'), 'utf-8'));
const clusters = JSON.parse(readFileSync(join(DATA_DIR, 'clusters.json'), 'utf-8'));
const actors = JSON.parse(readFileSync(join(DATA_DIR, 'actors.json'), 'utf-8'));
const graphEdges = JSON.parse(readFileSync(join(DATA_DIR, 'graph_edges.json'), 'utf-8'));

const msgById = new Map();
for (const m of messages) msgById.set(m.canonical_id, m);

const conceptById = new Map();
for (const c of concepts) conceptById.set(c.id, c);

// Build message → concept relations lookup from concepts.json artifact_ids
// and from the relation typing done in analyze-data.mjs
const msgToConceptRelations = new Map();
for (const concept of concepts) {
  if (!concept.artifact_ids) continue;
  // Sort artifact_ids by timestamp to determine seed order
  const sorted = concept.artifact_ids
    .map(id => ({ id, ts: msgById.get(id)?.timestamp || '' }))
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .map(x => x.id);

  for (const msgId of concept.artifact_ids) {
    const msg = msgById.get(msgId);
    if (!msg) continue;
    const relation = classifyRelation(msg, concept, sorted);
    if (!msgToConceptRelations.has(msgId)) {
      msgToConceptRelations.set(msgId, []);
    }
    msgToConceptRelations.get(msgId).push({
      concept_id: concept.id,
      concept_label: concept.label,
      relation,
    });
  }
}

console.log(`Loaded: ${messages.length} msgs, ${concepts.length} concepts, ${clusters.length} clusters`);
console.log(`Messages with concept relations: ${msgToConceptRelations.size}`);

// ============================================================
// RELATION CLASSIFIER (same logic as analyze-data.mjs)
// ============================================================
function classifyRelation(msg, concept, sortedConceptMsgs) {
  const textLower = msg.text.toLowerCase();
  const msgIndex = sortedConceptMsgs.indexOf(msg.canonical_id);
  if (msgIndex >= 0 && msgIndex < 5) return 'seed';
  if (/\b(but|however|disagree|concern|risk|problem|issue|careful|caution|skeptic|challenge|worry|danger|overstat|mislead|not sure|don't think|isn't|aren't|won't work|unrealistic|too abstract|vague)\b/i.test(textLower)) return 'challenge';
  if (/\b(actually|instead|rather than|reframe|rethink|reconsider|alternatively|different way|think of.*as|more like|not.*but|what if we|could also be|another way|pivot|shift)\b/i.test(textLower)) return 'reframe';
  const isShort = msg.text.length < 120;
  if (isShort && /(!{2,}|💯|🔥|👏|exactly|yes|this[!.]|100%|agree|love this|so true|right on|amen|preach|fire|based)/i.test(textLower)) return 'amplify';
  return 'reference';
}

// ============================================================
// STEP 1: MESSAGE-LEVEL GLYPH TAGGING
// ============================================================
console.log('\n--- Step 1: Message Glyph Tagging ---');

// Primary glyph mapping (relation → glyph)
const RELATION_GLYPHS = {
  seed: '✨',
  reference: '🧭',
  amplify: '🔥',
  reframe: '🔁',
  challenge: '⚡',
};

// Archetypal tone patterns — strict, conservative
// Each tone requires STRONG textual evidence
const TONE_PATTERNS = {
  analytical: {
    glyph: '🧠',
    // Clear framework/data/structural analysis language
    pattern: /\b(framework|structure|model|analysis|data|metric|pattern|systematic|architecture|schema|layer|component|module|pipeline|algorithm|graph|node|protocol|specification|parameter)\b/i,
    minTextLength: 80, // needs real content, not just keywords
  },
  generative: {
    glyph: '🌱',
    // Clear new-idea/proposal/seed language — must be idea-generating not just mentioning
    pattern: /\b(what if|proposal|new approach|idea:|imagine|could we|experiment|prototype|draft|sketch|seed|plant|sprout|begin|initiate|propose|launch)\b/i,
    minTextLength: 40,
  },
  orienting: {
    glyph: '🧭',
    // Clear coordination/alignment/direction — different from reference
    pattern: /\b(align|roadmap|milestone|next step|priority|direction|plan|timeline|coordinate|schedule|agenda|pathway|goal|objective|deliverable)\b/i,
    minTextLength: 40,
  },
  reflective: {
    glyph: '🪞',
    // Meta-commentary about the conversation itself
    pattern: /\b(we've been|looking back|reflecting|this thread|this conversation|our discussion|what we|meta-|stepping back|in hindsight|on reflection|revisiting|synthesiz)\b/i,
    minTextLength: 60,
  },
  // CONSERVATIVE — only assign with very strong evidence
  philosophical: {
    glyph: '🌀',
    // Only when genuinely philosophical, not just abstract
    pattern: /\b(ontolog|epistemolog|metaphysic|phenomenolog|teleolog|consciousness|emergence.*pattern|recursive.*self|fractal.*nature|fundamental.*question|nature of|essence of|being and)\b/i,
    minTextLength: 100, // short messages rarely genuinely philosophical
  },
  challenge_tone: {
    glyph: '🗡️',
    // Strong pushback, not just mild disagreement — must be FORCEFUL
    pattern: /\b(fundamentally wrong|completely misses|dangerous assumption|fatal flaw|this fails|catastrophically|absurd|nonsensical|deeply flawed|misguided|ignor(e|es|ing) the|blind to)\b/i,
    minTextLength: 60,
  },
  performative: {
    glyph: '🎭',
    // Very conservative — only clear theatrical/rhetorical framing
    pattern: /\b(let me play|devil's advocate|imagine for a moment that|to be provocative|speaking as|in the role of|channeling|as if I were)\b/i,
    minTextLength: 80,
  },
};

function assignGlyphs(msg, relations) {
  // Pick the most "interesting" relation for primary glyph
  // Priority: seed > challenge > reframe > amplify > reference
  const RELATION_PRIORITY = { seed: 5, challenge: 4, reframe: 3, amplify: 2, reference: 1 };
  const sorted = [...relations].sort(
    (a, b) => (RELATION_PRIORITY[b.relation] || 0) - (RELATION_PRIORITY[a.relation] || 0)
  );
  const primaryRelation = sorted[0].relation;
  const primaryGlyph = RELATION_GLYPHS[primaryRelation];

  // Try to assign exactly 0 or 1 tone glyph
  let toneGlyph = null;
  let toneLabel = null;
  let toneReason = null;

  const textLower = msg.text.toLowerCase();
  const textLen = msg.text.length;

  for (const [tone, config] of Object.entries(TONE_PATTERNS)) {
    if (textLen < config.minTextLength) continue;
    if (config.pattern.test(msg.text)) {
      // Don't duplicate: if tone glyph matches primary glyph, skip
      if (config.glyph === primaryGlyph) continue;
      // Don't assign 🧭 orienting tone if primary is already reference (🧭)
      if (tone === 'orienting' && primaryRelation === 'reference') continue;
      // Don't assign 🗡️ challenge tone if primary is already challenge (⚡)
      if (tone === 'challenge_tone' && primaryRelation === 'challenge') continue;

      toneGlyph = config.glyph;
      toneLabel = tone;
      toneReason = `matched ${tone} pattern`;
      break; // first match wins, patterns ordered by priority
    }
  }

  const glyphs = [primaryGlyph];
  if (toneGlyph) glyphs.push(toneGlyph);

  // Build reason string
  let reason = `${primaryRelation}`;
  if (sorted[0].concept_label) reason += ` on "${sorted[0].concept_label}"`;
  if (toneLabel) reason += ` + ${toneLabel} tone`;

  return { glyphs, reason, primaryRelation, toneLabel };
}

// Tag all messages that have concept relations
const meaningTags = [];
const glyphDebug = [];

for (const [msgId, relations] of msgToConceptRelations.entries()) {
  const msg = msgById.get(msgId);
  if (!msg) continue;

  const { glyphs, reason, primaryRelation, toneLabel } = assignGlyphs(msg, relations);

  // Determine reply target
  let toActor = null;
  if (msg.reply_to) {
    const target = msgById.get(msg.reply_to);
    if (target) toActor = target.author;
  }

  meaningTags.push({
    message_id: msgId,
    from: msg.author,
    to: toActor,
    relation: primaryRelation,
    glyphs,
    reason,
  });

  glyphDebug.push({
    message_id: msgId,
    author: msg.author,
    text_preview: msg.text.slice(0, 120),
    text_length: msg.text.length,
    concept_relations: relations.map(r => `${r.concept_label}:${r.relation}`),
    primary_relation: primaryRelation,
    primary_glyph: glyphs[0],
    tone_label: toneLabel || null,
    tone_glyph: glyphs[1] || null,
    total_glyphs: glyphs.length,
    reason,
  });
}

console.log(`Tagged ${meaningTags.length} messages`);

// Glyph distribution check
const glyphCounts = {};
for (const tag of meaningTags) {
  for (const g of tag.glyphs) {
    glyphCounts[g] = (glyphCounts[g] || 0) + 1;
  }
}
console.log('Glyph distribution:', glyphCounts);

// Verify constraint: max 2 glyphs per message
const violations = meaningTags.filter(t => t.glyphs.length > 2);
if (violations.length > 0) {
  console.error(`CONSTRAINT VIOLATION: ${violations.length} messages have >2 glyphs!`);
  process.exit(1);
}

// Write debug first (constraint 5)
writeFileSync(join(DATA_DIR, 'glyph_debug.json'), JSON.stringify(glyphDebug.slice(0, 200), null, 2));
console.log('Wrote glyph_debug.json (first 200 entries)');

// ============================================================
// STEP 2: HYBRID SESSION DETECTION
// ============================================================
console.log('\n--- Step 2: Hybrid Session Detection ---');

const SESSION_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours
const CONCEPT_OVERLAP_THRESHOLD = 0.35;
const CONCEPT_WINDOW_SIZE = 15; // messages to look at

// Sort messages by timestamp
const sortedMsgs = messages
  .filter(m => m.timestamp)
  .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// Build concept set for a window of messages
function getConceptSet(msgs) {
  const concepts = new Set();
  for (const m of msgs) {
    const rels = msgToConceptRelations.get(m.canonical_id);
    if (rels) {
      for (const r of rels) concepts.add(r.concept_id);
    }
  }
  return concepts;
}

// Jaccard overlap between two sets
function setOverlap(a, b) {
  if (a.size === 0 && b.size === 0) return 1; // two empty sets = same
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// Detect boundaries
const sessionBoundaries = [0]; // always start with index 0
const sessionDebug = [];

for (let i = 1; i < sortedMsgs.length; i++) {
  const prev = sortedMsgs[i - 1];
  const curr = sortedMsgs[i];

  const prevTime = new Date(prev.timestamp).getTime();
  const currTime = new Date(curr.timestamp).getTime();
  const gapMs = currTime - prevTime;
  const gapMinutes = Math.round(gapMs / 60000);

  let isBoundary = false;
  let reason = '';

  // Condition 1: time gap > 2h
  if (gapMs > SESSION_GAP_MS) {
    isBoundary = true;
    reason = `time_gap: ${gapMinutes}min`;
  }

  // Condition 2: concept overlap drops
  // GUARD: only check when BOTH windows have real concept content (≥2 concepts each)
  // and there's at least a 15min gap (to avoid splitting active conversations)
  const MIN_CONCEPT_BOUNDARY_GAP_MS = 15 * 60 * 1000; // 15 minutes
  if (!isBoundary && i >= CONCEPT_WINDOW_SIZE && gapMs >= MIN_CONCEPT_BOUNDARY_GAP_MS) {
    const windowBefore = sortedMsgs.slice(Math.max(0, i - CONCEPT_WINDOW_SIZE), i);
    const windowAfter = sortedMsgs.slice(i, Math.min(sortedMsgs.length, i + CONCEPT_WINDOW_SIZE));

    if (windowAfter.length >= 5) {
      const conceptsBefore = getConceptSet(windowBefore);
      const conceptsAfter = getConceptSet(windowAfter);

      // Only trigger when both windows have meaningful concept content
      if (conceptsBefore.size >= 2 && conceptsAfter.size >= 2) {
        const overlap = setOverlap(conceptsBefore, conceptsAfter);
        if (overlap < CONCEPT_OVERLAP_THRESHOLD) {
          isBoundary = true;
          reason = `concept_overlap: ${overlap.toFixed(3)} < ${CONCEPT_OVERLAP_THRESHOLD} (before: ${conceptsBefore.size}, after: ${conceptsAfter.size})`;
        }
      }
    }
  }

  if (isBoundary) {
    sessionBoundaries.push(i);
    sessionDebug.push({
      boundary_index: i,
      reason,
      overlap_score: null,
      time_gap_minutes: gapMinutes,
      msg_before: prev.canonical_id,
      msg_after: curr.canonical_id,
      timestamp_before: prev.timestamp,
      timestamp_after: curr.timestamp,
    });

    // Fill in overlap score for debug
    if (i >= CONCEPT_WINDOW_SIZE) {
      const windowBefore = sortedMsgs.slice(Math.max(0, i - CONCEPT_WINDOW_SIZE), i);
      const windowAfter = sortedMsgs.slice(i, Math.min(sortedMsgs.length, i + CONCEPT_WINDOW_SIZE));
      if (windowAfter.length >= 5) {
        const overlap = setOverlap(getConceptSet(windowBefore), getConceptSet(windowAfter));
        sessionDebug[sessionDebug.length - 1].overlap_score = +overlap.toFixed(3);
      }
    }
  }
}

console.log(`Detected ${sessionBoundaries.length} sessions from ${sortedMsgs.length} messages`);

// Write session debug (constraint 5 — must exist before final outputs)
writeFileSync(join(DATA_DIR, 'session_debug.json'), JSON.stringify(sessionDebug, null, 2));
console.log('Wrote session_debug.json');

// ============================================================
// STEP 3: BUILD SESSIONS WITH ADAPTIVE COMPRESSION
// ============================================================
console.log('\n--- Step 3: Session Building & Compression ---');

// Map message → tags for quick lookup
const tagsByMsgId = new Map();
for (const tag of meaningTags) tagsByMsgId.set(tag.message_id, tag);

function compressPhase(phaseMsgs) {
  // Count glyph frequency in this phase
  const glyphFreq = {};
  for (const m of phaseMsgs) {
    const tag = tagsByMsgId.get(m.canonical_id);
    if (tag) {
      for (const g of tag.glyphs) {
        glyphFreq[g] = (glyphFreq[g] || 0) + 1;
      }
    }
  }

  // Pick top 2 glyphs
  const sorted = Object.entries(glyphFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([g]) => g);

  return sorted.length > 0 ? sorted.join('') : '🧭'; // default to reference if nothing
}

function describeInteractionType(dominantRelations) {
  // Most common relation across the session
  const rCounts = {};
  for (const r of dominantRelations) rCounts[r] = (rCounts[r] || 0) + 1;
  const top = Object.entries(rCounts).sort((a, b) => b[1] - a[1]);
  if (top.length === 0) return 'general exchange';
  const primary = top[0][0];
  const secondary = top[1]?.[0];

  const typeMap = {
    seed: 'generative thread',
    reference: 'referential exchange',
    amplify: 'amplification wave',
    reframe: 'reframing dialogue',
    challenge: 'challenge-driven exchange',
  };

  return typeMap[primary] || 'exchange';
}

function generateSummary(sessionMsgs, phases) {
  // Gather dominant relations
  const relations = [];
  for (const m of sessionMsgs) {
    const tag = tagsByMsgId.get(m.canonical_id);
    if (tag) relations.push(tag.relation);
  }

  const interactionType = describeInteractionType(relations);
  const actors = [...new Set(sessionMsgs.map(m => m.author))];
  const actorCount = actors.length;

  // Detect shift
  if (phases.length >= 2) {
    const firstPhaseGlyphs = phases[0];
    const lastPhaseGlyphs = phases[phases.length - 1];

    // Map glyphs to meaning labels
    const GLYPH_LABELS = {
      '✨': 'emergence', '⚡': 'divergence', '🤝': 'convergence', '🔁': 'reframing',
      '💡': 'insight', '🔥': 'amplification', '🧊': 'stabilization', '🕳️': 'breakdown',
      '🌀': 'philosophical inquiry', '🗡️': 'challenge', '🎭': 'performative framing',
      '🧠': 'analysis', '🌱': 'generative exchange', '🧭': 'reference', '🪞': 'reflection',
    };

    const firstLabel = GLYPH_LABELS[firstPhaseGlyphs[0]] || 'exchange';
    const lastLabel = GLYPH_LABELS[lastPhaseGlyphs[lastPhaseGlyphs.length > 1 ? lastPhaseGlyphs.length - 1 : 0]] || 'exchange';

    if (firstLabel !== lastLabel) {
      return `A ${interactionType} where ${firstLabel} shifted to ${lastLabel} across ${actorCount} participants.`;
    }
  }

  return `A ${interactionType} involving ${actorCount} participants.`;
}

const sessions = [];

for (let s = 0; s < sessionBoundaries.length; s++) {
  const startIdx = sessionBoundaries[s];
  const endIdx = s + 1 < sessionBoundaries.length ? sessionBoundaries[s + 1] : sortedMsgs.length;
  const sessionMsgs = sortedMsgs.slice(startIdx, endIdx);

  if (sessionMsgs.length < 3) continue; // skip tiny sessions

  const msgCount = sessionMsgs.length;

  // Adaptive phase count (constraint 4)
  let phaseCount;
  if (msgCount <= 10) phaseCount = 1;
  else if (msgCount <= 30) phaseCount = 2;
  else phaseCount = 3;

  // Build phases
  const phases = [];
  const phaseSize = Math.ceil(msgCount / phaseCount);
  for (let p = 0; p < phaseCount; p++) {
    const phaseMsgs = sessionMsgs.slice(p * phaseSize, (p + 1) * phaseSize);
    phases.push(compressPhase(phaseMsgs));
  }

  const compressedGlyph = phases.join(' → ');

  // Collect concepts in this session
  const sessionConcepts = new Map();
  for (const m of sessionMsgs) {
    const rels = msgToConceptRelations.get(m.canonical_id);
    if (rels) {
      for (const r of rels) {
        sessionConcepts.set(r.concept_id, (sessionConcepts.get(r.concept_id) || 0) + 1);
      }
    }
  }
  const topConcepts = [...sessionConcepts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ concept_id: id, count }));

  // Map session to cluster
  const clusterLookup = new Map();
  for (const c of clusters) {
    for (const id of c.artifact_ids) clusterLookup.set(id, c.id);
  }
  const sessionClusterCounts = {};
  for (const m of sessionMsgs) {
    const cid = clusterLookup.get(m.canonical_id);
    if (cid) sessionClusterCounts[cid] = (sessionClusterCounts[cid] || 0) + 1;
  }
  const primaryCluster = Object.entries(sessionClusterCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)[0] || null;

  // Generate summary
  const summary = generateSummary(sessionMsgs, phases.map(p => [...p]));

  sessions.push({
    session_id: `session_${String(sessions.length).padStart(4, '0')}`,
    start: sessionMsgs[0].timestamp,
    end: sessionMsgs[sessionMsgs.length - 1].timestamp,
    era: sessionMsgs[Math.floor(sessionMsgs.length / 2)]?.era || 'unknown',
    message_count: msgCount,
    message_ids: sessionMsgs.map(m => m.canonical_id),
    actor_ids: [...new Set(sessionMsgs.map(m => m.author))],
    compressed_glyph: compressedGlyph,
    phase_count: phaseCount,
    summary,
    dominant_concepts: topConcepts,
    primary_cluster: primaryCluster,
  });
}

console.log(`Built ${sessions.length} sessions`);
console.log(`Phase distribution: 1-phase=${sessions.filter(s => s.phase_count === 1).length}, 2-phase=${sessions.filter(s => s.phase_count === 2).length}, 3-phase=${sessions.filter(s => s.phase_count === 3).length}`);

// ── SUBSET VALIDATION (constraint 6) ─────────────────────────
console.log('\n--- Subset Validation (first 3 sessions) ---');
for (const s of sessions.slice(0, 3)) {
  console.log(`  ${s.session_id}: ${s.message_count} msgs, ${s.actor_ids.length} actors`);
  console.log(`    compressed: ${s.compressed_glyph}`);
  console.log(`    summary: ${s.summary}`);
  console.log(`    concepts: ${s.dominant_concepts.map(c => c.concept_id).join(', ')}`);
  console.log(`    era: ${s.era}, cluster: ${s.primary_cluster}`);
}

// ============================================================
// STEP 4: RESONANCE METRICS
// ============================================================
console.log('\n--- Step 4: Resonance Metrics ---');

// Pattern names for counting (change glyphs → pattern type)
const GLYPH_TO_PATTERN = {
  '✨': 'emergence', '⚡': 'divergence', '🤝': 'convergence', '🔁': 'reframe',
  '💡': 'insight', '🔥': 'amplification', '🧊': 'stabilization', '🕳️': 'breakdown',
};
const GLYPH_TO_ARCHETYPE = {
  '🌀': 'philosophical', '🗡️': 'challenge', '🎭': 'performative',
  '🧠': 'analytical', '🌱': 'generative', '🧭': 'orienting', '🪞': 'reflective',
};

function buildResonance(tags) {
  const patternCounts = {
    emergence: 0, divergence: 0, convergence: 0, reframe: 0,
    insight: 0, amplification: 0, stabilization: 0, breakdown: 0,
  };
  const archetypeCounts = {
    philosophical: 0, challenge: 0, performative: 0,
    analytical: 0, generative: 0, orienting: 0, reflective: 0,
  };

  for (const tag of tags) {
    for (const g of tag.glyphs) {
      if (GLYPH_TO_PATTERN[g]) patternCounts[GLYPH_TO_PATTERN[g]]++;
      if (GLYPH_TO_ARCHETYPE[g]) archetypeCounts[GLYPH_TO_ARCHETYPE[g]]++;
    }
  }

  // Derived labels (constraint: string only, no numeric ranks)
  const totalPatterns = Object.values(patternCounts).reduce((s, v) => s + v, 0);
  const totalArchetypes = Object.values(archetypeCounts).reduce((s, v) => s + v, 0);

  const divergenceRate = totalPatterns ? patternCounts.divergence / totalPatterns : 0;
  const reframeRate = totalPatterns ? patternCounts.reframe / totalPatterns : 0;

  let volatility = 'low';
  if (divergenceRate > 0.3) volatility = 'high';
  else if (divergenceRate > 0.15) volatility = 'medium';

  let transformation = 'absent';
  if (reframeRate > 0.2 || patternCounts.emergence > 5) transformation = 'present';
  else if (reframeRate > 0.08 || patternCounts.emergence > 2) transformation = 'partial';

  const convergenceRate = totalPatterns ? patternCounts.convergence / totalPatterns : 0;
  let coherence = 'absent';
  if (convergenceRate > 0.15) coherence = 'stable';
  else if (convergenceRate > 0.05 || patternCounts.amplification > 3) coherence = 'emerging';

  const actors = new Set(tags.map(t => t.from));
  let participation = 'narrow';
  if (actors.size > 8) participation = 'broad';
  else if (actors.size > 4) participation = 'moderate';

  // Dominant archetype resonance
  const topArchetypes = Object.entries(archetypeCounts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return {
    pattern_counts: patternCounts,
    archetype_counts: archetypeCounts,
    derived: {
      volatility,
      transformation,
      coherence,
      participation,
      archetypal_resonance: topArchetypes,
    },
  };
}

// Per-cluster resonance
const clusterResonance = {};
for (const cluster of clusters) {
  const clusterMsgSet = new Set(cluster.artifact_ids);
  const clusterTags = meaningTags.filter(t => clusterMsgSet.has(t.message_id));
  if (clusterTags.length > 0) {
    clusterResonance[cluster.id] = buildResonance(clusterTags);
  }
}

// Per-actor resonance
const actorResonance = {};
for (const actor of actors) {
  const actorTags = meaningTags.filter(t => t.from === actor.display_name);
  if (actorTags.length > 0) {
    actorResonance[actor.id] = buildResonance(actorTags);
  }
}

// Global resonance
const globalResonance = buildResonance(meaningTags);

const resonance = {
  clusters: clusterResonance,
  actors: actorResonance,
  global: globalResonance,
};

console.log(`Cluster resonance: ${Object.keys(clusterResonance).length} clusters`);
console.log(`Actor resonance: ${Object.keys(actorResonance).length} actors`);
console.log('Global derived:', globalResonance.derived);

// ============================================================
// STEP 5: EDGE MEANING (separate file — constraint 3)
// ============================================================
console.log('\n--- Step 5: Edge Meaning ---');

// For each actor↔actor edge, compute their interaction glyphs
const actorActorEdges = graphEdges.filter(e => e.type === 'actor-actor');
const edgeMeaning = [];

for (const edge of actorActorEdges) {
  const srcActor = actors.find(a => a.id === edge.source);
  const tgtActor = actors.find(a => a.id === edge.target);
  if (!srcActor || !tgtActor) continue;

  // Collect tags where from=src and to=tgt, or vice versa
  const pairTags = meaningTags.filter(t =>
    (t.from === srcActor.display_name && t.to === tgtActor.display_name) ||
    (t.from === tgtActor.display_name && t.to === srcActor.display_name)
  );

  if (pairTags.length === 0) continue;

  // Dominant glyphs for this pair
  const glyphFreq = {};
  for (const t of pairTags) {
    for (const g of t.glyphs) glyphFreq[g] = (glyphFreq[g] || 0) + 1;
  }
  const dominantGlyphs = Object.entries(glyphFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([g]) => g);

  const pairResonance = buildResonance(pairTags);

  edgeMeaning.push({
    source: edge.source,
    target: edge.target,
    interaction_count: pairTags.length,
    dominant_glyphs: dominantGlyphs,
    resonance_summary: pairResonance.derived,
  });
}

console.log(`Edge meanings: ${edgeMeaning.length}`);

// ============================================================
// WRITE FINAL OUTPUTS
// ============================================================
console.log('\n--- Writing Outputs ---');

writeFileSync(join(DATA_DIR, 'meaning_tags.json'), JSON.stringify(meaningTags, null, 2));
console.log(`meaning_tags.json: ${meaningTags.length} entries`);

writeFileSync(join(DATA_DIR, 'sessions.json'), JSON.stringify(sessions, null, 2));
console.log(`sessions.json: ${sessions.length} entries`);

writeFileSync(join(DATA_DIR, 'resonance.json'), JSON.stringify(resonance, null, 2));
console.log(`resonance.json: ${Object.keys(clusterResonance).length} clusters, ${Object.keys(actorResonance).length} actors`);

writeFileSync(join(DATA_DIR, 'edge_meaning.json'), JSON.stringify(edgeMeaning, null, 2));
console.log(`edge_meaning.json: ${edgeMeaning.length} entries (NEVER modifies graph_edges.json)`);

console.log('\n=== PASS 3 MEANING EVOLUTION COMPLETE ===');
