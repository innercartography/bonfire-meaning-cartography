/**
 * PhilosophyOverlay.jsx
 * 
 * Persistent spatial intelligence positioning overlay.
 * Frames the visualization in the context of the broader
 * spatial intelligence thesis — connecting Bonfires to the
 * idea that linear text compressed into navigable topology
 * enables a different kind of comprehension.
 */
import React, { useState, useEffect } from 'react';

const PHILOSOPHY_LINES = [
  {
    phase: 'core',
    text: 'This is a spatial reasoning interface. Linear conversation compressed into navigable topology.',
  },
  {
    phase: 'clusters',
    text: 'Clusters are not categories — they\'re neighborhoods where ideas lived together.',
  },
  {
    phase: 'pillars',
    text: 'Concept pillars rise from grounded foundations. Height reveals abstraction. Width reveals adoption.',
  },
  {
    phase: 'actors',
    text: 'Actor beacons mark presence, not judgment. Pattern recognition without reputation scoring.',
  },
  {
    phase: 'harmonics',
    text: 'Harmonic arcs trace what the graph doesn\'t say explicitly — the latent resonance between unconnected ideas.',
  },
  {
    phase: 'spatial',
    text: 'Left to right is time. Low to high is abstraction. What you see is how meaning moved through conversation.',
  },
];

export default function PhilosophyOverlay({ sourceManifest }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Cycle through philosophy lines
  useEffect(() => {
    if (isExpanded) return;
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % PHILOSOPHY_LINES.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [isExpanded]);

  if (!isVisible) return null;

  const activeLine = PHILOSOPHY_LINES[activeIndex];

  return (
    <div className={`philosophy-overlay ${isExpanded ? 'expanded' : ''}`}>
      {!isExpanded ? (
        <div className="philosophy-ticker" onClick={() => setIsExpanded(true)}>
          <span className="philosophy-sigil">◈</span>
          <span className="philosophy-text">{activeLine.text}</span>
          <div className="philosophy-dots">
            {PHILOSOPHY_LINES.map((_, i) => (
              <span 
                key={i} 
                className={`philosophy-dot ${i === activeIndex ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="philosophy-panel">
          <div className="philosophy-panel-header">
            <div>
              <div className="philosophy-panel-title">Spatial Intelligence</div>
              <div className="philosophy-panel-subtitle">Design Philosophy</div>
            </div>
            <div className="philosophy-panel-actions">
              <button 
                className="philosophy-minimize" 
                onClick={() => setIsExpanded(false)}
                title="Minimize"
              >—</button>
              <button 
                className="philosophy-dismiss" 
                onClick={() => setIsVisible(false)}
                title="Dismiss"
              >×</button>
            </div>
          </div>

          <div className="philosophy-panel-body">
            {PHILOSOPHY_LINES.map((line, i) => (
              <div key={i} className="philosophy-line">
                <span className="philosophy-line-phase">{line.phase}</span>
                <span className="philosophy-line-text">{line.text}</span>
              </div>
            ))}

            <div className="philosophy-divider" />

            <div className="philosophy-thesis">
              <div className="philosophy-thesis-label">Core Thesis</div>
              <p>
                The endless linear stream of conversation is easier to comprehend spatially. 
                This interface transforms sequential text into a navigable landscape 
                where temporal flow, conceptual density, and actor presence 
                become visible dimensions rather than hidden metadata.
              </p>
            </div>

            <div className="philosophy-methods">
              <div className="philosophy-methods-label">What This Is Not</div>
              <ul>
                <li>Not a scoring system — no participants are ranked</li>
                <li>Not semantic analysis — all signals are regex heuristics</li>
                <li>Not an AI interpretation — everything is deterministic</li>
                <li>Not a reputation engine — patterns, not people</li>
              </ul>
            </div>

            {sourceManifest && (
              <div className="philosophy-source">
                <div className="philosophy-source-label">Data Source</div>
                <div className="philosophy-source-detail">
                  <span>{sourceManifest.source?.type?.replace(/_/g, ' ')}</span>
                  <span>{sourceManifest.source?.total_messages?.toLocaleString()} messages</span>
                  <span>{sourceManifest.source?.unique_authors} authors</span>
                  {sourceManifest.source?.date_range && (
                    <span>
                      {sourceManifest.source.date_range[0]?.slice(0,10)} → {sourceManifest.source.date_range[1]?.slice(0,10)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
