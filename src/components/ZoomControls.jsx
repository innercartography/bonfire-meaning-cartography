/**
 * ZoomControls.jsx
 *
 * Persistent camera HUD — three zoom level buttons + era selectors.
 * Lives at bottom-right, above the timeline.
 */
import React from 'react';
import { ZOOM_LEVELS } from '../hooks/useCameraController';

const ERA_LABELS = {
  early:  { label: 'Genesis',     color: '#34d399' },
  middle: { label: 'Growth',      color: '#60a5fa' },
  late:   { label: 'Convergence', color: '#a78bfa' },
};

export default function ZoomControls({
  zoomLevel, activeEra,
  onOverview, onZoomEra, onZoomCluster,
  selectedCluster,
  panelOpen,
}) {
  return (
    <div className="zoom-controls" data-panel-open={panelOpen ? 'true' : 'false'}>

      {/* ── Zoom level row ─────────────────── */}
      <div className="zoom-level-row">
        <button
          className={`zoom-btn ${zoomLevel === ZOOM_LEVELS.OVERVIEW ? 'active' : ''}`}
          onClick={onOverview}
          title="Birds-eye view of the full map (Z)"
        >
          <span className="zoom-btn-icon">⊞</span>
          <span className="zoom-btn-label">Map</span>
        </button>

        {/* Era sub-buttons — visible always */}
        {Object.entries(ERA_LABELS).map(([era, cfg]) => (
          <button
            key={era}
            className={`zoom-btn era ${zoomLevel === ZOOM_LEVELS.ERA && activeEra === era ? 'active' : ''}`}
            onClick={() => onZoomEra(era)}
            title={`Focus on ${cfg.label} era (1/2/3)`}
            style={{ '--era-color': cfg.color }}
          >
            <span className="zoom-btn-dot" style={{ background: cfg.color }} />
            <span className="zoom-btn-label">{cfg.label}</span>
          </button>
        ))}

        {/* Cluster zoom — only when a cluster is selected */}
        {selectedCluster && (
          <button
            className={`zoom-btn cluster ${zoomLevel === ZOOM_LEVELS.CLUSTER ? 'active' : ''}`}
            onClick={() => onZoomCluster(selectedCluster.position, selectedCluster.id)}
            title="Zoom into selected cluster"
          >
            <span className="zoom-btn-icon">◎</span>
            <span className="zoom-btn-label">Cluster</span>
          </button>
        )}
      </div>

      {/* ── Nav hint ──────────────────────── */}
      <div className="zoom-nav-hint">
        Arrow keys or drag to pan · Scroll to zoom
      </div>
    </div>
  );
}
