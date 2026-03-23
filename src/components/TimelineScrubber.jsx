/**
 * TimelineScrubber.jsx — Pass 2
 * Enhanced with era markers and richer info display
 */
import React from 'react';

export default function TimelineScrubber({ timeline, timeIndex, onTimeChange }) {
  if (!timeline || !timeline.length) return null;

  const maxMsgCount = Math.max(...timeline.map(t => t.message_count));
  const currentState = timeline[timeIndex] || timeline[0];

  // Find era boundaries in the timeline
  const earlyEnd = timeline.findIndex(t => t.era === 'middle');
  const midEnd = timeline.findIndex(t => t.era === 'late');

  const eraColors = { early: '#34d399', middle: '#60a5fa', late: '#a78bfa' };

  return (
    <div className="timeline-bar">
      <div className="timeline-label">
        {timeline[0]?.week || '—'}
      </div>

      <div className="timeline-slider-container">
        {/* Era background zones */}
        <div className="timeline-eras">
          {earlyEnd > 0 && (
            <div
              className="timeline-era-zone"
              style={{
                left: 0,
                width: `${(earlyEnd / timeline.length) * 100}%`,
                background: `linear-gradient(to right, ${eraColors.early}15, transparent)`,
              }}
            >
              <span className="timeline-era-label">Genesis</span>
            </div>
          )}
          {midEnd > earlyEnd && (
            <div
              className="timeline-era-zone"
              style={{
                left: `${(earlyEnd / timeline.length) * 100}%`,
                width: `${((midEnd - earlyEnd) / timeline.length) * 100}%`,
                background: `linear-gradient(to right, ${eraColors.middle}15, transparent)`,
              }}
            >
              <span className="timeline-era-label">Growth</span>
            </div>
          )}
          <div
            className="timeline-era-zone"
            style={{
              left: `${(midEnd / timeline.length) * 100}%`,
              width: `${((timeline.length - midEnd) / timeline.length) * 100}%`,
              background: `linear-gradient(to right, ${eraColors.late}15, transparent)`,
            }}
          >
            <span className="timeline-era-label">Convergence</span>
          </div>
        </div>

        {/* Density bars */}
        <div className="timeline-density">
          {timeline.map((t, i) => {
            const barColor = eraColors[t.era] || '#2dd4bf';
            return (
              <div
                key={t.week}
                className="timeline-density-bar"
                style={{
                  height: `${(t.message_count / maxMsgCount) * 100}%`,
                  opacity: i <= timeIndex ? 0.7 : 0.15,
                  background: i <= timeIndex ? barColor : '#1a2236',
                }}
              />
            );
          })}
        </div>

        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={timeline.length - 1}
          value={timeIndex}
          onChange={(e) => onTimeChange(parseInt(e.target.value))}
        />
      </div>

      <div className="timeline-label" style={{ textAlign: 'right' }}>
        {timeline[timeline.length - 1]?.week || '—'}
      </div>

      <div className="timeline-info">
        <div className="timeline-info-primary">{currentState.week}</div>
        <div className="timeline-info-secondary">
          {currentState.message_count} msgs · {currentState.active_authors} authors
        </div>
        <div className="timeline-info-secondary">
          G {(currentState.avg_groundedness * 100).toFixed(0)}% · A {(currentState.avg_abstraction * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
