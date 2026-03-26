/**
 * ControlBar.jsx — Pass 3.5
 * Enhanced with thread navigator toggle, methodology info button
 */
import React from 'react';

export default function ControlBar({
  filters, onFilterChange, conceptList,
  focusedConcept, onFocusConcept, focusedActor, onFocusActor,
  showThread, onToggleThread, onToggleMethodology,
}) {
  return (
    <div className="control-bar">
      <div className="control-bar-title">Meaning Cartography</div>

      <div className="control-group">
        <button
          className={`control-btn ${filters.showConcepts ? 'active' : ''}`}
          onClick={() => onFilterChange('showConcepts', !filters.showConcepts)}
        >
          <span className="dot" style={{ background: '#60a5fa' }} /> Concepts
        </button>
        <button
          className={`control-btn ${filters.showActors ? 'active' : ''}`}
          onClick={() => onFilterChange('showActors', !filters.showActors)}
        >
          <span className="dot" style={{ background: '#f472b6' }} /> Actors
        </button>
      </div>

      <div className="control-group">
        <select
          className="control-select"
          value={filters.actorKind}
          onChange={(e) => onFilterChange('actorKind', e.target.value)}
        >
          <option value="all">All Actors</option>
          <option value="human">Humans Only</option>
          <option value="bot">Bots Only</option>
        </select>
      </div>

      <div className="control-group">
        <button
          className={`control-btn ${filters.highlightGrounded ? 'active grounded-btn' : ''}`}
          onClick={() => onFilterChange('highlightGrounded', !filters.highlightGrounded)}
        >
          ⚓ Grounded
        </button>
        <button
          className={`control-btn ${filters.highlightCaution ? 'active caution-btn' : ''}`}
          onClick={() => onFilterChange('highlightCaution', !filters.highlightCaution)}
        >
          ⚠ Caution
        </button>
        <button
          className={`control-btn ${filters.showGlyphs ? 'active glyph-btn' : ''}`}
          onClick={() => onFilterChange('showGlyphs', !filters.showGlyphs)}
        >
          ◈ Glyphs
        </button>
        <button
          className={`control-btn ${filters.showHarmonics ? 'active harmonic-btn' : ''}`}
          onClick={() => onFilterChange('showHarmonics', !filters.showHarmonics)}
        >
          ∿ Harmonics
        </button>
      </div>

      <div className="control-group">
        <button
          className={`control-btn ${showThread ? 'active thread-btn' : ''}`}
          onClick={onToggleThread}
          title="Open thread navigator — view conversation alongside spatial graph"
        >
          ≡ Thread
        </button>
        <button
          className="control-btn methodology-btn"
          onClick={onToggleMethodology}
          title="How this works — methodology transparency"
        >
          ? Method
        </button>
      </div>

      <div className="control-group">
        <select
          className="control-select"
          value={focusedConcept || ''}
          onChange={(e) => onFocusConcept(e.target.value || null)}
        >
          <option value="">Trace Concept…</option>
          {conceptList
            .filter(c => c.mention_count > 20)
            .map(c => (
              <option key={c.id} value={c.id}>{c.label} ({c.mention_count})</option>
            ))
          }
        </select>
      </div>

      {(focusedConcept || focusedActor) && (
        <div className="control-group">
          <button
            className="control-btn active"
            onClick={() => { onFocusConcept(null); onFocusActor(null); }}
          >
            ✕ Clear Focus
          </button>
        </div>
      )}
    </div>
  );
}
