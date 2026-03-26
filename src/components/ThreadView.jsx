/**
 * ThreadView.jsx
 * 
 * Split-view thread navigator that shows the original conversation
 * in linear order with spatial context badges.
 * 
 * Addresses the core thesis: "the endless linear stream of what 
 * would be easier to comprehend spatially" — by showing BOTH 
 * simultaneously.
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';

const GLYPH_MAP = {
  seed: '✨', reference: '🧭', amplify: '🔥', reframe: '🔁', challenge: '⚡',
  analytical: '🧠', generative: '🌱', reflective: '🪞', philosophical: '🌀', performative: '🎭',
};

function ThreadMessage({ msg, tag, cluster, isHighlighted, onClick }) {
  const hasTag = tag && tag.glyphs?.length > 0;
  
  return (
    <div
      className={`thread-message ${isHighlighted ? 'highlighted' : ''}`}
      onClick={() => onClick(msg)}
    >
      <div className="thread-message-header">
        <span className="thread-author">{msg.author}</span>
        <div className="thread-meta-right">
          {hasTag && (
            <span className="thread-glyph" title={tag.reason}>
              {tag.glyphs.join('')}
            </span>
          )}
          {cluster && (
            <span className="thread-cluster-badge" title={cluster.label}>
              {cluster.symbol}
            </span>
          )}
        </div>
      </div>
      <div className="thread-message-body">{msg.text}</div>
      <div className="thread-message-footer">
        <span className="thread-timestamp">
          {msg.timestamp ? new Date(msg.timestamp).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          }) : '—'}
        </span>
        <span className={`thread-era-badge ${msg.era || 'unknown'}`}>
          {msg.era === 'early' ? 'Genesis' : msg.era === 'middle' ? 'Growth' : msg.era === 'late' ? 'Convergence' : '—'}
        </span>
        {msg.groundedness_score > 0.2 && (
          <span className="thread-signal grounded">⚓ {(msg.groundedness_score * 100).toFixed(0)}%</span>
        )}
        {msg.abstraction_score > 0.2 && (
          <span className="thread-signal abstract">◈ {(msg.abstraction_score * 100).toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

export default function ThreadView({ 
  contextNode, lookups, data, onSelectNode, onClose 
}) {
  const [threadFilter, setThreadFilter] = useState('context'); // 'context' | 'cluster' | 'actor' | 'all'
  const [searchText, setSearchText] = useState('');
  const scrollRef = useRef(null);
  const highlightRef = useRef(null);

  // Determine which messages to show based on context
  const threadMessages = useMemo(() => {
    if (!data?.messages) return [];
    
    let messageIds = new Set();
    
    if (threadFilter === 'all') {
      return data.messages
        .filter(m => m.text && m.text.length > 0)
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
        .slice(0, 200);
    }
    
    if (contextNode) {
      switch (contextNode.type) {
        case 'cluster': {
          const cluster = contextNode.data;
          messageIds = new Set(cluster.artifact_ids || []);
          break;
        }
        case 'concept': {
          const concept = contextNode.data;
          messageIds = new Set(concept.artifact_ids || []);
          break;
        }
        case 'actor': {
          const actor = contextNode.data;
          messageIds = new Set(actor.message_ids || []);
          break;
        }
        case 'artifact': {
          // Show surrounding context — 10 messages before and after
          const msg = contextNode.data;
          const allSorted = data.messages
            .filter(m => m.timestamp)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          const idx = allSorted.findIndex(m => m.canonical_id === msg.canonical_id);
          if (idx >= 0) {
            const start = Math.max(0, idx - 10);
            const end = Math.min(allSorted.length, idx + 11);
            return allSorted.slice(start, end);
          }
          messageIds = new Set([msg.canonical_id]);
          break;
        }
        default:
          break;
      }
    }
    
    if (messageIds.size === 0) {
      // No context — show recent messages
      return data.messages
        .filter(m => m.text && m.text.length > 0)
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
        .slice(-50);
    }
    
    return data.messages
      .filter(m => messageIds.has(m.canonical_id))
      .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
  }, [data, contextNode, threadFilter]);

  // Apply text search
  const filteredMessages = useMemo(() => {
    if (!searchText.trim()) return threadMessages;
    const q = searchText.toLowerCase();
    return threadMessages.filter(m => 
      m.text.toLowerCase().includes(q) || 
      m.author.toLowerCase().includes(q)
    );
  }, [threadMessages, searchText]);

  // Scroll to highlighted message on context change
  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contextNode]);

  const handleMessageClick = useCallback((msg) => {
    onSelectNode({ type: 'artifact', id: msg.canonical_id, data: msg });
  }, [onSelectNode]);

  const contextLabel = useMemo(() => {
    if (!contextNode) return 'All Messages';
    switch (contextNode.type) {
      case 'cluster': return `📍 ${contextNode.data.label}`;
      case 'concept': return `💡 ${contextNode.data.label}`;
      case 'actor': return `👤 ${contextNode.data.display_name}`;
      case 'artifact': return `💬 Context around message`;
      default: return 'Thread';
    }
  }, [contextNode]);

  return (
    <div className="thread-view">
      <div className="thread-header">
        <div className="thread-header-top">
          <span className="thread-title">Thread Navigator</span>
          <button className="thread-close" onClick={onClose}>×</button>
        </div>
        <div className="thread-context-label">{contextLabel}</div>
        <div className="thread-controls">
          <input
            className="thread-search"
            type="text"
            placeholder="Search thread…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <div className="thread-filter-row">
            <button
              className={`thread-filter-btn ${threadFilter === 'context' ? 'active' : ''}`}
              onClick={() => setThreadFilter('context')}
            >Context</button>
            <button
              className={`thread-filter-btn ${threadFilter === 'all' ? 'active' : ''}`}
              onClick={() => setThreadFilter('all')}
            >All (200)</button>
          </div>
        </div>
        <div className="thread-count">{filteredMessages.length} messages</div>
      </div>
      
      <div className="thread-body" ref={scrollRef}>
        {filteredMessages.length === 0 ? (
          <div className="thread-empty">
            <div className="thread-empty-icon">◈</div>
            <div className="thread-empty-text">
              Select a cluster, concept, or actor to view its conversation thread.
            </div>
          </div>
        ) : (
          filteredMessages.map((msg, i) => {
            const tag = lookups?.tagsByMsgId?.get(msg.canonical_id);
            const clusterId = lookups?.msgToCluster?.get(msg.canonical_id);
            const cluster = clusterId ? lookups.clusterById.get(clusterId) : null;
            const isHighlighted = contextNode?.type === 'artifact' && 
              contextNode?.id === msg.canonical_id;
            
            return (
              <div
                key={msg.canonical_id}
                ref={isHighlighted ? highlightRef : null}
              >
                {/* Date separator */}
                {i === 0 || (msg.timestamp && filteredMessages[i-1]?.timestamp && 
                  msg.timestamp.slice(0,10) !== filteredMessages[i-1].timestamp.slice(0,10)) ? (
                  <div className="thread-date-separator">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    }) : '—'}
                  </div>
                ) : null}
                <ThreadMessage
                  msg={msg}
                  tag={tag}
                  cluster={cluster}
                  isHighlighted={isHighlighted}
                  onClick={handleMessageClick}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
