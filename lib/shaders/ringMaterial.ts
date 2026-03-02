/**
 * Saturn-style ring disc shader (decorative ring geometry, not the wallet particles).
 */

import * as THREE from "three";

export const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;

export const RING_FRAG = /* glsl */ `
  uniform float uHue;
  uniform float uSeed;
  varying vec2 vUv;
  void main(){
    float r  = vUv.x;
    float b1 = sin(r*58.  +uSeed*17.)*0.5+0.5;
    float b2 = sin(r*142. +uSeed*43.)*0.5+0.5;
    float b3 = sin(r*330. +uSeed*79.)*0.5+0.5;
    float d  = b1*0.55+b2*0.30+b3*0.15;
    float g1 = smoothstep(0.003,0.016,abs(r-0.385))*smoothstep(0.003,0.016,abs(r-0.405));
    float g2 = smoothstep(0.002,0.008,abs(r-0.725));
    d *= g1*g2;
    float edge  = smoothstep(0.,0.06,r)*smoothstep(1.,0.88,r);
    float alpha = d*edge*0.74;
    vec3 col = mix(vec3(0.88,0.73,0.46),vec3(0.79,0.88,0.96),uSeed)*(0.52+d*0.48);
    col = pow(max(col,vec3(0.001)),vec3(1./2.2));
    gl_FragColor = vec4(col, alpha);
  }
`;

/** Saturn-style ring disc material. */
export function createRingMaterial(hue: number, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   RING_VERT,
    fragmentShader: RING_FRAG,
    uniforms: {
      uHue:  { value: hue  },
      uSeed: { value: seed },
    },
    side:        THREE.DoubleSide,
    transparent: true,
    depthWrite:  false,
  });
}
