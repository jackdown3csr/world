/**
 * Shared GLSL noise functions used across all planet-type shaders.
 * Simplex noise, FBM, procedural craters, and HSV helper.
 *
 * Each per-type shader file imports this and embeds it via template literal.
 */

export const PLANET_NOISE = /* glsl */ `
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

  float fbm(vec3 p){
    return snoise(p)*.500+snoise(p*2.)*.250
          +snoise(p*4.)*.125+snoise(p*8.)*.0625;
  }

  float craters(vec3 p, float seed, float scale, int count) {
    float cr = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= count) break;
      float fi = float(i);
      vec3 center = normalize(vec3(
        sin(seed * 91.1 + fi * 47.3),
        cos(seed * 37.3 + fi * 83.1),
        sin(seed * 63.7 + fi * 19.9)
      ));
      float r = 0.12 + fract(seed * 7.7 + fi * 0.37) * scale;
      float d = acos(clamp(dot(p, center), -1.0, 1.0)) / r;
      if (d < 1.0) {
        cr += -smoothstep(0.0, 0.55, d) * 0.8 + smoothstep(0.55, 0.95, d) * 0.5;
      }
    }
    return clamp(cr, -1.0, 1.0);
  }

  vec3 hsv(vec3 c){
    vec4 K=vec4(1.,2./3.,1./3.,3.);
    vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
  }
`;

/**
 * Moon-transit shadow uniforms + function.
 * Include this in each planet FRAG shader to cast moon shadows onto the surface.
 */
export const MOON_SHADOW_GLSL = /* glsl */ `
  uniform vec3  uMoonPos[6];
  uniform float uMoonRad[6];
  uniform float uMoonCount;

  // Returns shadow intensity [0..1] from any moon transiting in front of sun.
  float moonTransitShadow(vec3 fragPos) {
    vec3 toSun = normalize(-fragPos);
    float shadow = 0.0;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= uMoonCount) break;
      vec3  oc   = fragPos - uMoonPos[i];
      float b    = dot(oc, toSun);
      float c    = dot(oc, oc) - uMoonRad[i] * uMoonRad[i];
      float disc = b * b - c;
      if (disc > 0.0) {
        // t1 > 0 means moon is between fragment and sun
        float t1 = -b - sqrt(disc);
        if (t1 > 0.01) {
          float dist   = length(oc);
          float angR   = uMoonRad[i] / max(dist, 0.001);
          // Perpendicular distance from shadow axis (normalised)
          vec3  onAxis = toSun * b;
          float offset = length(oc - onAxis) / max(dist, 0.001);
          // Soft umbra/penumbra transition
          shadow = max(shadow, smoothstep(angR * 1.15, angR * 0.65, offset));
        }
      }
    }
    return shadow;
  }
`;
