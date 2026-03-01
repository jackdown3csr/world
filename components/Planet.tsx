"use client";

import React, { useRef, useMemo } from "react";
import * as THREE from "three";

/* ── Atmosphere glow (Fresnel rim) ────────────────────────── */

const atmosVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 1.2;
  }
`;

/**
 * Planet sphere with dark surface, subtle wireframe grid overlay,
 * and a glowing atmosphere rim.
 */
export default function Planet() {
  const groupRef = useRef<THREE.Group>(null);

  const atmosMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosVertexShader,
        fragmentShader: atmosFragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  return (
    <group ref={groupRef}>
      {/* Solid dark surface */}
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          color="#080818"
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Wireframe grid overlay */}
      <mesh>
        <sphereGeometry args={[1.002, 48, 48]} />
        <meshBasicMaterial
          color="#1a3a5c"
          wireframe
          transparent
          opacity={0.08}
        />
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[1.15, 64, 64]} />
        <primitive object={atmosMaterial} attach="material" />
      </mesh>
    </group>
  );
}
