/**
 * MethodologyInfo.jsx
 * 
 * Ontology transparency component — shows users exactly how
 * groundedness, abstraction, and meaning tags are computed.
 * 
 * "Heuristic signal, not semantic analysis."
 */
import React, { useState } from 'react';

const GROUNDED_PATTERNS = [
  { pattern: 'URLs (https://…)', example: 'links to external resources' },
  { pattern: 'Code/dev terms', example: 'github, deploy, api, docker, compile' },
  { pattern: 'Data/system terms', example: 'database, server, pipeline, schema, json' },
  { pattern: 'Business terms', example: 'budget, revenue, funding, milestone' },
  { pattern: 'Documentation', example: 'contract, spec, documentation, readme' },
  { pattern: 'Versioning', example: 'step 1, phase 2, version 3, PR, issue #' },
  { pattern: 'Tech specifics', example: 'solidity, rust, python, react, node' },
  { pattern: 'Code blocks', example: '``` fenced code ```' },
];

const ABSTRACT_PATTERNS = [
  { pattern: 'Transcendence', example: 'cosmic, universal, infinite, sacred, divine' },
  { pattern: 'Philosophy', example: 'ontology, epistemology, metaphysics, phenomenology' },
  { pattern: 'Consciousness', example: 'soul, spirit, awakening, enlightenment' },
  { pattern: 'Mythic/symbolic', example: 'archetypal, primordial, alchemical, mystical' },
  { pattern: 'Emergence', example: 'emergence, unfold, manifest, incarnate' },
  { pattern: 'Meta-narrative', example: 'paradigm, worldview, cosmology, grand narrative' },
  { pattern: 'Collective mind', example: 'collective intelligence, noosphere, egregore' },
  { pattern: 'Fractal/holographic', example: 'fractal, holographic, recursive, holonic' },
  { pattern: 'Resonance', example: 'resonance, vibration, frequency, harmonic' },
];

const CLUSTER_METHOD = {
  title: 'How Clusters Form',
  steps: [
    'Messages are divided into 3 temporal eras (early / middle / late)',
    'Within each era, concepts that co-occur in the same messages are greedily grouped',
    'Co-occurrence threshold: 20% of the smaller concept\'s count',
    'Maximum 4 concepts per cluster group',
    'Remaining unthemed messages become "General Discussion"',
  ],
};

const GLYPH_METHOD = {
  title: 'How Glyphs Are Assigned',
  steps: [
    'Each message gets max 2 glyphs (1 relation + 1 optional tone)',
    'Relation type based on position in concept timeline + linguistic cues',
    'Tone assigned conservatively via keyword matching',
    'No LLM, no sentiment analysis — purely pattern-based',
  ],
};

export default function MethodologyInfo({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('scoring');

  if (!isOpen) return null;

  return (
    <div className="methodology-overlay">
      <div className="methodology-panel">
        <div className="methodology-header">
          <div>
            <div className="methodology-title">How This Works</div>
            <div className="methodology-subtitle">Ontology & methodology transparency</div>
          </div>
          <button className="methodology-close" onClick={onClose}>×</button>
        </div>

        <div className="methodology-tabs">
          <button
            className={`methodology-tab ${activeTab === 'scoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('scoring')}
          >Scoring</button>
          <button
            className={`methodology-tab ${activeTab === 'clusters' ? 'active' : ''}`}
            onClick={() => setActiveTab('clusters')}
          >Clusters</button>
          <button
            className={`methodology-tab ${activeTab === 'glyphs' ? 'active' : ''}`}
            onClick={() => setActiveTab('glyphs')}
          >Glyphs</button>
          <button
            className={`methodology-tab ${activeTab === 'ontology' ? 'active' : ''}`}
            onClick={() => setActiveTab('ontology')}
          >Ontology</button>
        </div>

        <div className="methodology-body">
          {activeTab === 'scoring' && (
            <>
              <div className="methodology-callout">
                <div className="methodology-callout-label">⚡ Key Insight</div>
                <p>Groundedness and Abstraction are <strong>regex-based heuristic signals</strong>, 
                not semantic analysis. They detect keyword patterns, not meaning.</p>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">
                  <span className="methodology-dot grounded" /> Groundedness Score
                </div>
                <p className="methodology-desc">
                  Score = min(1, pattern_matches / 3). Range: 0–100%.
                  Higher means more concrete, operational language detected.
                </p>
                <div className="methodology-pattern-list">
                  {GROUNDED_PATTERNS.map((p, i) => (
                    <div key={i} className="methodology-pattern">
                      <span className="methodology-pattern-name">{p.pattern}</span>
                      <span className="methodology-pattern-example">{p.example}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">
                  <span className="methodology-dot abstract" /> Abstraction Score
                </div>
                <p className="methodology-desc">
                  Score = min(1, pattern_matches / 2). Range: 0–100%.
                  Higher means more philosophical, symbolic language detected.
                  <br /><em>Note: lower threshold (÷2 vs ÷3) means abstraction triggers more easily.</em>
                </p>
                <div className="methodology-pattern-list">
                  {ABSTRACT_PATTERNS.map((p, i) => (
                    <div key={i} className="methodology-pattern">
                      <span className="methodology-pattern-name">{p.pattern}</span>
                      <span className="methodology-pattern-example">{p.example}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="methodology-caveat">
                <strong>Known limitations:</strong>
                <ul>
                  <li>A deeply philosophical message about deploying infrastructure scores both high</li>
                  <li>Casual messages with neither signal score 0/0</li>
                  <li>Can't distinguish between using abstract language and critiquing it</li>
                  <li>Concept-level scores are averages across all matching messages</li>
                </ul>
              </div>
            </>
          )}

          {activeTab === 'clusters' && (
            <>
              <div className="methodology-section">
                <div className="methodology-section-title">{CLUSTER_METHOD.title}</div>
                <ol className="methodology-steps">
                  {CLUSTER_METHOD.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="methodology-callout">
                <div className="methodology-callout-label">Why This Matters</div>
                <p>Clusters are <strong>temporal co-occurrence buckets</strong>, not semantic similarity groups. 
                The same concept pair can appear in multiple eras as separate clusters. 
                This is intentional — it shows how the same concepts evolved over time.</p>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">Cluster Scores</div>
                <p className="methodology-desc">
                  avg_groundedness and avg_abstraction are simple averages across all messages 
                  in the cluster. Caution flags trigger when abstraction {'>'} 0.2 and groundedness {'<'} 0.1, 
                  or when amplification exceeds challenge by 5x.
                </p>
              </div>
            </>
          )}

          {activeTab === 'glyphs' && (
            <>
              <div className="methodology-section">
                <div className="methodology-section-title">{GLYPH_METHOD.title}</div>
                <ol className="methodology-steps">
                  {GLYPH_METHOD.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">Relation Glyphs</div>
                <div className="methodology-glyph-grid">
                  {[
                    { glyph: '✨', name: 'Seed', rule: 'First 5 mentions of a concept' },
                    { glyph: '🧭', name: 'Reference', rule: 'Default: building on existing concept' },
                    { glyph: '🔥', name: 'Amplify', rule: 'Short affirmative messages (<120 chars)' },
                    { glyph: '🔁', name: 'Reframe', rule: 'Keywords: "actually", "instead", "rethink"' },
                    { glyph: '⚡', name: 'Challenge', rule: 'Keywords: "disagree", "concern", "risk"' },
                  ].map(g => (
                    <div key={g.name} className="methodology-glyph-item">
                      <span className="methodology-glyph-icon">{g.glyph}</span>
                      <div>
                        <div className="methodology-glyph-name">{g.name}</div>
                        <div className="methodology-glyph-rule">{g.rule}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">Tone Glyphs (Optional)</div>
                <div className="methodology-glyph-grid">
                  {[
                    { glyph: '🧠', name: 'Analytical', rule: 'Framework, structure, model language' },
                    { glyph: '🌱', name: 'Generative', rule: '"What if", proposal, new approach' },
                    { glyph: '🪞', name: 'Reflective', rule: 'Meta-commentary, "looking back"' },
                    { glyph: '🌀', name: 'Philosophical', rule: 'Ontological, phenomenological depth' },
                    { glyph: '🎭', name: 'Performative', rule: "Devil's advocate, role-playing (rare)" },
                  ].map(g => (
                    <div key={g.name} className="methodology-glyph-item">
                      <span className="methodology-glyph-icon">{g.glyph}</span>
                      <div>
                        <div className="methodology-glyph-name">{g.name}</div>
                        <div className="methodology-glyph-rule">{g.rule}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'ontology' && (
            <>
              <div className="methodology-callout">
                <div className="methodology-callout-label">📐 No External Ontology</div>
                <p>This system uses a <strong>manually curated seed vocabulary</strong> of ~30 concepts 
                organized into 6 domains. There is no formal ontology, no linked data, 
                no embedding-based similarity. All structure comes from keyword matching and 
                co-occurrence statistics.</p>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">Concept Domains</div>
                <div className="methodology-domain-grid">
                  {[
                    { domain: 'infra', color: '#60a5fa', examples: 'knowledge graph, blockchain, token, network' },
                    { domain: 'narrative', color: '#f472b6', examples: 'storyliving, lore, canon, myth' },
                    { domain: 'governance', color: '#f59e0b', examples: 'DAO, coordination, sovereignty' },
                    { domain: 'social', color: '#34d399', examples: 'community, identity, trust, culture' },
                    { domain: 'hybrid', color: '#22d3ee', examples: 'agent, AI, memory, emergence' },
                    { domain: 'symbolic', color: '#a78bfa', examples: 'archetype, ontology, consciousness, ritual' },
                    { domain: 'discovered', color: '#94a3b8', examples: 'Promoted from frequency analysis' },
                  ].map(d => (
                    <div key={d.domain} className="methodology-domain-item">
                      <div className="methodology-domain-header">
                        <span className="methodology-domain-dot" style={{ background: d.color }} />
                        <span className="methodology-domain-name">{d.domain}</span>
                      </div>
                      <div className="methodology-domain-examples">{d.examples}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="methodology-section">
                <div className="methodology-section-title">Discovery Criteria</div>
                <p className="methodology-desc">
                  Non-seed concepts are promoted to the ontology when they meet all thresholds:
                </p>
                <ul className="methodology-criteria">
                  <li>≥ 15 mentions across the corpus</li>
                  <li>≥ 4 unique authors</li>
                  <li>≥ 4 weekly periods of activity</li>
                  <li>≥ 50% contextual diversity (not repeated in identical phrases)</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
