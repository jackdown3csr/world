/**
 * Scene Object Registry
 *
 * A module-level Map that allows O(1) lookup of focusable scene objects
 * by their wallet address / ID, replacing scene.traverse() calls in
 * CameraController and SceneCanvas.
 *
 * Each focusable component registers itself on mount and deregisters on
 * unmount via useEffect cleanup.
 */

import * as THREE from "three";

export type SceneFocusBody = {
  position: THREE.Vector3;
  bodyRadius: number;
  focusRadius?: number;
  bodyType: string;
};

type RegularEntry = {
  object: THREE.Object3D;
  bodyRadius: number;
  focusRadius?: number;
  bodyType: string;
};

type InstancedEntry = {
  mesh: THREE.InstancedMesh;
  index: number;
  bodyType: string;
  focusRadius?: number;
};

const _registry = new Map<string, RegularEntry>();
const _instancedRegistry = new Map<string, InstancedEntry>();

// Shared scratch vectors — never allocate in the hot lookup path
const _mat4  = new THREE.Matrix4();
const _pos   = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat  = new THREE.Quaternion();
const _wp    = new THREE.Vector3();

/** Register a regular (non-instanced) scene object by ID. */
export function registerSceneObject(
  id: string,
  object: THREE.Object3D,
  bodyRadius: number,
  bodyType: string,
  focusRadius?: number,
): void {
  _registry.set(id, { object, bodyRadius, bodyType, focusRadius });
}

/** Remove a regular scene object from the registry. */
export function unregisterSceneObject(id: string): void {
  _registry.delete(id);
}

/** Register an instanced mesh entry (one asteroid inside an InstancedMesh). */
export function registerInstancedSceneObject(
  id: string,
  mesh: THREE.InstancedMesh,
  index: number,
  bodyType: string,
  focusRadius?: number,
): void {
  _instancedRegistry.set(id, { mesh, index, bodyType, focusRadius });
}

/** Remove an instanced entry from the registry. */
export function unregisterInstancedSceneObject(id: string): void {
  _instancedRegistry.delete(id);
}

/**
 * Look up a focusable body by its wallet address / scene ID.
 * Returns null if the object has not been registered (not yet mounted).
 *
 * NOTE: position is computed fresh via getWorldPosition / localToWorld so
 * orbiting objects always return their current world-space position.
 */
export function lookupSceneBody(id: string): SceneFocusBody | null {
  const entry = _registry.get(id);
  if (entry) {
    entry.object.getWorldPosition(_wp);
    return {
      position: _wp.clone(),
      bodyRadius: entry.bodyRadius,
      focusRadius: entry.focusRadius,
      bodyType: entry.bodyType,
    };
  }

  const inst = _instancedRegistry.get(id);
  if (inst) {
    inst.mesh.getMatrixAt(inst.index, _mat4);
    _pos.setFromMatrixPosition(_mat4);
    inst.mesh.localToWorld(_pos);
    _mat4.decompose(_wp, _quat, _scale);
    return {
      position: _pos.clone(),
      bodyRadius: _scale.x,
      focusRadius: inst.focusRadius,
      bodyType: inst.bodyType,
    };
  }

  return null;
}

/**
 * Pick a random registered body whose key starts with `prefix`.
 * Used as fallback for unregistered wallets — lands the effect on
 * an actual scene object (e.g. a random asteroid / disk clump) in
 * the same system rather than a synthetic position.
 *
 * `seed` makes the pick deterministic per-address so the same unknown
 * wallet always targets the same random body within a session.
 */
export function lookupRandomBodyByPrefix(
  prefix: string,
  seed: number,
  bodyType?: string,
): SceneFocusBody | null {
  // Collect keys matching prefix (and optionally bodyType) from both registries
  const keys: string[] = [];
  for (const [k, v] of _registry.entries()) {
    if (k.startsWith(prefix) && (!bodyType || v.bodyType === bodyType)) keys.push(k);
  }
  for (const [k, v] of _instancedRegistry.entries()) {
    if (k.startsWith(prefix) && (!bodyType || v.bodyType === bodyType)) keys.push(k);
  }
  if (keys.length === 0) return null;
  const pick = keys[Math.abs(seed) % keys.length];
  return lookupSceneBody(pick);
}
