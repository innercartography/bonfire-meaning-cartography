/**
 * detect-harmonics.mjs
 * 
 * Detects "latent connections" (harmonics) between clusters that are NOT
 * explicitly connected in the graph. These are signals of possible future
 * bridge, collision, or convergence.
 *
 * Harmonic types:
 *   resonance — high concept overlap, low explicit edge connection
 *   tension   — shared actors, different resonance/interaction patterns
 *   echo      — parallel temporal evolution, no direct edges
 *   braid     — multiple weak signals but no strong graph edge
 *
 * weak_paths definition:
 *   Count of weak-signal dimensions satisfied across 3 axes:
 *     1. concept overlap  (shared concepts ≥ THRESHOLD)
 *     2. actor overlap    (shared actors ≥ THRESHOLD)
 *     3. temporal overlap (shared weeks ≥ THRESHOLD)
 *   Range: 0–3. Higher values indicate more dimensions of near-miss connection.
 *
 * Usage:
 *   node scripts/detect-harmonics.mjs
 *
 * Reads from: public/data/{clusters,concepts,actors,graph_edges,timeline_states,resonance}.json
 * Writes to:  public/data/harmonics.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'public', 'data');

// ── Tunable thresholds ─────────────────────────────────────────
const MIN_CONCEPT_OVERLAP   = 2;   // shared concepts to trigger resonance
const MIN_ACTOR_OVERLAP     = 2;   // shared actors to trigger tension
const MIN_TEMPORAL_OVERLAP  = 3;   // shared active weeks to trigger echo
const WEAK_EDGE_THRESHOLD   = 50;  // edge weight below this = "no strong edge" for resonance
const BRAID_EDGE_THRESHOLD  = 100; // edge weight below this = "no strong edge" for braid
const MIN_BRAID_DIMENSIONS  = 2;   // how many weak signal axes needed for braid
const MIN_CLUSTER_SIZE      = 15;  // skip clusters smaller than this

// ── Confidence weights per signal ──────────────────────────────
const W_CONCEPT  = 0.35;
const W_ACTOR    = 0.25;
const W_TEMPORAL = 0.25;
const W_WEAK     = 0.15;

// ── Load data ──────────────────────────────────────────────────
function loadJSON(filename) {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'));
}

const clusters    = loadJSON('clusters.json');
const concepts    = loadJSON('concepts.json');
const actors      = loadJSON('actors.json');
const graphEdges  = loadJSON('graph_edges.json');
const timeline    = loadJSON('timeline_states.json');
const resonance   = loadJSON('resonance.json');

// ── Precomputed maps ───────────────────────────────────────────

// Filter to non-trivial, non-General clusters
const validClusters = clusters.filter(c =>
  c.artifact_ids.length >= MIN_CLUSTER_SIZE &&
  !c.label.includes('General Discussion')
);

// concept → set of cluster IDs that contain it
const conceptToClusterIds = new Map();
for (const c of validClusters) {
  for (const cid of (c.concept_ids || [])) {
    if (!conceptToClusterIds.has(cid)) conceptToClusterIds.set(cid, new Set());
    conceptToClusterIds.get(cid).add(c.id);
  }
}

// actor → set of cluster IDs they appear in
const actorToClusterIds = new Map();
for (const c of validClusters) {
  for (const aid of (c.actor_ids || [])) {
    if (!actorToClusterIds.has(aid)) actorToClusterIds.set(aid, new Set());
    actorToClusterIds.get(aid).add(c.id);
  }
}

// cluster → set of weeks it was active (derived from time_span)
const clusterWeeks = new Map();
for (const c of validClusters) {
  const weeks = new Set();
  if (c.time_span?.start && c.time_span?.end) {
    const startDate = new Date(c.time_span.start);
    const endDate = new Date(c.time_span.end);
    for (const t of timeline) {
      const [yearStr, wStr] = t.week.split('-W');
      const year = parseInt(yearStr);
      const wNum = parseInt(wStr);
      // Approximate week start date
      const weekDate = new Date(year, 0, 1 + (wNum - 1) * 7);
      if (weekDate >= startDate && weekDate <= endDate) {
        weeks.add(t.week);
      }
    }
  }
  clusterWeeks.set(c.id, weeks);
}

// cluster pair → edge weight (bidirectional lookup)
// We only care about cluster-cluster connections, but graph_edges
// are concept-concept. So we check if clusters share concepts that
// are strongly linked.
const clusterPairEdgeWeight = new Map();
const conceptEdgeWeight = new Map();
for (const e of graphEdges) {
  if (e.type === 'concept-concept') {
    const key = [e.source, e.target].sort().join('|');
    conceptEdgeWeight.set(key, (conceptEdgeWeight.get(key) || 0) + e.weight);
  }
}

// For each pair of valid clusters, compute an aggregate edge weight
// based on how strongly their concepts are connected
function getClusterPairWeight(c1, c2) {
  const key = [c1.id, c2.id].sort().join('|');
  if (clusterPairEdgeWeight.has(key)) return clusterPairEdgeWeight.get(key);

  let totalWeight = 0;
  const concepts1 = c1.concept_ids || [];
  const concepts2 = c2.concept_ids || [];
  for (const a of concepts1) {
    for (const b of concepts2) {
      const eKey = [a, b].sort().join('|');
      totalWeight += conceptEdgeWeight.get(eKey) || 0;
    }
  }
  clusterPairEdgeWeight.set(key, totalWeight);
  return totalWeight;
}

// Cluster lookup by ID
const clusterById = new Map();
for (const c of validClusters) clusterById.set(c.id, c);

// ── Signal computation helpers ─────────────────────────────────

function computeConceptOverlap(c1, c2) {
  const s1 = new Set(c1.concept_ids || []);
  const s2 = new Set(c2.concept_ids || []);
  let count = 0;
  for (const id of s1) if (s2.has(id)) count++;
  return count;
}

function computeSharedActors(c1, c2) {
  const s1 = new Set(c1.actor_ids || []);
  const s2 = new Set(c2.actor_ids || []);
  let count = 0;
  for (const id of s1) if (s2.has(id)) count++;
  return count;
}

function computeTemporalOverlap(c1, c2) {
  const w1 = clusterWeeks.get(c1.id) || new Set();
  const w2 = clusterWeeks.get(c2.id) || new Set();
  let count = 0;
  for (const w of w1) if (w2.has(w)) count++;
  return count;
}

/**
 * weak_paths: count of weak-signal dimensions satisfied.
 * Each dimension checks if the raw signal meets its threshold.
 *   concept overlap  ≥ MIN_CONCEPT_OVERLAP  → +1
 *   actor overlap    ≥ MIN_ACTOR_OVERLAP    → +1
 *   temporal overlap ≥ MIN_TEMPORAL_OVERLAP → +1
 * Range: 0–3
 */
function computeWeakPaths(conceptOverlap, sharedActors, temporalOverlap) {
  let count = 0;
  if (conceptOverlap >= MIN_CONCEPT_OVERLAP) count++;
  if (sharedActors >= MIN_ACTOR_OVERLAP) count++;
  if (temporalOverlap >= MIN_TEMPORAL_OVERLAP) count++;
  return count;
}

function computeConfidence(signals) {
  // Normalize each signal to 0–1 range
  const normConcept  = Math.min(1, signals.concept_overlap / 4);
  const normActor    = Math.min(1, signals.shared_actors / 6);
  const normTemporal = Math.min(1, signals.temporal_overlap / 10);
  const normWeak     = signals.weak_paths / 3;

  const raw = normConcept * W_CONCEPT +
              normActor * W_ACTOR +
              normTemporal * W_TEMPORAL +
              normWeak * W_WEAK;

  return Math.round(raw * 1000) / 1000; // 3 decimal precision
}

// ── Resonance pattern comparison ───────────────────────────────
function resonanceDiffers(c1Id, c2Id) {
  const r1 = resonance?.clusters?.[c1Id]?.derived;
  const r2 = resonance?.clusters?.[c2Id]?.derived;
  if (!r1 || !r2) return false;
  // Different volatility OR different primary archetype
  if (r1.volatility !== r2.volatility) return true;
  const a1 = r1.archetypal_resonance?.[0] || '';
  const a2 = r2.archetypal_resonance?.[0] || '';
  if (a1 && a2 && a1 !== a2) return true;
  return false;
}

// ── Explanation templates ──────────────────────────────────────
function generateExplanation(type, signals) {
  switch (type) {
    case 'resonance':
      return `These clusters share ${signals.concept_overlap} concepts but have no strong direct edge — a semantic near-miss.`;
    case 'tension':
      return `These clusters share ${signals.shared_actors} actors but show different resonance patterns — a potential collision point.`;
    case 'echo':
      return `These clusters evolve in parallel across ${signals.temporal_overlap} shared weeks without explicit connection.`;
    case 'braid':
      return `These clusters share weak signals across ${signals.weak_paths} dimensions (concepts, actors, time) but lack a strong edge.`;
    default:
      return '';
  }
}

// ── Detection ──────────────────────────────────────────────────

const harmonicsMap = new Map(); // pairKey → best harmonic
let skippedPairs = 0;

for (let i = 0; i < validClusters.length; i++) {
  for (let j = i + 1; j < validClusters.length; j++) {
    const c1 = validClusters[i];
    const c2 = validClusters[j];

    const conceptOverlap  = computeConceptOverlap(c1, c2);
    const sharedActors    = computeSharedActors(c1, c2);
    const temporalOverlap = computeTemporalOverlap(c1, c2);
    const weakPaths       = computeWeakPaths(conceptOverlap, sharedActors, temporalOverlap);
    const edgeWeight      = getClusterPairWeight(c1, c2);

    const signals = {
      concept_overlap: conceptOverlap,
      shared_actors: sharedActors,
      temporal_overlap: temporalOverlap,
      weak_paths: weakPaths,
    };

    const detected = [];

    // Rule 1: RESONANCE — semantic near-miss
    if (conceptOverlap >= MIN_CONCEPT_OVERLAP && edgeWeight < WEAK_EDGE_THRESHOLD) {
      detected.push('resonance');
    }

    // Rule 2: TENSION — shared actors, different behavior
    if (sharedActors >= MIN_ACTOR_OVERLAP && resonanceDiffers(c1.id, c2.id)) {
      detected.push('tension');
    }

    // Rule 3: ECHO — parallel evolution
    if (temporalOverlap >= MIN_TEMPORAL_OVERLAP && edgeWeight === 0) {
      detected.push('echo');
    }

    // Rule 4: BRAID — multiple weak signals
    if (weakPaths >= MIN_BRAID_DIMENSIONS && edgeWeight < BRAID_EDGE_THRESHOLD) {
      detected.push('braid');
    }

    if (detected.length === 0) {
      skippedPairs++;
      continue;
    }

    // Pick the type with highest relevance (priority order)
    const typePriority = ['braid', 'tension', 'resonance', 'echo'];
    const type = typePriority.find(t => detected.includes(t)) || detected[0];

    const confidence = computeConfidence(signals);
    const pairKey = [c1.id, c2.id].sort().join('|');

    // Keep highest confidence per pair
    const existing = harmonicsMap.get(pairKey);
    if (!existing || confidence > existing.confidence) {
      harmonicsMap.set(pairKey, {
        id: `harmonic_${c1.id}_${c2.id}`,
        source_cluster_id: c1.id,
        target_cluster_id: c2.id,
        source_cluster_label: c1.label,
        target_cluster_label: c2.label,
        type,
        confidence,
        signals,
        explanation: generateExplanation(type, signals),
        first_detected_at: new Date().toISOString(),
      });
    }
  }
}

const harmonics = [...harmonicsMap.values()]
  .sort((a, b) => b.confidence - a.confidence);

// ── Debug output ───────────────────────────────────────────────
const typeCounts = {};
for (const h of harmonics) {
  typeCounts[h.type] = (typeCounts[h.type] || 0) + 1;
}

console.log('\n═══ Harmonic Detection Results ═══');
console.log(`  Total harmonics:  ${harmonics.length}`);
console.log(`  Skipped pairs:    ${skippedPairs}`);
console.log(`  By type:`);
for (const [t, c] of Object.entries(typeCounts)) {
  console.log(`    ${t}: ${c}`);
}
console.log(`\n  Top 5 highest-confidence:`);
for (const h of harmonics.slice(0, 5)) {
  console.log(`    [${h.type}] ${h.source_cluster_label} ↔ ${h.target_cluster_label}  (${h.confidence})`);
}
console.log('══════════════════════════════════\n');

// ── Write output ───────────────────────────────────────────────
const outPath = join(DATA_DIR, 'harmonics.json');
writeFileSync(outPath, JSON.stringify(harmonics, null, 2));
console.log(`Wrote ${harmonics.length} harmonics to ${outPath}`);
