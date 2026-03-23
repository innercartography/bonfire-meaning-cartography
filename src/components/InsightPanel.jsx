/**
 * InsightPanel.jsx — Pass 3
 * Richer, more interpretive panels for all node types
 * + meaning evolution layer (glyphs, sessions, resonance)
 */
import React from 'react';

function fmt(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ts; }
}

function ScoreBar({ label, value, type, max = 1 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="score-bar-container">
      <div className="score-bar-label">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="score-bar">
        <div className={`score-bar-fill ${type}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TendencyBar({ label, value, color }) {
  return (
    <div className="tendency-bar">
      <span className="tendency-label">{label}</span>
      <div className="tendency-track">
        <div className="tendency-fill" style={{ width: `${Math.min(100, value * 100)}%`, background: color || '' }} />
      </div>
      <span className="tendency-value">{value.toFixed(2)}</span>
    </div>
  );
}

function RelationBadge({ type, count }) {
  if (!count) return null;
  return <span className={`tag ${type}`}>{type}: {count}</span>;
}

// ── Artifact Detail ────────────────────────────────────────
function ArtifactDetail({ msg, lookups, onSelectNode }) {
  const conceptIds = lookups.msgToConcepts.get(msg.canonical_id) || [];
  const concepts = conceptIds.map(id => lookups.conceptById.get(id)).filter(Boolean);
  const replyMsg = msg.reply_to ? lookups.msgById.get(msg.reply_to) : null;
  const tag = lookups.tagsByMsgId?.get(msg.canonical_id);

  return (
    <>
      <div className="panel-header">
        <div className="panel-header-top">
          <span className="panel-type-badge">Artifact</span>
          {tag && <span className="glyph-badge" title={tag.reason}>{tag.glyphs.join('')}</span>}
        </div>
        <div className="panel-title">{msg.author}</div>
        <div className="panel-subtitle">{fmt(msg.timestamp)} · {msg.era || 'unknown'} era</div>
      </div>
      <div className="panel-body">
        <div className="panel-section">
          <div className="panel-text message-text">{msg.text}</div>
        </div>

        {tag && (
          <div className="panel-section">
            <div className="panel-section-title">Meaning Tag</div>
            <div className="glyph-tag-row">
              <span className="glyph-large">{tag.glyphs.join(' ')}</span>
              <span className="glyph-reason">{tag.reason}</span>
            </div>
          </div>
        )}

        <div className="panel-section">
          <div className="panel-section-title">Signal Quality</div>
          <ScoreBar label="Groundedness" value={msg.groundedness_score || 0} type="grounded" />
          <ScoreBar label="Abstraction" value={msg.abstraction_score || 0} type="abstract" />
        </div>

        {concepts.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Concepts Present</div>
            <div className="tag-list">
              {concepts.map(c => (
                <span
                  key={c.id}
                  className="tag concept clickable"
                  onClick={() => onSelectNode({ type: 'concept', id: c.id, data: c })}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {replyMsg && (
          <div className="panel-section">
            <div className="panel-section-title">Replying To</div>
            <div
              className="related-message clickable"
              onClick={() => onSelectNode({ type: 'artifact', id: replyMsg.canonical_id, data: replyMsg })}
            >
              <div className="related-message-meta">
                <span>{replyMsg.author}</span>
                <span>{fmt(replyMsg.timestamp)}</span>
              </div>
              <div className="related-message-text">{replyMsg.text}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Concept Detail ─────────────────────────────────────────
function ConceptDetail({ concept, lookups, onSelectNode, onFocusConcept }) {
  const sampleMsgs = (concept.artifact_ids || []).slice(0, 5)
    .map(id => lookups.msgById.get(id)).filter(Boolean);

  const rels = concept.relation_counts || {};
  const eras = concept.era_scores || {};
  const totalRels = (rels.seed || 0) + (rels.reference || 0) + (rels.amplify || 0) + (rels.reframe || 0) + (rels.challenge || 0);

  // Compute drift signal
  const earlyA = eras.early?.abstraction || 0;
  const lateA = eras.late?.abstraction || 0;
  const driftSignal = lateA - earlyA;

  return (
    <>
      <div className="panel-header">
        <div className="panel-header-top">
          <span className="panel-type-badge concept">{concept.category}</span>
          <button
            className="panel-focus-btn"
            onClick={() => onFocusConcept(concept.id)}
            title="Focus on this concept"
          >◎ Focus</button>
        </div>
        <div className="panel-title">{concept.label}</div>
        <div className="panel-subtitle">{concept.mention_count} mentions · {concept.actor_ids?.length || 0} actors</div>
      </div>
      <div className="panel-body">
        <div className="panel-section">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">First Seen</div>
              <div className="stat-value" style={{ fontSize: '11px' }}>{fmt(concept.first_seen)}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Last Seen</div>
              <div className="stat-value" style={{ fontSize: '11px' }}>{fmt(concept.last_seen)}</div>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-section-title">Signal Quality</div>
          <ScoreBar label="Groundedness" value={concept.groundedness_score || 0} type="grounded" />
          <ScoreBar label="Abstraction" value={concept.abstraction_score || 0} type="abstract" />
          {driftSignal > 0.05 && (
            <div className="panel-caution">⚠ Abstraction increased over time (+{(driftSignal * 100).toFixed(0)}%)</div>
          )}
          {driftSignal < -0.05 && (
            <div className="panel-positive">⚓ Became more grounded over time ({(driftSignal * 100).toFixed(0)}%)</div>
          )}
        </div>

        {/* Era breakdown */}
        <div className="panel-section">
          <div className="panel-section-title">Evolution by Era</div>
          <div className="era-grid">
            {['early', 'middle', 'late'].map(e => {
              const es = eras[e];
              if (!es || !es.count) return null;
              return (
                <div key={e} className="era-item">
                  <div className="era-name">{e === 'early' ? 'Genesis' : e === 'middle' ? 'Growth' : 'Convergence'}</div>
                  <div className="era-count">{es.count} msgs</div>
                  <div className="era-scores">
                    <span className="grounded-text">G {(es.groundedness * 100).toFixed(0)}%</span>
                    <span className="abstract-text">A {(es.abstraction * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Relation breakdown */}
        {totalRels > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Relation Pattern</div>
            <div className="tag-list">
              <RelationBadge type="seed" count={rels.seed} />
              <RelationBadge type="reference" count={rels.reference} />
              <RelationBadge type="amplify" count={rels.amplify} />
              <RelationBadge type="reframe" count={rels.reframe} />
              <RelationBadge type="challenge" count={rels.challenge} />
            </div>
          </div>
        )}

        <div className="panel-section">
          <div className="panel-section-title">Evolution Summary</div>
          <div className="panel-text">{concept.evolution_summary}</div>
        </div>

        {concept.actor_ids?.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Key Shapers</div>
            <div className="tag-list">
              {concept.actor_ids.slice(0, 10).map(name => {
                const actor = lookups.actorByName.get(name);
                return (
                  <span
                    key={name}
                    className="tag actor clickable"
                    onClick={() => actor && onSelectNode({ type: 'actor', id: actor.id, data: actor })}
                  >
                    {name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {sampleMsgs.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Key Artifacts</div>
            {sampleMsgs.map(m => (
              <div
                key={m.canonical_id}
                className="related-message clickable"
                onClick={() => onSelectNode({ type: 'artifact', id: m.canonical_id, data: m })}
              >
                <div className="related-message-meta">
                  <span>{m.author}</span>
                  <span>{fmt(m.timestamp)}</span>
                </div>
                <div className="related-message-text">{m.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Actor Detail ───────────────────────────────────────────
function ActorDetail({ actor, lookups, onSelectNode, onFocusActor, resonance }) {
  const sampleMsgs = (actor.message_ids || []).slice(0, 5)
    .map(id => lookups.msgById.get(id)).filter(Boolean);
  const actorRes = resonance?.actors?.[actor.id];

  return (
    <>
      <div className="panel-header">
        <div className="panel-header-top">
          <span className="panel-type-badge actor">{actor.actor_kind}</span>
          <button
            className="panel-focus-btn"
            onClick={() => onFocusActor(actor.display_name)}
            title="Highlight this actor's artifacts"
          >◎ Focus</button>
        </div>
        <div className="panel-title">{actor.display_name}</div>
        <div className="panel-subtitle">{actor.message_count} messages · {actor.labels?.join(', ') || 'no label'}</div>
      </div>
      <div className="panel-body">
        <div className="panel-section">
          <div className="panel-text">{actor.summary}</div>
        </div>

        <div className="panel-section">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Messages</div>
              <div className="stat-value">{actor.message_count}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Reply Centrality</div>
              <div className="stat-value">{(actor.reply_centrality * 100).toFixed(0)}%</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Concepts Seeded</div>
              <div className="stat-value">{actor.concept_seed_count}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Vocab Novelty</div>
              <div className="stat-value">{(actor.vocabulary_novelty * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>

        {/* Pass 3: Resonance Profile */}
        {actorRes && (
          <div className="panel-section">
            <div className="panel-section-title">Resonance Profile</div>
            <div className="resonance-derived">
              <span className="resonance-label">Volatility: <strong>{actorRes.derived.volatility}</strong></span>
              <span className="resonance-label">Transformation: <strong>{actorRes.derived.transformation}</strong></span>
              <span className="resonance-label">Coherence: <strong>{actorRes.derived.coherence}</strong></span>
            </div>
            {actorRes.derived.archetypal_resonance?.length > 0 && (
              <div className="tag-list" style={{ marginTop: '6px' }}>
                {actorRes.derived.archetypal_resonance.map(a => (
                  <span key={a} className="tag archetype">{a}</span>
                ))}
              </div>
            )}
            {Object.entries(actorRes.archetype_counts).filter(([,v]) => v > 0).length > 0 && (
              <div style={{ marginTop: '8px' }}>
                {Object.entries(actorRes.archetype_counts)
                  .filter(([,v]) => v > 0)
                  .sort((a,b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([k, v]) => (
                    <TendencyBar key={k} label={k} value={v / Math.max(1, ...Object.values(actorRes.archetype_counts))} color="#8b5cf6" />
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Era activity */}
        <div className="panel-section">
          <div className="panel-section-title">Activity by Era</div>
          <div className="era-grid">
            <div className="era-item">
              <div className="era-name">Genesis</div>
              <div className="era-count">{actor.era_activity?.early || 0}</div>
            </div>
            <div className="era-item">
              <div className="era-name">Growth</div>
              <div className="era-count">{actor.era_activity?.middle || 0}</div>
            </div>
            <div className="era-item">
              <div className="era-name">Convergence</div>
              <div className="era-count">{actor.era_activity?.late || 0}</div>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-section-title">Communication Profile</div>
          <TendencyBar label="Initiator" value={actor.initiator_score} />
          <TendencyBar label="Responder" value={actor.responder_score} />
          <TendencyBar label="Synthesis" value={actor.synthesis_score} />
          <TendencyBar label="Seeding" value={actor.seeding_rate} color="#f59e0b" />
          <TendencyBar label="Amplification" value={actor.amplification_rate} color="#34d399" />
          <TendencyBar label="Reframing" value={actor.reframing_rate} color="#a78bfa" />
          <TendencyBar label="Challenge" value={actor.challenge_rate} color="#f472b6" />
          <TendencyBar label="Resource" value={actor.resource_sharing_score} />
        </div>

        <div className="panel-section">
          <div className="panel-section-title">Signal Quality</div>
          <ScoreBar label="Operationality" value={actor.operationality_score || 0} type="grounded" />
          {actor.abstraction_drift > 0.05 && (
            <div className="panel-caution">⚠ Abstraction drift: +{(actor.abstraction_drift * 100).toFixed(0)}% over time</div>
          )}
          {actor.abstraction_drift < -0.05 && (
            <div className="panel-positive">⚓ Became more grounded: {(actor.abstraction_drift * 100).toFixed(0)}% over time</div>
          )}
        </div>

        {actor.concept_ids?.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Top Concepts</div>
            <div className="tag-list">
              {actor.concept_ids.slice(0, 8).map(id => {
                const c = lookups.conceptById.get(id);
                return c ? (
                  <span
                    key={id}
                    className="tag concept clickable"
                    onClick={() => onSelectNode({ type: 'concept', id: c.id, data: c })}
                  >{c.label}</span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {actor.labels?.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Behavioral Labels</div>
            <div className="tag-list">
              {actor.labels.map(l => <span key={l} className="tag">{l}</span>)}
            </div>
          </div>
        )}

        {sampleMsgs.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Sample Messages</div>
            {sampleMsgs.map(m => (
              <div
                key={m.canonical_id}
                className="related-message clickable"
                onClick={() => onSelectNode({ type: 'artifact', id: m.canonical_id, data: m })}
              >
                <div className="related-message-meta">
                  <span>{m.author}</span>
                  <span>{fmt(m.timestamp)}</span>
                </div>
                <div className="related-message-text">{m.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Cluster Detail ─────────────────────────────────────────
function ClusterDetail({ cluster, lookups, onSelectNode, resonance, sessions }) {
  const rels = cluster.relation_counts || {};
  const clusterRes = resonance?.clusters?.[cluster.id];
  const clusterSessions = sessions?.filter(s => s.primary_cluster === cluster.id)
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 5) || [];

  return (
    <>
      <div className="panel-header">
        <div className="panel-header-top">
          <span className="panel-type-badge cluster">{cluster.era}</span>
          {clusterRes && (
            <span className="glyph-badge" title="Cluster resonance">
              {clusterRes.derived.archetypal_resonance?.[0] || ''}
            </span>
          )}
        </div>
        <div className="panel-title">{cluster.symbol} {cluster.label}</div>
        <div className="panel-subtitle">{cluster.artifact_ids?.length} messages · {cluster.era} era</div>
      </div>
      <div className="panel-body">
        <div className="panel-section">
          <div className="panel-text">{cluster.summary}</div>
        </div>

        {cluster.caution && (
          <div className="panel-section">
            <div className="panel-caution">{cluster.caution}</div>
          </div>
        )}

        {/* Pass 3: Meaning Evolution */}
        {clusterRes && (
          <div className="panel-section">
            <div className="panel-section-title">Meaning Evolution</div>
            <div className="resonance-derived">
              <span className="resonance-label">Volatility: <strong>{clusterRes.derived.volatility}</strong></span>
              <span className="resonance-label">Transformation: <strong>{clusterRes.derived.transformation}</strong></span>
              <span className="resonance-label">Coherence: <strong>{clusterRes.derived.coherence}</strong></span>
              <span className="resonance-label">Participation: <strong>{clusterRes.derived.participation}</strong></span>
            </div>
            {clusterRes.derived.archetypal_resonance?.length > 0 && (
              <div className="tag-list" style={{ marginTop: '6px' }}>
                {clusterRes.derived.archetypal_resonance.map(a => (
                  <span key={a} className="tag archetype">{a}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pass 3: Session Summaries */}
        {clusterSessions.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Key Sessions</div>
            {clusterSessions.map(s => (
              <div key={s.session_id} className="session-card">
                <div className="session-card-header">
                  <span className="session-glyph">{s.compressed_glyph}</span>
                  <span className="session-meta">{s.message_count} msgs · {s.actor_ids.length} actors</span>
                </div>
                <div className="session-summary">{s.summary}</div>
              </div>
            ))}
          </div>
        )}

        <div className="panel-section">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-label">Messages</div>
              <div className="stat-value">{cluster.artifact_ids?.length || 0}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Actors</div>
              <div className="stat-value">{cluster.actor_ids?.length || 0}</div>
            </div>
          </div>
        </div>

        <div className="panel-section">
          <div className="panel-section-title">Discourse Quality</div>
          <ScoreBar label="Groundedness" value={cluster.avg_groundedness || 0} type="grounded" />
          <ScoreBar label="Abstraction" value={cluster.avg_abstraction || 0} type="abstract" />
        </div>

        {/* Relation pattern */}
        <div className="panel-section">
          <div className="panel-section-title">Relation Pattern</div>
          <div className="tag-list">
            <RelationBadge type="seed" count={rels.seed} />
            <RelationBadge type="reference" count={rels.reference} />
            <RelationBadge type="amplify" count={rels.amplify} />
            <RelationBadge type="reframe" count={rels.reframe} />
            <RelationBadge type="challenge" count={rels.challenge} />
          </div>
        </div>

        {cluster.concept_ids?.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Concepts</div>
            <div className="tag-list">
              {cluster.concept_ids.map(id => {
                const c = lookups.conceptById.get(id);
                return c ? (
                  <span
                    key={id}
                    className="tag concept clickable"
                    onClick={() => onSelectNode({ type: 'concept', id: c.id, data: c })}
                  >{c.label}</span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {cluster.top_actors?.length > 0 && (
          <div className="panel-section">
            <div className="panel-section-title">Key Voices</div>
            <div className="tag-list">
              {cluster.top_actors.map(name => {
                const actor = lookups.actorByName.get(name);
                return (
                  <span
                    key={name}
                    className="tag actor clickable"
                    onClick={() => actor && onSelectNode({ type: 'actor', id: actor.id, data: actor })}
                  >
                    {name}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="panel-section">
          <div className="panel-section-title">Time Span</div>
          <div className="panel-text">{fmt(cluster.time_span?.start)} → {fmt(cluster.time_span?.end)}</div>
        </div>
      </div>
    </>
  );
}

// ── Main Panel ─────────────────────────────────────────────
export default function InsightPanel({ selectedNode, lookups, onClose, onSelectNode, onFocusConcept, onFocusActor, data }) {
  const resonance = data?.resonance;
  const sessions = data?.sessions;

  if (!selectedNode) {
    return (
      <div className="insight-panel">
        <div className="empty-panel">
          <div className="empty-panel-icon">◈</div>
          <div className="empty-panel-title">Select an element</div>
          <div className="empty-panel-desc">
            Click a cluster district, concept anchor, artifact token, or actor beacon to explore meaning and discourse patterns.
          </div>
        </div>
      </div>
    );
  }

  const { type, data: nodeData } = selectedNode;

  return (
    <div className="insight-panel" onClick={(e) => {
      if (e.target.classList.contains('panel-close')) onClose();
    }}>
      <button className="panel-close-fixed" onClick={onClose} title="Close">×</button>
      {type === 'artifact' && <ArtifactDetail msg={nodeData} lookups={lookups} onSelectNode={onSelectNode} />}
      {type === 'concept' && <ConceptDetail concept={nodeData} lookups={lookups} onSelectNode={onSelectNode} onFocusConcept={onFocusConcept} />}
      {type === 'actor' && <ActorDetail actor={nodeData} lookups={lookups} onSelectNode={onSelectNode} onFocusActor={onFocusActor} resonance={resonance} />}
      {type === 'cluster' && <ClusterDetail cluster={nodeData} lookups={lookups} onSelectNode={onSelectNode} resonance={resonance} sessions={sessions} />}
    </div>
  );
}
