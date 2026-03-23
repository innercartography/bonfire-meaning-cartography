/**
 * spatial.js — Pass 2
 * Temporal layout: X = time (left→right), Z = category/concept,
 * Y = abstraction height. Clusters grouped by era.
 */

const CATEGORY_COLORS = {
  infra: '#60a5fa',
  narrative: '#f472b6',
  governance: '#f59e0b',
  social: '#34d399',
  symbolic: '#a78bfa',
  hybrid: '#22d3ee',
  discovered: '#94a3b8',
};

const ERA_X = { early: -30, middle: 0, late: 30 };

/**
 * Layout clusters: X = era (left→right), Z = staggered by category
 */
export function layoutClusters(clusters) {
  // Group by era
  const eraGroups = { early: [], middle: [], late: [] };
  for (const c of clusters) {
    const era = c.era || 'middle';
    (eraGroups[era] || eraGroups.middle).push(c);
  }

  const result = [];
  for (const [era, eraClusters] of Object.entries(eraGroups)) {
    const baseX = ERA_X[era] || 0;
    // Filter out tiny clusters < 15 msgs and "General Discussion"
    const major = eraClusters.filter(c => c.artifact_ids.length >= 15 && !c.label.includes('General Discussion'));
    // Sort by size descending, place bigger ones centrally
    major.sort((a, b) => b.artifact_ids.length - a.artifact_ids.length);

    const rows = Math.ceil(Math.sqrt(major.length));
    for (let i = 0; i < major.length; i++) {
      const row = Math.floor(i / rows);
      const col = i % rows;
      const spacing = 14;
      const xOffset = row * 4; // slight spread
      const zOffset = col * spacing - (rows * spacing) / 2;
      const radius = Math.max(3, Math.min(8, Math.sqrt(major[i].artifact_ids.length) * 0.35));

      result.push({
        ...major[i],
        position: [baseX + xOffset, 0, zOffset],
        radius,
        eraX: baseX,
      });
    }

    // Add general discussion as a large background zone
    const general = eraClusters.find(c => c.label.includes('General Discussion'));
    if (general) {
      result.push({
        ...general,
        position: [baseX, -0.1, rows * 7 + 5],
        radius: Math.min(12, Math.sqrt(general.artifact_ids.length) * 0.25),
        eraX: baseX,
        isGeneral: true,
      });
    }
  }

  return result;
}

/**
 * Distribute artifact positions within a cluster
 * Grounded = low/dense. Abstract = high/diffuse.
 */
export function layoutArtifacts(artifactIds, clusterPosition, radius, msgById) {
  const positions = [];
  const maxCount = Math.min(artifactIds.length, 120);
  const step = Math.max(1, Math.floor(artifactIds.length / maxCount));

  for (let i = 0; i < artifactIds.length && positions.length < maxCount; i += step) {
    const id = artifactIds[i];
    const msg = msgById?.get(id);
    if (!msg) continue;

    const t = positions.length / maxCount;
    const angle = t * Math.PI * 8 + i * 0.17;
    const r = t * radius * 0.8;
    const g = msg.groundedness_score || 0;
    const a = msg.abstraction_score || 0;

    positions.push({
      id,
      position: [
        clusterPosition[0] + Math.cos(angle) * r + (Math.random() - 0.5) * 0.3,
        0.15 + a * 3, // abstract = higher
        clusterPosition[2] + Math.sin(angle) * r + (Math.random() - 0.5) * 0.3,
      ],
      groundedness: g,
      abstraction: a,
      author: msg.author,
      era: msg.era || 'middle',
    });
  }

  return positions;
}

export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.hybrid;
}

export function getClusterColor(cluster) {
  return CATEGORY_COLORS[cluster.category] || CATEGORY_COLORS.hybrid;
}

/**
 * Place actors at their most active cluster
 */
export function getActorPositions(actors, clusterPositions) {
  const result = [];
  for (const actor of actors.slice(0, 35)) {
    // Find best matching cluster
    const actorMsgSet = new Set(actor.message_ids || []);
    let bestCluster = null;
    let bestOverlap = 0;

    for (const cp of clusterPositions) {
      const overlap = cp.artifact_ids.filter(id => actorMsgSet.has(id)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCluster = cp;
      }
    }

    if (bestCluster) {
      const angle = result.length * 1.2;
      const offset = 2 + (result.length % 3);
      result.push({
        actor,
        position: [
          bestCluster.position[0] + Math.cos(angle) * offset,
          0.1,
          bestCluster.position[2] + Math.sin(angle) * offset,
        ],
      });
    }
  }
  return result;
}

/**
 * ERA CONSTANTS for scene rendering
 */
export const ERA_CONFIG = {
  early: { label: 'GENESIS', x: -30, color: '#34d399' },
  middle: { label: 'GROWTH', x: 0, color: '#60a5fa' },
  late: { label: 'CONVERGENCE', x: 30, color: '#a78bfa' },
};
