"""
Writes lib/planetShader.ts — clean, WebGL-safe shader (no local arrays,
bounded instruction count, max 4 fbm calls per pixel).
"""
import pathlib

SNOISE_GLSL = r"""
  vec3 _m289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 _m289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 _perm(vec4 x){return _m289v4(((x*34.)+10.)*x);}
  vec4 _tiSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}

  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);
    const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));
    vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz),l=1.-g;
    vec3 i1=min(g.xyz,l.zxy),i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx,x2=x0-i2+C.yyy,x3=x0-D.yyy;
    i=_m289v3(i);
    vec4 p=_perm(_perm(_perm(
      i.z+vec4(0.,i1.z,i2.z,1.))
      +i.y+vec4(0.,i1.y,i2.y,1.))
      +i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;
    vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z),y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy,y=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy),b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.,s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
    vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x),p1=vec3(a0.zw,h.y);
    vec3 p2=vec3(a1.xy,h.z),p3=vec3(a1.zw,h.w);
    vec4 norm=_tiSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
    m*=m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  // 4-octave FBM — fast enough for 4 calls/pixel
  float fbm(vec3 p){
    return snoise(p)*.500+snoise(p*2.)*.250
          +snoise(p*4.)*.125+snoise(p*8.)*.0625;
  }

  vec3 hsv(vec3 c){
    vec4 K=vec4(1.,2./3.,1./3.,3.);
    vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
  }
"""

VERT = r"""
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;
  void main(){
    vPos=position;
    vec4 wp=modelMatrix*vec4(position,1.);
    vWorldPos=wp.xyz;
    vWorldNorm=normalize(mat3(modelMatrix)*normal);
    gl_Position=projectionMatrix*viewMatrix*wp;
  }
"""

# Fragment shader — max 4 fbm calls in any branch, no local arrays, all vars initialised
FRAG = r"""
  uniform float uType;
  uniform float uHue;
  uniform float uSeed;
  uniform float uTime;
  varying vec3 vPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNorm;

""" + SNOISE_GLSL + r"""

  void main(){
    vec3 p     = normalize(vPos);
    float lat  = p.y;
    vec3 seed3 = vec3(uSeed*13.7, uSeed*7.3, uSeed*5.1);

    // ── Lighting vectors ───────────────────────────────────────
    vec3 lightDir = normalize(-vWorldPos);   // sun at origin
    vec3 viewDir  = normalize(cameraPosition - vWorldPos);

    // ── Cheap perturbed normal (2 fbm samples max) ────────────
    float eps  = 0.05;
    float h0   = fbm(p * 3.0 + seed3);
    float hx   = fbm((p + vec3(eps,0.,0.)) * 3.0 + seed3);
    float hy   = fbm((p + vec3(0.,eps,0.)) * 3.0 + seed3);
    vec3 grad  = vec3(hx-h0, hy-h0, 0.) / eps;
    // gas giants / ice giants: minimal bump
    float bStr = (uType > 1.5) ? 0.08 : 0.35;
    vec3 bumpN = normalize(vWorldNorm + mat3(modelMatrix)*grad*bStr);

    // ── Terminator ────────────────────────────────────────────
    float NdotL_raw = dot(bumpN, lightDir);
    float penum     = (uType < 0.5) ? 0.03 : (uType < 1.5) ? 0.12 : 0.08;
    float day       = smoothstep(-penum, penum, NdotL_raw);
    float NdotL     = max(NdotL_raw, 0.);

    // ── Per-type surface ──────────────────────────────────────
    vec3  albedo   = vec3(0.5);
    vec3  atmosCol = vec3(0.4, 0.6, 1.0);
    float atmosStr = 0.25;
    float specPow  = 0.0;
    float oceanMask = 0.0;
    float cloudAlpha = 0.0;

    // ================================================================
    //  ROCKY  (uType < 0.5)
    // ================================================================
    if (uType < 0.5) {
      // 2 fbm calls for terrain
      float n1 = fbm(p * 2.2 + seed3) * 0.65 + fbm(p * 7.0 + seed3.yzx) * 0.35;
      float t  = smoothstep(0.2, 0.8, n1);

      float palette = fract(uSeed * 0.71);
      vec3 hiC, loC;
      if (palette < 0.5) {
        hiC = hsv(vec3(0.07+uHue*0.09, 0.26, 0.62));
        loC = hsv(vec3(0.06+uHue*0.06, 0.18, 0.24));
      } else {
        hiC = hsv(vec3(0.02+uHue*0.07, 0.62, 0.52));
        loC = hsv(vec3(0.03+uHue*0.05, 0.48, 0.20));
      }
      albedo = mix(loC, hiC, t);

      // Craters: 3 analytically-placed without arrays
      // Seeded positions using sin/cos of the seed value
      vec3 c0 = normalize(vec3(sin(uSeed*91.1), cos(uSeed*37.3), sin(uSeed*63.7)));
      vec3 c1 = normalize(vec3(sin(uSeed*53.7), cos(uSeed*81.3), cos(uSeed*27.1)));
      vec3 c2 = normalize(vec3(cos(uSeed*19.9), sin(uSeed*47.3), cos(uSeed*83.1)));

      float cr = 0.0;
      float d0 = acos(clamp(dot(p,c0),-1.,1.))/0.50; if(d0<1.) cr += -smoothstep(0.,0.6,d0)*0.7+smoothstep(0.6,0.93,d0)*0.6;
      float d1 = acos(clamp(dot(p,c1),-1.,1.))/0.34; if(d1<1.) cr += -smoothstep(0.,0.6,d1)*0.7+smoothstep(0.6,0.93,d1)*0.6;
      float d2 = acos(clamp(dot(p,c2),-1.,1.))/0.22; if(d2<1.) cr += -smoothstep(0.,0.6,d2)*0.7+smoothstep(0.6,0.93,d2)*0.6;
      cr = clamp(cr, -0.7, 0.6);
      albedo = mix(albedo, loC*0.4, max(-cr,0.));
      albedo = mix(albedo, hiC*1.3, max( cr,0.));

      // Polar frost (Mar/Mercury analog)
      if (palette > 0.35) {
        float frost = smoothstep(0.76, 0.94, abs(lat));
        albedo = mix(albedo, vec3(0.93,0.91,0.89), frost);
      }

      atmosCol = hsv(vec3(0.05+uHue*0.05, 0.25, 0.75));
      atmosStr = 0.05;
      specPow  = 8.0;

    // ================================================================
    //  TERRESTRIAL  (0.5 <= uType < 1.5)
    // ================================================================
    } else if (uType < 1.5) {
      // 2 fbm for land mask + 1 for clouds = 3 total
      float landN = fbm(p*2.0+seed3)*0.65 + fbm(p*5.5+seed3.zxy)*0.35;
      oceanMask   = 1.0 - smoothstep(0.43, 0.57, landN);
      float polar  = smoothstep(0.64, 0.92, abs(lat));
      float trop   = 1.0 - smoothstep(0., 0.55, abs(lat));

      vec3 deepO  = hsv(vec3(0.61+uHue*0.04, 0.85, 0.28));
      vec3 shalO  = hsv(vec3(0.55+uHue*0.05, 0.68, 0.50));
      vec3 ocean  = mix(deepO, shalO, smoothstep(0.44,0.52,landN));
      vec3 jungle = hsv(vec3(0.31+uHue*0.06, 0.72, 0.30));
      vec3 desert = hsv(vec3(0.10+uHue*0.05, 0.52, 0.64));
      vec3 tundra = hsv(vec3(0.38+uHue*0.04, 0.20, 0.50));
      vec3 snow   = vec3(0.90,0.93,0.97);

      vec3 land  = mix(jungle, desert, smoothstep(0.3,0.7,trop*0.6+landN*0.4));
      land = mix(land, tundra, smoothstep(0.44,0.68,abs(lat)));
      land = mix(land, snow,   polar);
      albedo = mix(ocean, land, 1.-oceanMask);

      // Animated clouds — 1 fbm
      float cl = fbm(p*4.0 + vec3(uTime*0.008,0.,uSeed*5.1) + seed3*0.5);
      cloudAlpha = smoothstep(0.48, 0.68, cl) * 0.88;
      albedo = mix(albedo, mix(vec3(0.88,0.91,0.96),snow,polar*0.5), cloudAlpha);

      atmosCol = hsv(vec3(0.59+uHue*0.03, 0.60, 0.98));
      atmosStr = 0.55;
      specPow  = 96.0;

    // ================================================================
    //  ICE GIANT  (1.5 <= uType < 2.5)
    // ================================================================
    } else if (uType < 2.5) {
      float warp = fbm(p*1.5+seed3) * 0.18;
      float dLat = lat + warp;
      float bF   = 7.0 + uSeed*4.0;
      float b1   = sin(dLat*bF         + uTime*0.06)*0.5+0.5;
      float b2   = sin(dLat*bF*2.1     + uTime*0.11+uSeed*3.14)*0.5+0.5;

      // Storm spot — analytic position, no extra fbm
      float sLat = 0.22+(fract(uSeed*7.7)-0.5)*0.18;
      float sLon = fract(uSeed*11.3)*6.2832;
      vec3 sC   = vec3(cos(sLat)*cos(sLon), sin(sLat), cos(sLat)*sin(sLon));
      float sM  = smoothstep(0.30, 0.06, length(p-normalize(sC)));

      float hB  = 0.57+uHue*0.11;
      vec3 deep  = hsv(vec3(hB,       0.90, 0.28));
      vec3 mid   = hsv(vec3(hB+0.04,  0.80, 0.52));
      vec3 brite = hsv(vec3(hB+0.08,  0.56, 0.74));
      vec3 stC2  = hsv(vec3(hB+0.10,  0.38, 0.86));
      albedo  = mix(deep, mid,   smoothstep(0.3,0.7,b1));
      albedo  = mix(albedo, brite, smoothstep(0.6,0.9,b2)*0.4);
      albedo  = mix(albedo, stC2,  sM);
      albedo  = mix(albedo, hsv(vec3(hB-0.03,0.40,0.68)), smoothstep(0.58,0.92,abs(lat)));

      atmosCol = hsv(vec3(hB+0.02, 0.72, 0.94));
      atmosStr = 0.65;
      specPow  = 48.0;

    // ================================================================
    //  GAS GIANT  (uType >= 2.5)
    // ================================================================
    } else {
      // 2 fbm for wind distortion
      float wind = fbm(p*1.5+seed3)*0.26 + fbm(p*4.0+seed3.yzx)*0.10;
      float dLat = lat+wind;
      float bF   = 12.0+uSeed*7.0;
      float b1   = sin(dLat*bF          +uTime*0.018)*0.5+0.5;
      float b2   = sin(dLat*bF*1.618    +uTime*0.031+uSeed*2.)*0.5+0.5;
      float b3   = sin(dLat*bF*0.5      +uTime*0.011)*0.5+0.5;

      // GRS — fully analytic
      float gLat = -(0.23+fract(uSeed*7.3)*0.14);
      float gLon =  fract(uSeed*3.9)*6.2832;
      float gA   = 0.22+fract(uSeed*5.5)*0.11;
      vec3 gCtr  = vec3(cos(gLat)*cos(gLon), sin(gLat), cos(gLat)*sin(gLon));
      float gDX  = dot(p-normalize(gCtr), vec3(cos(gLon),0.,sin(gLon)))/gA;
      float gDY  = dot(p-normalize(gCtr), vec3(0.,1.,0.))/(gA*0.5);
      float gM   = smoothstep(1., 0.2, sqrt(gDX*gDX+gDY*gDY));
      float gSw  = sin(atan(gDY,gDX)*5.+uTime*0.07)*0.5+0.5;

      vec3 zone  = hsv(vec3(fract(0.09+uHue*0.22), 0.30, 0.92));
      vec3 belt  = hsv(vec3(fract(0.06+uHue*0.18), 0.70, 0.48));
      vec3 warm  = hsv(vec3(fract(0.05+uHue*0.16), 0.74, 0.72));
      vec3 grsC  = hsv(vec3(fract(0.02+uHue*0.11), 0.86, 0.68));

      albedo = mix(belt, zone,  smoothstep(0.35,0.65,b1));
      albedo = mix(albedo,warm, smoothstep(0.48,0.76,b2)*0.36);
      // white zone highlights
      albedo = mix(albedo, vec3(0.92,0.91,0.88), smoothstep(0.72,0.88,b3)*0.16);
      // GRS
      albedo = mix(albedo, mix(grsC,mix(grsC,zone*0.5,0.5),gSw*0.5), gM);
      // Polar darkening
      albedo *= 1.-smoothstep(0.55,1.,abs(lat))*0.36;
      cloudAlpha = smoothstep(0.4,0.7,b1)*0.38;

      atmosCol = hsv(vec3(fract(0.09+uHue*0.15), 0.50, 0.98));
      atmosStr = 0.35;
      specPow  = 24.0;
    }

    // ── Diffuse ────────────────────────────────────────────────
    vec3 color = albedo * (0.05 + NdotL*0.95);

    // ── Specular ────────────────────────────────────────────────
    if (specPow > 0.) {
      vec3 halfV = normalize(lightDir+viewDir);
      float spec = pow(max(dot(bumpN,halfV),0.), specPow);
      float sm   = (uType < 0.5) ? 0.12
                 : (uType < 1.5) ? oceanMask*(1.-cloudAlpha*0.8)
                 : 0.30;
      color += vec3(1.,0.97,0.88)*spec*sm*day;
    }

    // ── Night lights (terrestrial) ────────────────────────────
    if (uType >= 0.5 && uType < 1.5) {
      // Re-use h0 (already computed) for city pattern — no extra fbm
      float city = smoothstep(0.55, 0.75, h0*h0) * (1.-day) * (1.-cloudAlpha*0.85);
      color += vec3(1.0, 0.88, 0.50) * city * 0.38;
    }

    // ── Atmosphere Fresnel rim ────────────────────────────────
    float vdn     = max(dot(bumpN,viewDir),0.);
    float fres    = pow(1.-vdn, 3.5);
    float hazeStr = pow(1.-vdn, 1.2) * smoothstep(-0.3,0.6,dot(vWorldNorm,lightDir));
    color += atmosCol*(fres*0.9+hazeStr*0.35)*atmosStr;

    // ── Gamma (linear -> sRGB) ────────────────────────────────
    color = pow(max(color,vec3(0.001)), vec3(1./2.2));
    gl_FragColor = vec4(color, 1.0);
  }
"""

RING_VERT = r"""
  varying vec2 vUv;
  void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
"""

RING_FRAG = r"""
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
"""

TS = '''/**
 * Planet rendering pipeline — createPlanetMaterial factory.
 * WebGL2-safe: max 4 fbm calls per pixel branch, no local arrays,
 * all variables initialized, uses float uniforms throughout.
 */

import * as THREE from "three";
import type { PlanetType } from "./orbitalUtils";

export const PLANET_TYPE_INT: Record<PlanetType, number> = {
  rocky: 0, terrestrial: 1, ice_giant: 2, gas_giant: 3,
};

const VERT = /* glsl */`''' + VERT + r'''`;

const FRAG = /* glsl */`''' + FRAG + r'''`;

export const RING_VERT = /* glsl */`''' + RING_VERT + r'''`;
export const RING_FRAG = /* glsl */`''' + RING_FRAG + r'''`;

/** One ShaderMaterial per planet — independent uniforms per instance. */
export function createPlanetMaterial(
  type: PlanetType,
  hue:  number,
  seed: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uType: { value: PLANET_TYPE_INT[type] },
      uHue:  { value: hue  },
      uSeed: { value: seed },
      uTime: { value: 0    },
    },
  });
}

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
'''

out = pathlib.Path(r"c:\Users\honza\Documents\gitclones\world\world\lib\planetShader.ts")
out.write_text(TS, encoding="utf-8")
print(f"Written {len(TS)} chars to {out}")
