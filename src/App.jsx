/**
 * App.jsx — Pass 2
 * Enhanced with focus state, highlight modes
 */
import React, { useState, useCallback, useMemo } from 'react';
import { useDataLoader } from './hooks/useDataLoader';
import IsometricScene from './components/IsometricScene';
import InsightPanel from './components/InsightPanel';
import ControlBar from './components/ControlBar';
import TimelineScrubber from './components/TimelineScrubber';

export default function App() {
  const { data, loading, error, lookups } = useDataLoader();

  const [selectedNode, setSelectedNode] = useState(null);
  const [timeIndex, setTimeIndex] = useState(null);
  const [focusedConcept, setFocusedConcept] = useState(null);
  const [focusedActor, setFocusedActor] = useState(null);
  const [filters, setFilters] = useState({
    showConcepts: true,
    showActors: true,
    actorKind: 'all',
    highlightGrounded: false,
    highlightCaution: false,
    showGlyphs: false,
  });

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Time range from timeline index
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
        />

        <ControlBar
          filters={filters}
          onFilterChange={handleFilterChange}
          conceptList={data.concepts}
          focusedConcept={focusedConcept}
          onFocusConcept={setFocusedConcept}
          focusedActor={focusedActor}
          onFocusActor={setFocusedActor}
        />

        <InsightPanel
          selectedNode={selectedNode}
          lookups={lookups}
          onClose={handleClosePanel}
          onSelectNode={handleSelectNode}
          onFocusConcept={setFocusedConcept}
          onFocusActor={setFocusedActor}
          data={data}
        />

        <TimelineScrubber
          timeline={data.timeline}
          timeIndex={timeIndex !== null ? timeIndex : data.timeline.length - 1}
          onTimeChange={setTimeIndex}
        />
      </div>
    </div>
  );
}
