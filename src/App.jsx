/**
 * App.jsx — Pass 4
 * Navigation & UX pass:
 * - Three zoom levels (Overview / Era / Cluster)
 * - Arrow key + WASD pan
 * - InsightPanel tucks away when nothing selected
 * - ZoomControls HUD
 * - Touch-friendly OrbitControls
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useDataLoader } from './hooks/useDataLoader';
import { useCameraController } from './hooks/useCameraController';
import IsometricScene from './components/IsometricScene';
import InsightPanel from './components/InsightPanel';
import ControlBar from './components/ControlBar';
import TimelineScrubber from './components/TimelineScrubber';
import ThreadView from './components/ThreadView';
import MethodologyInfo from './components/MethodologyInfo';
import PhilosophyOverlay from './components/PhilosophyOverlay';
import ZoomControls from './components/ZoomControls';

export default function App() {
  const { data, loading, error, lookups } = useDataLoader();

  const [selectedNode, setSelectedNode] = useState(null);
  const [timeIndex, setTimeIndex] = useState(null);
  const [focusedConcept, setFocusedConcept] = useState(null);
  const [focusedActor, setFocusedActor] = useState(null);
  const [showThread, setShowThread] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(true);

  const [filters, setFilters] = useState({
    showConcepts: true,
    showActors: true,
    actorKind: 'all',
    highlightGrounded: false,
    highlightCaution: false,
    showGlyphs: false,
    showHarmonics: false,
  });

  // ── Camera controller ─────────────────────────────────────
  const {
    controlsRef, cameraRef,
    zoomLevel, activeEra, activeClusterId,
    zoomToOverview, zoomToEra, zoomToCluster,
  } = useCameraController();

  // Keyboard shortcuts dispatched from inside the Canvas
  const handleZoomKey = useCallback((cmd) => {
    if (cmd === 'overview') { zoomToOverview(); return; }
    if (cmd === 'era-early')  { zoomToEra('early');  return; }
    if (cmd === 'era-middle') { zoomToEra('middle'); return; }
    if (cmd === 'era-late')   { zoomToEra('late');   return; }
  }, [zoomToOverview, zoomToEra]);

  // ── Node selection ────────────────────────────────────────
  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
    setPanelCollapsed(false); // always expand when a node is selected
    // If a cluster is selected, auto-zoom into it
    if (node?.type === 'cluster' && node.data?.position) {
      zoomToCluster(node.data.position, node.data.id);
    }
  }, [zoomToCluster]);

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
    setPanelCollapsed(true);
  }, []);

  const handleExpandPanel = useCallback(() => {
    setPanelCollapsed(false);
  }, []);

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleToggleThread = useCallback(() => {
    setShowThread(prev => !prev);
  }, []);

  const handleToggleMethodology = useCallback(() => {
    setShowMethodology(prev => !prev);
  }, []);

  // ── Time range from timeline index ────────────────────────
  const timeRange = useMemo(() => {
    if (timeIndex === null || !data?.timeline) return null;
    const tl = data.timeline;
    if (timeIndex >= tl.length) return null;
    const week = tl[timeIndex].week;
    const [year, wNum] = week.split('-W').map(Number);
    const start = new Date(year, 0, 1);
    const end = new Date(start.getTime() + (wNum + 1) * 7 * 24 * 60 * 60 * 1000);
    return ['2000-01-01T00:00:00', end.toISOString()];
  }, [timeIndex, data]);

  // Currently selected cluster (for ZoomControls)
  const selectedCluster = useMemo(() => {
    if (selectedNode?.type !== 'cluster') return null;
    return selectedNode.data;
  }, [selectedNode]);

  if (loading) {
    return (
      <div className="loading-screen">
        <h1>Meaning Cartography</h1>
        <div className="loading-subtitle">Mapping discourse topology…</div>
        <div className="loading-bar"><div className="loading-bar-fill" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <h1>Error</h1>
        <p style={{ color: '#f472b6' }}>{error}</p>
      </div>
    );
  }

  if (!data || !lookups) return null;

  return (
    <div className="app">
      <div className="app-main">
        <IsometricScene
          data={data}
          lookups={lookups}
          filters={filters}
          timeRange={timeRange}
          selectedNode={selectedNode}
          onSelectNode={handleSelectNode}
          focusedConcept={focusedConcept}
          focusedActor={focusedActor}
          harmonics={data.harmonics}
          controlsRef={controlsRef}
          cameraRef={cameraRef}
          onZoomKey={handleZoomKey}
        />

        <ControlBar
          filters={filters}
          onFilterChange={handleFilterChange}
          conceptList={data.concepts}
          focusedConcept={focusedConcept}
          onFocusConcept={setFocusedConcept}
          focusedActor={focusedActor}
          onFocusActor={setFocusedActor}
          showThread={showThread}
          onToggleThread={handleToggleThread}
          onToggleMethodology={handleToggleMethodology}
        />

        {/* InsightPanel: tuck away when collapsed (no node selected) */}
        <div className={`insight-panel-wrapper ${panelCollapsed ? 'tucked' : ''}`}>
          <InsightPanel
            selectedNode={selectedNode}
            lookups={lookups}
            onClose={handleClosePanel}
            onSelectNode={handleSelectNode}
            onFocusConcept={setFocusedConcept}
            onFocusActor={setFocusedActor}
            data={data}
          />
          {panelCollapsed && (
            <button className="panel-expand-btn" onClick={handleExpandPanel} title="Open insight panel">
              ◈
            </button>
          )}
        </div>

        {showThread && (
          <ThreadView
            contextNode={selectedNode}
            lookups={lookups}
            data={data}
            onSelectNode={handleSelectNode}
            onClose={handleToggleThread}
          />
        )}

        <TimelineScrubber
          timeline={data.timeline}
          timeIndex={timeIndex !== null ? timeIndex : data.timeline.length - 1}
          onTimeChange={setTimeIndex}
        />

        <ZoomControls
          zoomLevel={zoomLevel}
          activeEra={activeEra}
          onOverview={zoomToOverview}
          onZoomEra={zoomToEra}
          onZoomCluster={zoomToCluster}
          selectedCluster={selectedCluster}
          panelOpen={!panelCollapsed}
        />

        <PhilosophyOverlay sourceManifest={data.sourceManifest} />

        <MethodologyInfo
          isOpen={showMethodology}
          onClose={handleToggleMethodology}
        />
      </div>
    </div>
  );
}
