/**
 * GLSL shader sources and the injected CSS for the glass-headline hero (T-717). Kept in their
 * own file: these are large literal strings and would otherwise push glassHeadlineEngine.ts /
 * GlassHeadlineHero.tsx over this repo's max-lines lint gate.
 */

export const VERT = `#version 300 es
in vec2 a_position;
out vec2 vUv;
void main() {
  vUv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
`;

// The field behind the glass: domain-warped noise in the palette, with soft flowing bands.
// Smooth colour alone barely shows refraction; bands are what visibly bend as they pass behind
// a letter.
export const FIELD =
  HEAD +
  `uniform float u_time;
uniform float u_aspect;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;
uniform float u_octaves;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    if (float(i) >= u_octaves) break;
    v += a * noise(p);
    p = turn * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vec2(vUv.x * u_aspect, vUv.y) * 1.2;
  float t = u_time * 0.06;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p + 3.5 * q + vec2(8.3, 2.8) - t * 1.1));
  float f = fbm(p + 3.0 * r);

  vec3 col = u_c0;
  col = mix(col, u_c3, smoothstep(0.25, 0.72, q.x) * 0.9);
  col = mix(col, u_c1, smoothstep(0.34, 0.74, f));
  col = mix(col, u_c2, smoothstep(0.42, 0.8, r.y) * 0.8);
  col = mix(col, u_c4, smoothstep(0.55, 0.9, f * r.x * 1.8) * 0.7);

  float bands = 0.5 + 0.5 * sin((f * 7.0 + r.x * 3.0) * 3.14159);
  col *= mix(0.86, 1.1, smoothstep(0.2, 0.8, bands));

  vec2 g = (vUv - vec2(0.5, 0.56)) / vec2(0.5, 0.2);
  col += u_c4 * 0.07 * exp(-dot(g, g));

  col *= mix(0.42, 1.0, smoothstep(0.02, 0.62, vUv.y));
  vec2 s = (vUv - vec2(0.5, 0.33)) / vec2(0.32, 0.13);
  col *= 1.0 - 0.4 * exp(-dot(s, s));
  o = vec4(col, 1.0);
}`;

// Separable gaussian over the headline mask, one channel per pass. R is the bevel (steep at the
// edge), B the dome that gives each face a little curvature, G carries the sharp mask through
// untouched.
export const BLUR =
  HEAD +
  `uniform sampler2D u_src;
uniform vec2 u_step;
uniform float u_radius;
uniform float u_read;
uniform float u_write;
float pick(vec4 t) {
  return u_read < 0.5 ? smoothstep(0.06, 1.0, t.r) : u_read < 1.5 ? t.r : t.b;
}
void main() {
  float sigma = max(u_radius * 0.5, 0.5);
  float sum = 0.0;
  float weights = 0.0;
  for (int i = -24; i <= 24; i++) {
    float x = float(i) * u_radius / 24.0;
    float w = exp(-0.5 * x * x / (sigma * sigma));
    sum += pick(texture(u_src, vUv + u_step * x)) * w;
    weights += w;
  }
  vec4 here = texture(u_src, vUv);
  float blurred = sum / weights;
  o = vec4(u_write < 0.5 ? blurred : here.r, here.g, u_write < 0.5 ? here.b : blurred, 1.0);
}`;

export const GLASS =
  HEAD +
  `uniform sampler2D u_field;
uniform sampler2D u_height;
uniform vec2 u_htexel;
uniform float u_bevel;
uniform float u_aspect;
uniform vec2 u_light;
uniform float u_glass;
uniform float u_form;
uniform vec2 u_res;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float bevel(vec2 p) {
  vec4 t = texture(u_height, p);
  float x = clamp((t.r - 0.5) * 2.0, 0.0, 1.0);
  float edge = sqrt(1.0 - (1.0 - x) * (1.0 - x));
  float dome = clamp((t.b - 0.5) * 2.0, 0.0, 1.0);
  return edge * 0.8 + dome * 0.45;
}

void main() {
  vec2 uv = vUv;
  vec2 hv = texture(u_height, uv).rg;
  float inside = smoothstep(0.08, 0.92, hv.g) * u_glass * u_form;

  vec2 dx = vec2(u_htexel.x * 2.0, 0.0);
  vec2 dy = vec2(0.0, u_htexel.y * 2.0);
  float tl = bevel(uv - dx + dy);
  float tc = bevel(uv + dy);
  float tr = bevel(uv + dx + dy);
  float ml = bevel(uv - dx);
  float mr = bevel(uv + dx);
  float bl = bevel(uv - dx - dy);
  float bc = bevel(uv - dy);
  float br = bevel(uv + dx - dy);
  vec2 grad = vec2((tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl), (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br)) / 16.0 * u_bevel;
  vec3 n = normalize(vec3(-grad * 0.9, 1.0));

  vec2 toLight = (u_light - uv) * vec2(u_aspect, 1.0);
  vec3 L = normalize(vec3(toLight, 0.45));
  vec3 halfway = normalize(L + vec3(0.0, 0.0, 1.0));
  float facing = max(dot(n, halfway), 0.0);
  float pin = pow(facing, 160.0);
  float sheen = pow(facing, 24.0);
  float rim = pow(1.0 - n.z, 2.0);
  float studio = smoothstep(-0.7, 0.7, n.y);

  vec2 bend = -n.xy * 0.05 * u_form * vec2(1.0 / u_aspect, 1.0);
  vec3 through = vec3(
    texture(u_field, uv + bend * 0.84).r,
    texture(u_field, uv + bend).g,
    texture(u_field, uv + bend * 1.18).b);
  vec2 ld = normalize(toLight + 1e-5);
  float gather = rim * max(dot(normalize(n.xy + 1e-5), -ld), 0.0);
  vec3 glass = through * 0.86 + 0.06
    + rim * mix(0.28, 0.72, studio)
    + sheen * 0.16 + pin * 1.3
    + gather * vec3(1.0, 0.93, 0.82) * 0.55;
  float lip = smoothstep(0.42, 0.5, hv.r) * (1.0 - smoothstep(0.5, 0.6, hv.r));
  glass *= 1.0 - 0.28 * lip;

  vec2 away = normalize(toLight + 1e-5) * vec2(1.0 / u_aspect, 1.0);
  float shade = texture(u_height, uv + away * 0.012).r;
  vec3 bg = texture(u_field, uv).rgb;
  bg *= 1.0 - 0.32 * smoothstep(0.1, 0.7, shade) * u_glass;

  vec3 col = mix(bg, glass, inside);
  col += (hash(floor(uv * u_res)) - 0.5) * 0.018;
  o = vec4(col, 1.0);
}`;

// Presentational CSS for the hero shell/content. Field colors are supplied at runtime (see
// useThemeHexColors.ts) rather than baked in here. The focus ring uses this site's shared
// --focus-ring token (not a hardcoded white) so keyboard focus stays visually consistent with
// the rest of the app; the white "glass" button fills/hovers are this component's own
// self-contained look and are left as designed.
export const CSS =
  ".ghr-root{position:relative;width:100%;overflow:hidden;color:#FFFFFF;container-type:inline-size;touch-action:pan-y}" +
  ".ghr-canvas{position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;opacity:0;" +
  "transition:opacity 700ms cubic-bezier(0.23,1,0.32,1)}" +
  ".ghr-root[data-glass='true'] .ghr-canvas{opacity:1}" +
  ".ghr-content{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
  "gap:28px;height:100%;padding:72px 24px;box-sizing:border-box;text-align:center}" +
  ".ghr-eyebrow,.ghr-desc,.ghr-actions{animation:ghr-in 700ms cubic-bezier(0.23,1,0.32,1) both}" +
  ".ghr-desc{animation-delay:120ms}" +
  ".ghr-actions{animation-delay:200ms}" +
  ".ghr-eyebrow{display:inline-flex;align-items:center;height:30px;padding:0 14px;border-radius:999px;font-size:13px;" +
  "font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82);" +
  "border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}" +
  ".ghr-title{margin:0;max-width:12ch;font-size:clamp(3.75rem,calc(13cqw + 1.5rem),12.5rem);font-weight:800;line-height:.95;" +
  "letter-spacing:-0.025em;color:#FFFFFF;text-wrap:balance;" +
  "transition:color 900ms cubic-bezier(0.23,1,0.32,1)}" +
  ".ghr-root[data-glass='true'] .ghr-title{color:transparent}" +
  ".ghr-word::selection{background:rgba(255,255,255,.28)}" +
  ".ghr-desc{margin:0;max-width:38rem;font-size:clamp(1rem,1.7cqw,1.25rem);line-height:1.55;color:rgba(255,255,255,.8)}" +
  ".ghr-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:8px}" +
  ".ghr-eyebrow{margin-bottom:-8px}" +
  ".ghr-arrow{margin-left:8px;transition:transform 200ms cubic-bezier(0.23,1,0.32,1)}" +
  ".ghr-btn{display:inline-flex;align-items:center;justify-content:center;height:48px;padding:0 24px;border-radius:999px;" +
  "font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;" +
  "transition:transform 160ms ease-out,background-color 200ms ease,border-color 200ms ease}" +
  ".ghr-btn:active{transform:scale(0.97)}" +
  ".ghr-btn:focus-visible{outline:2px solid var(--focus-ring);outline-offset:3px}" +
  ".ghr-primary{border:0;background:#FFFFFF;color:#0D0A14}" +
  ".ghr-secondary{border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.07);color:#FFFFFF;" +
  "-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}" +
  "@media (hover:hover) and (pointer:fine){.ghr-primary:hover{background:#EFEAE2}.ghr-primary:hover .ghr-arrow{transform:translateX(3px)}" +
  ".ghr-secondary:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.4)}}" +
  "@keyframes ghr-in{from{opacity:0;transform:translateY(12px)}}" +
  "@keyframes ghr-fade{from{opacity:0}}" +
  "@media (prefers-reduced-motion:reduce){.ghr-eyebrow,.ghr-desc,.ghr-actions{animation-name:ghr-fade}}";
