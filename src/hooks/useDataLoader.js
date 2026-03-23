/**
 * useDataLoader.js — Pass 3
 * Fetches all JSON data files and builds lookup maps.
 * Now includes meaning_tags, sessions, resonance, edge_meaning.
 */
import { useState, useEffect, useMemo } from 'react';

export function useDataLoader() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [messages, concepts, actors, clusters, edges, timeline,
               meaningTags, sessions, resonance, edgeMeaning] = await Promise.all([
          fetch('/data/normalized_messages.json').then(r => r.json()),
          fetch('/data/concepts.json').then(r => r.json()),
          fetch('/data/actors.json').then(r => r.json()),
          fetch('/data/clusters.json').then(r => r.json()),
          fetch('/data/graph_edges.json').then(r => r.json()),
          fetch('/data/timeline_states.json').then(r => r.json()),
          // Pass 3 data
          fetch('/data/meaning_tags.json').then(r => r.json()).catch(() => []),
          fetch('/data/sessions.json').then(r => r.json()).catch(() => []),
          fetch('/data/resonance.json').then(r => r.json()).catch(() => ({ clusters: {}, actors: {}, global: {} })),
          fetch('/data/edge_meaning.json').then(r => r.json()).catch(() => []),
        ]);
        setData({ messages, concepts, actors, clusters, edges, timeline,
                  meaningTags, sessions, resonance, edgeMeaning });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Build lookup maps
  const lookups = useMemo(() => {
    if (!data) return null;
    const msgById = new Map();
    for (const m of data.messages) msgById.set(m.canonical_id, m);

    const conceptById = new Map();
    for (const c of data.concepts) conceptById.set(c.id, c);

    const actorById = new Map();
    for (const a of data.actors) actorById.set(a.id, a);

    const actorByName = new Map();
    for (const a of data.actors) actorByName.set(a.display_name, a);

    const clusterById = new Map();
    for (const c of data.clusters) clusterById.set(c.id, c);

    // Map message IDs to their cluster
    const msgToCluster = new Map();
    for (const c of data.clusters) {
      for (const id of c.artifact_ids) {
        msgToCluster.set(id, c.id);
      }
    }

    // Map messages to their concepts
    const msgToConcepts = new Map();
    for (const c of data.concepts) {
      for (const id of c.artifact_ids) {
        if (!msgToConcepts.has(id)) msgToConcepts.set(id, []);
        msgToConcepts.get(id).push(c.id);
      }
    }

    // Pass 3 lookups
    const tagsByMsgId = new Map();
    if (data.meaningTags) {
      for (const t of data.meaningTags) tagsByMsgId.set(t.message_id, t);
    }

    // Sessions by cluster
    const sessionsByCluster = new Map();
    if (data.sessions) {
      for (const s of data.sessions) {
        if (s.primary_cluster) {
          if (!sessionsByCluster.has(s.primary_cluster)) sessionsByCluster.set(s.primary_cluster, []);
          sessionsByCluster.get(s.primary_cluster).push(s);
        }
      }
    }

    // Edge meaning lookup
    const edgeMeaningMap = new Map();
    if (data.edgeMeaning) {
      for (const em of data.edgeMeaning) {
        const key = [em.source, em.target].sort().join('|');
        edgeMeaningMap.set(key, em);
      }
    }

    return {
      msgById, conceptById, actorById, actorByName, clusterById,
      msgToCluster, msgToConcepts,
      tagsByMsgId, sessionsByCluster, edgeMeaningMap,
    };
  }, [data]);

  return { data, loading, error, lookups };
}
