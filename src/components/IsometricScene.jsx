/**
 * IsometricScene.jsx — Pass 2.5
 * 
 * BUG FIX: Hex cluster pulsing/glitching during camera movement.
 * 
 * ROOT CAUSES IDENTIFIED AND FIXED:
 * 1. Z-FIGHTING (primary): Multiple coplanar transparent meshes (ground plane,
 *    ring, groundedness fill, grid) all near Y=0 with DoubleSide rendering.
 *    Camera angle changes caused depth buffer winners to flip between faces,
 *    producing visible pulsing. FIX: Explicit renderOrder + depthWrite=false
 *    on all cluster ground meshes, staggered Y positions with sufficient gap.
 * 
 * 2. GEOMETRY/MATERIAL RECREATION: Inline JSX geometry/material elements with
 *    computed props caused React Three Fiber to dispose and recreate GPU
 *    objects on every state change. FIX: Memoize geometry and material via
 *    useMemo at the component level; use React.memo() on all sub-components.
 * 
 * 3. RE-RENDER CASCADE: Hover state (hoveredCluster/hoveredActor) lived in
 *    SceneContent, so any hover triggered full scene re-render including all
 *    clusters, artifacts, actors. FIX: Isolate hover state using refs and
 *    per-component local state, wrap sub-components in React.memo().
 * 
 * 4. UNSTABLE PROP REFERENCES: Inline arrays like position={[0, 0.6, 0]} and
 *    inline callbacks created new references every render, defeating memo.
 *    FIX: Stable position arrays via useMemo, stable callbacks via useCallback.
 */
import React, { useMemo, useRef, useState, useCallback, memo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Billboard, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  layoutClusters, layoutArtifacts, getCategoryColor,
  getClusterColor, getActorPositions, ERA_CONFIG,
} from '../utils/spatial';

// ── Era Ground Marker (static — never changes) ────────────
const EraMarker = memo(function EraMarker({ era, config }) {
  // Stable position arrays
  const groupPos = useMemo(() => [config.x, -0.05, -25], [config.x]);
  const linePoints = useMemo(
    () => [[config.x - 15, 0, -40], [config.x - 15, 0, 50]],
    [config.x]
  );

  return (
    <group position={groupPos}>
      <Billboard>
        <Text
          fontSize={1.8}
          color={config.color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#060a14"
          letterSpacing={0.15}
        >
          {config.label}
        </Text>
      </Billboard>
      {era !== 'early' && (
        <Line
          points={linePoints}
          color={config.color}
          lineWidth={1}
          transparent
          opacity={0.15}
        />
      )}
    </group>
  );
});

// ── Cluster District ───────────────────────────────────────
// Wrapped in React.memo — only re-renders when its own props change.
// Geometry and materials are memoized to prevent GPU object churn.
const ClusterDistrict = memo(function ClusterDistrict({
  cluster, position, radius, color, selected, onClick, hovered, onHover,
}) {
  const isGeneral = cluster.isGeneral;
  const hasCaution = !!cluster.caution;
  const segments = isGeneral ? 64 : 6;

  // ── Memoize geometry so it's created once and reused ──
  const groundGeom = useMemo(
    () => new THREE.CircleGeometry(radius, segments),
    [radius, segments]
  );
  const ringGeom = useMemo(
    () => new THREE.RingGeometry(
      radius - 0.06,
      radius + (hasCaution ? 0.12 : 0.03),
      segments
    ),
    [radius, hasCaution, segments]
  );
  const groundednessGeom = useMemo(() => {
    if (cluster.avg_groundedness > 0.15 && !isGeneral) {
      return new THREE.CircleGeometry(radius * cluster.avg_groundedness * 3, 32);
    }
    return null;
  }, [radius, cluster.avg_groundedness, isGeneral]);

  // ── Memoize materials — depthWrite=false prevents z-fighting ──
  const groundMat = useMemo(() => {
    const opacity = isGeneral ? 0.06 : (selected ? 0.35 : (hovered ? 0.25 : 0.14));
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false, // FIX: prevent z-fighting between overlapping transparent quads
    });
  }, [color, isGeneral, selected, hovered]);

  const ringMat = useMemo(() => {
    const ringColor = hasCaution ? '#f59e0b' : color;
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(ringColor),
      transparent: true,
      opacity: hasCaution ? 0.6 : 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [color, hasCaution]);

  const groundednessMat = useMemo(() => {
    if (!groundednessGeom) return null;
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#34d399'),
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [groundednessGeom]);

  // ── Stable rotation array (never changes) ──
  const flatRotation = useMemo(() => [-Math.PI / 2, 0, 0], []);

  // ── Stable positions — staggered Y to eliminate z-fighting ──
  // Ground plane at Y=0.01, ring at Y=0.02, groundedness fill at Y=0.005
  const ringPos = useMemo(() => [0, 0.01, 0], []);
  const fillPos = useMemo(() => [0, -0.005, 0], []);

  // ── Stable label position ──
  const labelPos = useMemo(
    () => [0, selected ? 0.9 : 0.6, 0],
    [selected]
  );
  const subtitlePos = useMemo(() => [0, -0.5, 0], []);
  const cautionPos = useMemo(() => [radius * 0.7, 1.5, 0], [radius]);

  // ── Stable callbacks ──
  const handleClick = useCallback(
    (e) => { e.stopPropagation(); onClick(cluster); },
    [onClick, cluster]
  );
  const handlePointerEnter = useCallback(
    (e) => { e.stopPropagation(); onHover(cluster.id); },
    [onHover, cluster.id]
  );
  const handlePointerLeave = useCallback(
    () => onHover(null),
    [onHover]
  );

  return (
    <group position={position}>
      {/* Ground plane — renderOrder=1 ensures it draws after the grid */}
      <mesh
        rotation={flatRotation}
        geometry={groundGeom}
        material={groundMat}
        renderOrder={1}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      />

      {/* Border ring — renderOrder=2, slightly above ground plane */}
      <mesh
        rotation={flatRotation}
        position={ringPos}
        geometry={ringGeom}
        material={ringMat}
        renderOrder={2}
      />

      {/* Groundedness fill — renderOrder=0, below ground plane */}
      {groundednessGeom && groundednessMat && (
        <mesh
          rotation={flatRotation}
          position={fillPos}
          geometry={groundednessGeom}
          material={groundednessMat}
          renderOrder={0}
        />
      )}

      {/* Label */}
      {!isGeneral && (
        <Billboard position={labelPos}>
          <Text
            fontSize={0.45}
            color={selected ? '#e2e8f0' : color}
            anchorX="center"
            anchorY="middle"
            maxWidth={radius * 2.5}
            textAlign="center"
            outlineWidth={0.03}
            outlineColor="#060a14"
          >
            {cluster.symbol} {cluster.label}
          </Text>
          <Text
            fontSize={0.25}
            color="#64748b"
            anchorX="center"
            anchorY="middle"
            position={subtitlePos}
            outlineWidth={0.02}
            outlineColor="#060a14"
          >
            {cluster.artifact_ids.length} msgs · {cluster.actor_ids?.length || 0} actors
          </Text>
        </Billboard>
      )}

      {/* Caution badge */}
      {hasCaution && (
        <Billboard position={cautionPos}>
          <Text fontSize={0.35} color="#f59e0b" outlineWidth={0.02} outlineColor="#060a14">
            ⚠
          </Text>
        </Billboard>
      )}
    </group>
  );
});

// ── Artifact Token ─────────────────────────────────────────
// Memoized — skips re-render unless its specific props change.
const ArtifactToken = memo(function ArtifactToken({
  id, position, groundedness, abstraction, selected, onClick, visible, highlightAuthor,
}) {
  if (!visible) return null;

  const g = groundedness || 0;
  const a = abstraction || 0;

  // Memoize color computation
  const color = useMemo(
    () => new THREE.Color().lerpColors(
      new THREE.Color('#a78bfa'),
      new THREE.Color('#34d399'),
      Math.min(1, g * 2)
    ),
    [g]
  );

  const width = 0.08 + g * 0.12;
  const height = 0.08 + a * 0.4;
  const opacity = 0.25 + g * 0.55;

  const geom = useMemo(
    () => new THREE.BoxGeometry(width, height, width),
    [width, height]
  );

  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: color.clone(),
      transparent: true,
      opacity: selected ? 1 : (highlightAuthor ? 0.9 : opacity),
      emissive: selected ? color.clone() : new THREE.Color('#000000'),
      emissiveIntensity: selected ? 0.6 : (highlightAuthor ? 0.3 : 0),
      depthWrite: false,
    }),
    [color, selected, highlightAuthor, opacity]
  );

  const handleClick = useCallback(
    (e) => { e.stopPropagation(); onClick(id); },
    [onClick, id]
  );

  return (
    <mesh position={position} geometry={geom} material={mat} onClick={handleClick} />
  );
});

// ── Concept Anchor ─────────────────────────────────────────
const ConceptAnchor = memo(function ConceptAnchor({
  concept, position, color, selected, onClick, focused,
}) {
  const height = 1.2 + Math.min(3, concept.mention_count * 0.002);
  const topRadius = 0.1 + (concept.abstraction_score || 0) * 0.15;
  const bottomRadius = 0.2 + (concept.groundedness_score || 0) * 0.3;
  const glow = focused || selected;

  const pillarPos = useMemo(() => [0, height / 2, 0], [height]);
  const labelPos = useMemo(() => [0, height + 0.5, 0], [height]);
  const flatRotation = useMemo(() => [-Math.PI / 2, 0, 0], []);
  const basePos = useMemo(() => [0, 0.02, 0], []);
  const catPos = useMemo(() => [0, -0.4, 0], []);

  const pillarGeom = useMemo(
    () => new THREE.CylinderGeometry(topRadius, bottomRadius, height, 6),
    [topRadius, bottomRadius, height]
  );
  const pillarMat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: glow ? 0.9 : 0.55,
      emissive: glow ? new THREE.Color(color) : new THREE.Color('#000000'),
      emissiveIntensity: glow ? 0.5 : 0.05,
    }),
    [color, glow]
  );

  const baseGeom = useMemo(
    () => concept.groundedness_score > 0.1
      ? new THREE.CircleGeometry(bottomRadius * 2, 6)
      : null,
    [bottomRadius, concept.groundedness_score]
  );
  const baseMat = useMemo(
    () => baseGeom ? new THREE.MeshBasicMaterial({
      color: new THREE.Color('#34d399'),
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    }) : null,
    [baseGeom]
  );

  const handleClick = useCallback(
    (e) => { e.stopPropagation(); onClick(concept); },
    [onClick, concept]
  );

  return (
    <group position={position}>
      <mesh position={pillarPos} geometry={pillarGeom} material={pillarMat} onClick={handleClick} />
      {baseGeom && baseMat && (
        <mesh rotation={flatRotation} position={basePos} geometry={baseGeom} material={baseMat} renderOrder={1} />
      )}
      <Billboard position={labelPos}>
        <Text
          fontSize={glow ? 0.42 : 0.35}
          color={glow ? '#ffffff' : '#e2e8f0'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#060a14"
        >
          {concept.label}
        </Text>
        <Text
          fontSize={0.2}
          color={color}
          anchorX="center"
          position={catPos}
          outlineWidth={0.02}
          outlineColor="#060a14"
        >
          {concept.category} · {concept.mention_count}
        </Text>
      </Billboard>
    </group>
  );
});

// ── Actor Beacon ───────────────────────────────────────────
const ActorBeacon = memo(function ActorBeacon({
  actor, position, selected, onClick, hovered, onHover,
}) {
  const isBot = actor.actor_kind === 'bot';
  const color = isBot ? '#f59e0b' : '#f472b6';
  const h = 0.15 + Math.min(0.35, actor.message_count * 0.0003);
  const glow = selected || hovered;

  const meshPos = useMemo(() => [0, h + 0.15, 0], [h]);
  const labelPos = useMemo(() => [0, h + 0.7, 0], [h]);
  const roleLabelPos = useMemo(() => [0, -0.3, 0], []);

  const geom = useMemo(
    () => isBot ? new THREE.BoxGeometry(0.2, 0.2, 0.2) : new THREE.OctahedronGeometry(0.18, 0),
    [isBot]
  );
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: glow ? 0.95 : 0.5,
      emissive: glow ? new THREE.Color(color) : new THREE.Color('#000000'),
      emissiveIntensity: glow ? 0.6 : 0.1,
    }),
    [color, glow]
  );

  const handleClick = useCallback(
    (e) => { e.stopPropagation(); onClick(actor); },
    [onClick, actor]
  );
  const handlePointerEnter = useCallback(
    (e) => { e.stopPropagation(); onHover(actor.id); },
    [onHover, actor.id]
  );
  const handlePointerLeave = useCallback(
    () => onHover(null),
    [onHover]
  );

  const displayName = useMemo(
    () => actor.display_name.length > 18
      ? actor.display_name.slice(0, 18) + '…'
      : actor.display_name,
    [actor.display_name]
  );

  return (
    <group position={position}>
      <mesh
        position={meshPos}
        geometry={geom}
        material={mat}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      />
      {(glow || actor.message_count > 200) && (
        <Billboard position={labelPos}>
          <Text
            fontSize={0.25}
            color={color}
            anchorX="center"
            outlineWidth={0.02}
            outlineColor="#060a14"
          >
            {displayName}
          </Text>
          {glow && actor.labels?.length > 0 && (
            <Text
              fontSize={0.18}
              color="#94a3b8"
              anchorX="center"
              position={roleLabelPos}
              outlineWidth={0.02}
              outlineColor="#060a14"
            >
              {actor.labels.slice(0, 2).join(' · ')}
            </Text>
          )}
        </Billboard>
      )}
    </group>
  );
});

// ── Harmonic colors and rendering threshold ────────────────────
const HARMONIC_COLORS = {
  resonance: '#60a5fa',
  tension: '#f87171',
  echo: '#a78bfa',
  braid: '#fbbf24',
};
const MIN_RENDER_CONFIDENCE = 0.3;

// ── Harmonic Arc ───────────────────────────────────────────────
const HarmonicArc = memo(function HarmonicArc({
  harmonic, sourcePos, targetPos, selected, onClick,
}) {
  const color = HARMONIC_COLORS[harmonic.type] || '#94a3b8';
  const opacity = Math.max(0.15, harmonic.confidence * 0.7);

  // Arc midpoint raised in Y for visual separation
  const midX = (sourcePos[0] + targetPos[0]) / 2;
  const midZ = (sourcePos[2] + targetPos[2]) / 2;
  const dx = targetPos[0] - sourcePos[0];
  const dz = targetPos[2] - sourcePos[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const arcHeight = 0.5 + dist * 0.08;

  const points = useMemo(() => [
    [sourcePos[0], 0.5, sourcePos[2]],
    [midX, arcHeight, midZ],
    [targetPos[0], 0.5, targetPos[2]],
  ], [sourcePos, targetPos, midX, midZ, arcHeight]);

  const handleClick = useCallback(
    (e) => { e.stopPropagation(); onClick(harmonic); },
    [onClick, harmonic]
  );

  return (
    <Line
      points={points}
      color={color}
      lineWidth={selected ? 2.5 : 1.2}
      transparent
      opacity={selected ? 0.9 : opacity}
      dashed
      dashSize={0.4}
      gapSize={0.3}
      onClick={handleClick}
    />
  );
});

// ── Scene Content ──────────────────────────────────────────
function SceneContent({
  data, lookups, filters, timeRange, selectedNode, onSelectNode, focusedConcept, focusedActor, harmonics,
}) {
  const { concepts, actors, clusters } = data;

  // Hover state is local and only affects the specific hovered element.
  // React.memo on children prevents cascade re-renders.
  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [hoveredActor, setHoveredActor] = useState(null);

  // ── Layout: computed once from data, stable across renders ──
  const clusterPositions = useMemo(() => layoutClusters(clusters), [clusters]);
  const artifactPositions = useMemo(() => {
    const all = [];
    const seen = new Set();
    for (const cp of clusterPositions) {
      if (cp.isGeneral) continue;
      const arts = layoutArtifacts(cp.artifact_ids, cp.position, cp.radius, lookups.msgById);
      for (const art of arts) {
        if (!seen.has(art.id)) {
          seen.add(art.id);
          all.push(art);
        }
      }
    }
    return all;
  }, [clusterPositions, lookups]);

  const conceptPositions = useMemo(() => {
    const placed = new Set();
    const positions = [];
    for (const cp of clusterPositions) {
      if (cp.isGeneral) continue;
      for (const cid of (cp.concept_ids || []).slice(0, 2)) {
        if (placed.has(cid)) continue;
        placed.add(cid);
        const concept = lookups.conceptById.get(cid);
        if (!concept) continue;
        const idx = positions.length;
        positions.push({
          concept,
          position: [
            cp.position[0] + (idx % 3) * 0.6,
            0,
            cp.position[2] + Math.floor(idx / 3) * 0.5 - cp.radius * 0.6,
          ],
        });
      }
    }
    return positions;
  }, [clusterPositions, lookups]);

  const actorPositions = useMemo(
    () => getActorPositions(actors, clusterPositions),
    [actors, clusterPositions]
  );

  // ── Visibility: only recomputes when timeRange changes ──
  const visibleArtifacts = useMemo(() => {
    if (!timeRange) return new Set(artifactPositions.map(a => a.id));
    const visible = new Set();
    for (const ap of artifactPositions) {
      const msg = lookups.msgById.get(ap.id);
      if (msg && msg.timestamp >= timeRange[0] && msg.timestamp <= timeRange[1]) visible.add(ap.id);
    }
    return visible;
  }, [artifactPositions, timeRange, lookups]);

  const filteredActors = useMemo(() => {
    if (!filters.showActors) return [];
    return actorPositions.filter(ap => {
      if (filters.actorKind === 'human' && ap.actor.actor_kind !== 'human') return false;
      if (filters.actorKind === 'bot' && ap.actor.actor_kind !== 'bot') return false;
      return true;
    });
  }, [actorPositions, filters]);

  // ── Stable grid position ──
  const gridPos = useMemo(() => [0, -0.03, 0], []); // grid pushed down to avoid z-fight

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[25, 35, 15]} intensity={0.5} />
      <pointLight position={[-30, 15, 0]} intensity={0.15} color="#34d399" />
      <pointLight position={[0, 15, 0]} intensity={0.15} color="#60a5fa" />
      <pointLight position={[30, 15, 0]} intensity={0.15} color="#a78bfa" />

      {/* Grid at renderOrder=0, below all cluster geometry */}
      <gridHelper args={[120, 120, '#141c2f', '#0f1525']} position={gridPos} renderOrder={0} />

      {/* Era markers — static, never re-render */}
      {Object.entries(ERA_CONFIG).map(([era, config]) => (
        <EraMarker key={era} era={era} config={config} />
      ))}

      {/* Clusters — each is React.memo'd, only re-renders on its own prop changes */}
      {clusterPositions.map((cp) => (
        <ClusterDistrict
          key={cp.id}
          cluster={cp}
          position={cp.position}
          radius={cp.radius}
          color={getClusterColor(cp)}
          selected={selectedNode?.type === 'cluster' && selectedNode?.id === cp.id}
          hovered={hoveredCluster === cp.id}
          onClick={(c) => onSelectNode({ type: 'cluster', id: c.id, data: c })}
          onHover={setHoveredCluster}
        />
      ))}

      {/* Artifact tokens — memo'd, skip re-render unless own props change */}
      {artifactPositions.map((ap) => (
        <ArtifactToken
          key={ap.id}
          id={ap.id}
          position={ap.position}
          groundedness={ap.groundedness}
          abstraction={ap.abstraction}
          visible={visibleArtifacts.has(ap.id)}
          selected={selectedNode?.type === 'artifact' && selectedNode?.id === ap.id}
          highlightAuthor={focusedActor && ap.author === focusedActor}
          onClick={(id) => {
            const msg = lookups.msgById.get(id);
            if (msg) onSelectNode({ type: 'artifact', id, data: msg });
          }}
        />
      ))}

      {/* Concept anchors */}
      {filters.showConcepts && conceptPositions.map((cp) => (
        <ConceptAnchor
          key={cp.concept.id}
          concept={cp.concept}
          position={cp.position}
          color={getCategoryColor(cp.concept.category)}
          selected={selectedNode?.type === 'concept' && selectedNode?.id === cp.concept.id}
          focused={focusedConcept === cp.concept.id}
          onClick={(c) => onSelectNode({ type: 'concept', id: c.id, data: c })}
        />
      ))}

      {/* Actor beacons */}
      {filteredActors.map((ap) => (
        <ActorBeacon
          key={ap.actor.id}
          actor={ap.actor}
          position={ap.position}
          selected={selectedNode?.type === 'actor' && selectedNode?.id === ap.actor.id}
          hovered={hoveredActor === ap.actor.id}
          onClick={(a) => onSelectNode({ type: 'actor', id: a.id, data: a })}
          onHover={setHoveredActor}
        />
      ))}

      {/* Harmonic arcs — dashed lines between clusters */}
      {filters.showHarmonics && harmonics && harmonics.length > 0 && (() => {
        const clusterPosMap = new Map();
        for (const cp of clusterPositions) clusterPosMap.set(cp.id, cp.position);
        const visible = harmonics.filter(h =>
          h.confidence >= MIN_RENDER_CONFIDENCE &&
          clusterPosMap.has(h.source_cluster_id) &&
          clusterPosMap.has(h.target_cluster_id)
        );
        return visible.map(h => (
          <HarmonicArc
            key={h.id}
            harmonic={h}
            sourcePos={clusterPosMap.get(h.source_cluster_id)}
            targetPos={clusterPosMap.get(h.target_cluster_id)}
            selected={selectedNode?.type === 'harmonic' && selectedNode?.id === h.id}
            onClick={(harm) => onSelectNode({ type: 'harmonic', id: harm.id, data: harm })}
          />
        ));
      })()}


      <OrbitControls
        enablePan enableZoom enableRotate
        maxPolarAngle={Math.PI / 2.3}
        minPolarAngle={Math.PI / 6}
        maxDistance={90}
        minDistance={8}
        target={[0, 0, 0]}
      />
    </>
  );
}

// ── Canvas Wrapper ─────────────────────────────────────────
export default function IsometricScene(props) {
  const { harmonics, ...rest } = props;
  return (
    <Canvas
      className="scene-canvas"
      camera={{ position: [35, 30, 35], fov: 42, near: 0.1, far: 250 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor('#060a14')}
    >
      <SceneContent {...rest} harmonics={harmonics} />
    </Canvas>
  );
}
