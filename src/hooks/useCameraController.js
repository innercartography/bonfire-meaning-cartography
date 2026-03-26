/**
 * useCameraController.js
 *
 * Manages three zoom levels and programmatic camera animation:
 *   OVERVIEW  — birds-eye of the full map
 *   ERA       — focused on one period (Genesis / Growth / Convergence)
 *   CLUSTER   — front-and-center on a single hex
 *
 * Also wires keyboard arrow / WASD pan so the user can navigate
 * without touching a mouse.
 */
import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

export const ZOOM_LEVELS = {
  OVERVIEW: 'overview',
  ERA: 'era',
  CLUSTER: 'cluster',
};

// Camera presets for each zoom level
export const CAMERA_PRESETS = {
  [ZOOM_LEVELS.OVERVIEW]: {
    position: [0, 90, 60],
    target: [0, 0, 0],
    fov: 42,
  },
  // Era presets are computed dynamically from ERA_CONFIG x-positions
};

const ERA_X = { early: -30, middle: 0, late: 30 };
const ANIM_DURATION = 0.55; // seconds

/**
 * Smooth lerp animation between two camera states.
 * Drives via requestAnimationFrame inside the R3F render loop
 * using the OrbitControls ref.
 */
export function useCameraController() {
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);

  const animRef = useRef(null);           // current animation state
  const keysRef = useRef(new Set());      // currently held keys
  const frameRef = useRef(null);          // rAF handle for key-pan

  const [zoomLevel, setZoomLevel] = useState(ZOOM_LEVELS.OVERVIEW);
  const [activeEra, setActiveEra] = useState(null);
  const [activeClusterId, setActiveClusterId] = useState(null);

  // ─── Animated fly-to ───────────────────────────────────────
  const flyTo = useCallback((targetPos, targetLook, durationOverride) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const dur = durationOverride ?? ANIM_DURATION;

    const startPos = cam.position.clone();
    const startTarget = ctrl.target.clone();
    const endPos = new THREE.Vector3(...targetPos);
    const endTarget = new THREE.Vector3(...targetLook);

    const startTime = performance.now();

    function tick() {
      const elapsed = (performance.now() - startTime) / 1000;
      const t = Math.min(elapsed / dur, 1);
      // Ease-in-out cubic
      const et = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      cam.position.lerpVectors(startPos, endPos, et);
      ctrl.target.lerpVectors(startTarget, endTarget, et);
      ctrl.update();

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
      }
    }

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(tick);
  }, []);

  // ─── Zoom level commands ────────────────────────────────────
  const zoomToOverview = useCallback(() => {
    flyTo([0, 90, 60], [0, 0, 0]);
    setZoomLevel(ZOOM_LEVELS.OVERVIEW);
    setActiveEra(null);
    setActiveClusterId(null);
  }, [flyTo]);

  const zoomToEra = useCallback((era) => {
    const x = ERA_X[era] ?? 0;
    flyTo([x + 5, 45, 40], [x, 0, 0]);
    setZoomLevel(ZOOM_LEVELS.ERA);
    setActiveEra(era);
    setActiveClusterId(null);
  }, [flyTo]);

  const zoomToCluster = useCallback((clusterPosition, clusterId) => {
    const [cx, , cz] = clusterPosition;
    // Position camera in front and slightly above the cluster
    flyTo([cx + 6, 12, cz + 18], [cx, 0, cz]);
    setZoomLevel(ZOOM_LEVELS.CLUSTER);
    setActiveClusterId(clusterId);
    setActiveEra(null);
  }, [flyTo]);

  // ─── Keyboard pan (arrow keys + WASD) ──────────────────────
  useEffect(() => {
    const PAN_SPEED = 0.35;

    function handleKeyDown(e) {
      keysRef.current.add(e.key);
      if (frameRef.current === null) startKeyPan();
    }

    function handleKeyUp(e) {
      keysRef.current.delete(e.key);
      if (keysRef.current.size === 0 && frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }

    function startKeyPan() {
      function tick() {
        const ctrl = controlsRef.current;
        const cam = cameraRef.current;
        if (!ctrl || !cam) { frameRef.current = null; return; }

        const keys = keysRef.current;
        if (keys.size === 0) { frameRef.current = null; return; }

        // Build pan delta in camera-local space
        const forward = new THREE.Vector3();
        cam.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

        const delta = new THREE.Vector3();
        if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) delta.addScaledVector(forward, PAN_SPEED);
        if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) delta.addScaledVector(forward, -PAN_SPEED);
        if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) delta.addScaledVector(right, -PAN_SPEED);
        if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) delta.addScaledVector(right, PAN_SPEED);

        cam.position.add(delta);
        ctrl.target.add(delta);
        ctrl.update();

        frameRef.current = requestAnimationFrame(tick);
      }
      frameRef.current = requestAnimationFrame(tick);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return {
    controlsRef,
    cameraRef,
    zoomLevel,
    activeEra,
    activeClusterId,
    zoomToOverview,
    zoomToEra,
    zoomToCluster,
  };
}
