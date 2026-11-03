'use client'

import cn from 'classnames'
import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useSyncExternalStore,
} from 'react'
import * as THREE from 'three'

export interface TerminalRainProps {
    colors?: string[]
    backgroundColor?: string
    mode?: 'auto' | 'light' | 'dark' | 'ink'
    glyphs?: string
    fontFamily?: string
    glyphSize?: number
    spacing?: number
    density?: number
    trail?: number
    speed?: number
    variance?: number
    angle?: number
    shuffle?: number
    mirror?: boolean
    depth?: number
    glow?: number
    intensity?: number
    interactive?: boolean
    bulletTime?: boolean
    slowRadius?: number
    slowStrength?: number
    clickBurst?: boolean
    burstSize?: number
    paused?: boolean
    quality?: number
    className?: string
    style?: React.CSSProperties
    children?: React.ReactNode
}

export interface TerminalRainHandle {
    burst: (x?: number, y?: number) => void
}

const DEFAULT_GLYPHS =
    'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEF'
const DEFAULT_FONT =
    'ui-monospace, "SF Mono", Menlo, Consolas, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", monospace'

const clamp = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, val))

let canvas2DContext: CanvasRenderingContext2D | null = null
const parseColor = (colorStr: string, fallback: [number, number, number]): [number, number, number] => {
    if (!canvas2DContext && typeof document !== 'undefined') {
        const c = document.createElement('canvas')
        canvas2DContext = c.getContext('2d')
    }
    if (!canvas2DContext) return fallback

    canvas2DContext.fillStyle = '#010203'
    canvas2DContext.fillStyle = colorStr
    const resolved = String(canvas2DContext.fillStyle)
    if (resolved === '#010203' && colorStr.trim().toLowerCase() !== '#010203') {
        return fallback
    }

    if (resolved.startsWith('#')) {
        const hex = resolved.slice(1)
        return [
            parseInt(hex.slice(0, 2), 16) / 255,
            parseInt(hex.slice(2, 4), 16) / 255,
            parseInt(hex.slice(4, 6), 16) / 255,
        ]
    }

    const matches = resolved.match(/[\d.]+/g)
    if (!matches || matches.length < 3) return fallback
    return [
        Number(matches[0]) / 255,
        Number(matches[1]) / 255,
        Number(matches[2]) / 255,
    ]
}

const srgbToLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

const srgbToOklab = ([r, g, b]: [number, number, number]): [number, number, number] => {
    const lr = srgbToLinear(r)
    const lg = srgbToLinear(g)
    const lb = srgbToLinear(b)
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ]
}

const HOVER_SHADER = `
uniform vec4 uHover;
uniform float uSlow;

float rateAt(vec2 s) {
  vec2 gap = s - uHover.xy;
  float slow = uSlow * uHover.z * exp(-dot(gap, gap) / (uHover.w * uHover.w));
  return max(1.0 - slow, 0.02);
}
`

const TRANSFORM_SHADER = `
uniform vec2 uCenter;
uniform float uAngle;

vec2 toGrid(vec2 s, vec2 origin, vec2 cell) {
  vec2 d = s - uCenter;
  float c = cos(uAngle);
  float n = sin(uAngle);
  vec2 r = vec2(c * d.x + n * d.y, -n * d.x + c * d.y) + uCenter;
  return (r - origin) / cell;
}

vec2 toScreen(vec2 g, vec2 origin, vec2 cell) {
  vec2 r = origin + g * cell - uCenter;
  float c = cos(uAngle);
  float n = sin(uAngle);
  return vec2(c * r.x - n * r.y, n * r.x + c * r.y) + uCenter;
}
`

const SIMULATION_SHADER = `
precision highp float;
uniform sampler2D uPrevious;
uniform sampler2D uHeads;
uniform vec2 uOrigin;
uniform vec2 uCell;
uniform float uDt;
uniform float uTrail;
uniform float uShuffle;
uniform float uGlyphCount;
uniform float uSeed;
${TRANSFORM_SHADER}
${HOVER_SHADER}
out vec4 fragColor;

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 previous = texelFetch(uPrevious, cell, 0);
  float speed = texelFetch(uHeads, ivec2(0, cell.x), 0).x;
  vec2 screen = toScreen(vec2(cell) + 0.5, uOrigin, uCell);
  float rate = rateAt(screen);
  float tau = uTrail / max(speed, 0.5) / 2.2;
  float light = previous.x * exp(-uDt * rate / tau);
  float glyph = previous.y;
  float row = float(cell.y) + 0.5;
  for (int k = 1; k <= 3; k++) {
    vec4 head = texelFetch(uHeads, ivec2(k, cell.x), 0);
    if (head.z > 0.5 && head.x < row && row <= head.y) {
      light = max(light, clamp(head.z - 0.5, 0.0, 1.0));
      glyph = floor(hash(vec3(vec2(cell), head.w * 97.0 + row)) * uGlyphCount);
    }
  }
  float churn = uShuffle * 2.5 * rate * uDt;
  if (hash(vec3(vec2(cell), uSeed)) < churn) glyph = floor(hash(vec3(vec2(cell) + 17.0, uSeed * 1.7)) * uGlyphCount);
  fragColor = vec4(light, glyph, 0.0, 1.0);
}
`

const VERTEX_SHADER = `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const RENDER_LINES_SHADER = `
precision highp float;
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform vec2 uResolution;
uniform float uMirror;
uniform float uGlyphScale;
uniform vec3 uLabTrail;
uniform vec3 uLabHead;
uniform float uInk;
uniform sampler2D uState0;
uniform sampler2D uHeads0;
uniform vec2 uOrigin0;
uniform vec4 uGrid0;
uniform sampler2D uState1;
uniform sampler2D uHeads1;
uniform vec2 uOrigin1;
uniform vec4 uGrid1;
uniform float uFar;
${TRANSFORM_SHADER}
in vec2 vUv;
out vec4 fragColor;

vec3 labToLinear(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return max(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ), 0.0);
}

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec4 layer(sampler2D state, sampler2D heads, vec2 origin, vec4 grid, float bias) {
  vec2 screen = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 g = toGrid(screen, origin, grid.xy);
  ivec2 cell = ivec2(floor(g));
  if (cell.x < 0 || cell.y < 0 || float(cell.x) >= grid.z || float(cell.y) >= grid.w) return vec4(0.0);
  vec4 data = texelFetch(state, cell, 0);
  float light = data.x;
  float glyph = data.y;
  float head = 0.0;
  for (int k = 1; k <= 3; k++) {
    vec4 h = texelFetch(heads, ivec2(k, cell.x), 0);
    if (h.z > 0.5 && floor(h.y) == float(cell.y)) {
      head = clamp(h.z - 0.5, 0.0, 1.0);
      glyph = floor(hash(vec3(vec2(cell), h.w * 31.0 + floor(h.y * 3.0))) * max(uAtlasGrid.x * uAtlasGrid.y, 1.0));
    }
  }
  if (light < 0.004 && head < 0.5) return vec4(0.0);
  vec2 f = fract(g);
  vec2 local = vec2(f.x - 0.5, f.y - 0.5);
  if (uMirror > 0.5) local.x = -local.x;
  vec2 span = vec2(grid.x / grid.y, 1.0) * 0.84 * uGlyphScale;
  vec2 texel = 0.5 + local * span;
  float inside = step(0.02, texel.x) * step(texel.x, 0.98) * step(0.02, texel.y) * step(texel.y, 0.98);
  float index = mod(glyph, uAtlasGrid.x * uAtlasGrid.y);
  vec2 slot = vec2(mod(index, uAtlasGrid.x), floor(index / uAtlasGrid.x));
  vec2 uv = (slot + texel) / uAtlasGrid;
  vec2 scale = span / uAtlasGrid;
  float coverage = textureGrad(uAtlas, uv, dFdx(g) * scale * exp2(bias), dFdy(g) * scale * exp2(bias)).r * inside;
  float flicker = 0.82 + 0.18 * hash(vec3(vec2(cell), glyph));
  float fresh = smoothstep(0.55, 1.0, light);
  vec3 trailTone = labToLinear(mix(vec3(uLabTrail.x * 0.55, uLabTrail.yz * 0.9), uLabTrail, smoothstep(0.0, 0.6, light)));
  vec3 tone = mix(trailTone, labToLinear(uLabHead), fresh * 0.35);
  vec3 headTone = labToLinear(uLabHead);
  vec3 inkHead = labToLinear(vec3(uLabTrail.x * 0.55, uLabTrail.yz * 1.1));
  headTone = mix(headTone, inkHead, uInk);
  float fade = light * (0.35 + 0.65 * light);
  float energy = coverage * (fade * flicker * 0.8 + head * 0.9);
  vec3 color = mix(tone, headTone, head) * energy;
  return vec4(color, energy);
}

void main() {
  vec4 near = layer(uState0, uHeads0, uOrigin0, uGrid0, 0.0);
  vec4 far = uFar > 0.0 ? layer(uState1, uHeads1, uOrigin1, uGrid1, 1.2) * uFar : vec4(0.0);
  fragColor = near + far;
}
`

const DOWNSAMPLE_SHADER = `
precision highp float;
uniform sampler2D uSource;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 a = texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  vec4 b = texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  vec4 c = texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  vec4 d = texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = (a + b + c + d) * 0.125 + texture(uSource, vUv) * 0.5;
}
`

const UPSAMPLE_SHADER = `
precision highp float;
uniform sampler2D uSource;
uniform sampler2D uBase;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 sum = texture(uSource, vUv) * 4.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 0.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, -1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(0.0, 1.0)) * 2.0;
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, -1.0));
  sum += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0));
  sum += texture(uSource, vUv + uTexel * vec2(1.0, 1.0));
  fragColor = texture(uBase, vUv) + sum / 16.0;
}
`

const COMPOSITE_SHADER = `
precision highp float;
uniform sampler2D uLines;
uniform sampler2D uBloom;
uniform vec3 uBackground;
uniform float uGlow;
uniform float uExposure;
uniform float uMode;
uniform float uGrain;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 encode(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec4 lines = texture(uLines, vUv);
  vec4 bloom = texture(uBloom, vUv);
  vec3 color;
  if (uMode < 0.5) {
    vec3 light = (lines.rgb + bloom.rgb * uGlow) * uExposure;
    vec3 exposed = 1.0 - exp(-light);
    float peak = max(exposed.r, max(exposed.g, exposed.b));
    exposed = mix(exposed, vec3(peak), smoothstep(0.75, 1.0, peak) * 0.35);
    color = uBackground + (1.0 - uBackground) * exposed;
  } else {
    float energy = lines.a + bloom.a * uGlow * 0.2;
    vec3 hue = (lines.rgb + bloom.rgb * uGlow * 0.2) / max(energy, 1e-4);
    float cover = clamp(1.0 - exp(-energy * uExposure * 1.4), 0.0, 0.95);
    color = mix(uBackground, clamp(hue * 0.85, 0.0, 1.0), cover);
  }
  float grain = hash(gl_FragCoord.xy + uGrain * 311.0) - 0.5;
  fragColor = vec4(encode(color) + grain * (1.2 / 255.0), 1.0);
}
`

interface RainLayer {
    cellW: number
    cellH: number
    cols: number
    rows: number
    originX: number
    originY: number
    speedScale: number
    gain: number
    bias: number
    columnSpeed: Float32Array
    heads: Float32Array
    respawn: Float32Array
    headTexture: THREE.DataTexture
    targets: THREE.WebGLRenderTarget[]
    index: number
}

const subscribeReducedMotion = (cb: () => void) => {
    if (typeof window === 'undefined') return () => { }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    media.addEventListener('change', cb)
    return () => media.removeEventListener('change', cb)
}

const getReducedMotionSnapshot = () =>
    typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

export const TerminalRain = forwardRef<TerminalRainHandle, TerminalRainProps>(
    function TerminalRain(
        {
            colors = ['#25dd14ff', '#d4fafcff'],
            backgroundColor = '#0A0A0A',
            mode = 'auto',
            glyphs = DEFAULT_GLYPHS,
            fontFamily = DEFAULT_FONT,
            glyphSize = 18,
            spacing = 1,
            density = 0.45,
            trail = 16,
            speed = 1,
            variance = 0.5,
            angle = 0,
            shuffle = 0.35,
            mirror = false,
            depth = 0.6,
            glow = 0.22,
            intensity = 1,
            interactive = true,
            bulletTime = true,
            slowRadius = 170,
            slowStrength = 0.6,
            clickBurst = true,
            burstSize = 1,
            paused = false,
            quality = 1,
            className,
            style,
            children,
        },
        ref,
    ) {
        const containerRef = useRef<HTMLDivElement | null>(null)
        const runnerRef = useRef<{
            sync: () => void
            destroy: () => void
            burst: (x: number, y: number) => void
        } | null>(null)
        const reducedMotion = useSyncExternalStore(
            subscribeReducedMotion,
            getReducedMotionSnapshot,
            () => false,
        )

        const configRef = useRef({
            colors,
            backgroundColor,
            mode,
            glyphs,
            fontFamily,
            glyphSize,
            spacing,
            density,
            trail,
            speed,
            variance,
            angle,
            shuffle,
            mirror,
            depth,
            glow,
            intensity,
            interactive,
            bulletTime,
            slowRadius,
            slowStrength,
            clickBurst,
            burstSize,
            paused,
            quality,
            reduced: reducedMotion,
        })

        useEffect(() => {
            configRef.current = {
                colors,
                backgroundColor,
                mode,
                glyphs,
                fontFamily,
                glyphSize,
                spacing,
                density,
                trail,
                speed,
                variance,
                angle,
                shuffle,
                mirror,
                depth,
                glow,
                intensity,
                interactive,
                bulletTime,
                slowRadius,
                slowStrength,
                clickBurst,
                burstSize,
                paused,
                quality,
                reduced: reducedMotion,
            }
            runnerRef.current?.sync()
        })

        useEffect(() => {
            const container = containerRef.current
            if (!container) return

            const canvas = document.createElement('canvas')
            canvas.setAttribute('aria-hidden', 'true')
            canvas.style.position = 'absolute'
            canvas.style.inset = '0'
            canvas.style.width = '100%'
            canvas.style.height = '100%'
            canvas.style.display = 'block'
            canvas.style.pointerEvents = 'none'
            container.prepend(canvas)

            let renderer: THREE.WebGLRenderer
            try {
                renderer = new THREE.WebGLRenderer({
                    canvas,
                    alpha: false,
                    antialias: false,
                    powerPreference: 'high-performance',
                })
            } catch {
                canvas.remove()
                return
            }

            if (!renderer.capabilities.isWebGL2) {
                renderer.dispose()
                canvas.remove()
                return
            }

            renderer.autoClear = false

            const hasFloat = renderer.extensions.has('EXT_color_buffer_float')
            const floatType =
                hasFloat || renderer.extensions.has('EXT_color_buffer_half_float')
                    ? THREE.FloatType
                    : THREE.HalfFloatType
            const targetType = hasFloat ? THREE.FloatType : THREE.HalfFloatType

            const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
            const quadGeometry = new THREE.PlaneGeometry(2, 2)

            const hoverState = {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                goalX: 0,
                goalY: 0,
                amount: 0,
                inside: false,
                placed: false,
            }

            const hoverUniforms = {
                uHover: { value: new THREE.Vector4(0, 0, 0, 100) },
                uSlow: { value: 0.9 },
            }

            const transformUniforms = {
                uCenter: { value: new THREE.Vector2() },
                uAngle: { value: 0 },
            }

            const createShaderMat = (fragmentShader: string, uniforms: Record<string, { value: any }>) =>
                new THREE.ShaderMaterial({
                    glslVersion: THREE.GLSL3,
                    uniforms,
                    vertexShader: VERTEX_SHADER,
                    fragmentShader,
                    depthTest: false,
                    depthWrite: false,
                    blending: THREE.NoBlending,
                })

            const simMat = createShaderMat(SIMULATION_SHADER, {
                ...hoverUniforms,
                ...transformUniforms,
                uPrevious: { value: null },
                uHeads: { value: null },
                uOrigin: { value: new THREE.Vector2() },
                uCell: { value: new THREE.Vector2(1, 1) },
                uDt: { value: 0 },
                uTrail: { value: 16 },
                uShuffle: { value: 0.4 },
                uGlyphCount: { value: 1 },
                uSeed: { value: 0 },
            })

            const linesMat = createShaderMat(RENDER_LINES_SHADER, {
                ...transformUniforms,
                uAtlas: { value: null },
                uAtlasGrid: { value: new THREE.Vector2(16, 1) },
                uResolution: { value: new THREE.Vector2(1, 1) },
                uMirror: { value: 0 },
                uGlyphScale: { value: 1 },
                uLabTrail: { value: new THREE.Vector3() },
                uLabHead: { value: new THREE.Vector3() },
                uInk: { value: 0 },
                uState0: { value: null },
                uHeads0: { value: null },
                uOrigin0: { value: new THREE.Vector2() },
                uGrid0: { value: new THREE.Vector4(1, 1, 1, 1) },
                uState1: { value: null },
                uHeads1: { value: null },
                uOrigin1: { value: new THREE.Vector2() },
                uGrid1: { value: new THREE.Vector4(1, 1, 1, 1) },
                uFar: { value: 0 },
            })

            const downsampleMat = createShaderMat(DOWNSAMPLE_SHADER, {
                uSource: { value: null },
                uTexel: { value: new THREE.Vector2() },
            })

            const upsampleMat = createShaderMat(UPSAMPLE_SHADER, {
                uSource: { value: null },
                uBase: { value: null },
                uTexel: { value: new THREE.Vector2() },
            })

            const compositeMat = createShaderMat(COMPOSITE_SHADER, {
                uLines: { value: null },
                uBloom: { value: null },
                uBackground: { value: new THREE.Vector3() },
                uGlow: { value: 0.5 },
                uExposure: { value: 1.4 },
                uMode: { value: 0 },
                uGrain: { value: 0 },
            })

            const quadMesh = new THREE.Mesh(quadGeometry, compositeMat)
            quadMesh.frustumCulled = false

            const quadScene = new THREE.Scene()
            quadScene.add(quadMesh)

            const makeRenderTarget = (
                w: number,
                h: number,
                type: THREE.TextureDataType,
                filter: THREE.MagnificationTextureFilter,
            ) =>
                new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
                    type,
                    format: THREE.RGBAFormat,
                    minFilter: filter,
                    magFilter: filter,
                    depthBuffer: false,
                    stencilBuffer: false,
                    generateMipmaps: false,
                })

            let mainTarget: THREE.WebGLRenderTarget | null = null
            let downTargets: THREE.WebGLRenderTarget[] = []
            let upTargets: THREE.WebGLRenderTarget[] = []
            let layers: RainLayer[] = []
            let atlasKey = ''
            let atlasCache: { texture: THREE.CanvasTexture; count: number; rows: number } | null = null
            let layerKey = ''
            let isDestroyed = false
            let rafId = 0
            let lastTime = 0
            let isIntersecting = true
            let viewWidth = 1
            let viewHeight = 1
            let dpr = 1
            let grainSeed = 0
            let rngState = 97

            const nextRandom = () => {
                rngState = (16807 * rngState) % 0x7fffffff
                return rngState / 0x7fffffff
            }

            const cleanRenderTargets = () => {
                mainTarget?.dispose()
                downTargets.forEach((t) => t.dispose())
                upTargets.forEach((t) => t.dispose())
                mainTarget = null
                downTargets = []
                upTargets = []
            }

            const cleanLayers = () => {
                layers.forEach((l) => {
                    l.targets.forEach((t) => t.dispose())
                    l.headTexture.dispose()
                })
                layers = []
            }

            const renderPass = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
                quadMesh.material = material
                renderer.setRenderTarget(target)
                renderer.render(quadScene, camera)
            }

            const buildAtlas = () => {
                const s = configRef.current
                const chars = String(s.glyphs ?? '') || DEFAULT_GLYPHS
                const font = String(s.fontFamily ?? '') || DEFAULT_FONT
                const pxSize = Math.round(
                    clamp(clamp(s.glyphSize ?? 18, 6, 64) * dpr * 1.25, 16, 128),
                )
                const key = `${chars}|${font}|${pxSize}`

                if (key !== atlasKey || !atlasCache) {
                    atlasKey = key
                    atlasCache?.texture.dispose()

                    const set = Array.from(new Set(Array.from(chars.replace(/\s/g, '')))).slice(0, 512)
                    if (!set.length) set.push('0', '1')

                    const cols = 16
                    const rows = Math.ceil(set.length / cols)
                    const atlasCanvas = document.createElement('canvas')
                    atlasCanvas.width = cols * pxSize
                    atlasCanvas.height = rows * pxSize

                    const ctx = atlasCanvas.getContext('2d')
                    if (ctx) {
                        ctx.fillStyle = '#000000'
                        ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height)
                        ctx.fillStyle = '#ffffff'
                        ctx.textAlign = 'center'
                        ctx.textBaseline = 'middle'
                        ctx.font = `500 ${Math.round(0.78 * pxSize)}px ${font}`
                        set.forEach((char, i) => {
                            const y = Math.floor(i / cols) * pxSize + pxSize / 2 + 0.04 * pxSize
                            ctx.fillText(char, (i % cols) * pxSize + pxSize / 2, y)
                        })
                    }

                    const texture = new THREE.CanvasTexture(atlasCanvas)
                    texture.minFilter = THREE.LinearMipmapLinearFilter
                    texture.magFilter = THREE.LinearFilter
                    texture.generateMipmaps = true
                    texture.colorSpace = THREE.SRGBColorSpace
                    texture.flipY = false
                    texture.anisotropy = 4
                    texture.needsUpdate = true

                    atlasCache = { texture, count: set.length, rows }
                    linesMat.uniforms.uAtlas.value = atlasCache.texture
                    linesMat.uniforms.uAtlasGrid.value.set(16, atlasCache.rows)
                    simMat.uniforms.uGlyphCount.value = atlasCache.count
                }
            }

            const getSlowFactor = (x: number, y: number) => {
                const dx = x - hoverState.x
                const dy = y - hoverState.y
                const radius = hoverUniforms.uHover.value.w
                return Math.max(
                    1 -
                    clamp(configRef.current.slowStrength ?? 0.6, 0, 1) *
                    hoverState.amount *
                    Math.exp(-(dx * dx + dy * dy) / (radius * radius)),
                    0.02,
                )
            }

            const calcRespawn = (colRatio: number, index: number) =>
                colRatio *
                (1 / (clamp(configRef.current.density ?? 0.45, 0.02, 1) * (index === 0 ? 1 : 0.3)) - 1) *
                (0.4 + 1.2 * nextRandom())

            const createLayer = (
                scale: number,
                speedMultiplier: number,
                gain: number,
                bias: number,
            ): RainLayer => {
                const s = configRef.current
                const w = viewWidth * dpr
                const h = viewHeight * dpr
                const gSize = clamp(s.glyphSize ?? 18, 6, 64) * dpr * scale
                const cellW = 0.68 * gSize * clamp(s.spacing ?? 1, 0.6, 3)
                const cellH = 1.05 * gSize
                const rad = (clamp(s.angle ?? 0, -80, 80) * Math.PI) / 180

                const cols = Math.ceil((w * Math.abs(Math.cos(rad)) + h * Math.abs(Math.sin(rad))) / cellW) + 2
                const rows = Math.ceil((w * Math.abs(Math.sin(rad)) + h * Math.abs(Math.cos(rad))) / cellH) + 2

                const originX = w / 2 - (cols * cellW) / 2
                const originY = h / 2 - (rows * cellH) / 2

                const colSpeed = new Float32Array(cols)
                const heads = new Float32Array(4 * cols * 4)
                const respawn = new Float32Array(3 * cols)

                const variance = clamp(s.variance ?? 0.5, 0, 1)
                const baseSpeed = Math.max(9 * clamp(s.speed ?? 1, 0, 5) * speedMultiplier, 0.5)

                for (let c = 0; c < cols; c++) {
                    colSpeed[c] = Math.max(0.3, 1 + (2 * nextRandom() - 1) * variance * 0.75)
                    const spd = baseSpeed * colSpeed[c]
                    const travelTime = (rows + 3) / spd

                    for (let l = 0; l < 3; l++) {
                        const headOffset = (4 * c + l + 1) * 4
                        if (l === 2) {
                            heads.set([0, 0, 0, nextRandom()], headOffset)
                            respawn[3 * c + l] = Infinity
                            continue
                        }
                        const rWait = calcRespawn(travelTime, l)
                        const rnd = nextRandom() * (travelTime + rWait)
                        if (rnd < travelTime) {
                            const initY = -2 + rnd * spd
                            heads.set([initY, initY, 1.5, nextRandom()], headOffset)
                        } else {
                            heads.set([0, 0, 0, nextRandom()], headOffset)
                            respawn[3 * c + l] = rnd - travelTime
                        }
                    }
                }

                const headTexture = new THREE.DataTexture(heads, 4, cols, THREE.RGBAFormat, THREE.FloatType)
                headTexture.minFilter = THREE.NearestFilter
                headTexture.magFilter = THREE.NearestFilter
                headTexture.needsUpdate = true

                const targets = [0, 1].map(() => makeRenderTarget(cols, rows, targetType, THREE.NearestFilter))
                for (const t of targets) {
                    renderer.setRenderTarget(t)
                    renderer.setClearColor(0, 0)
                    renderer.clear()
                }

                return {
                    cellW,
                    cellH,
                    cols,
                    rows,
                    originX,
                    originY,
                    speedScale: speedMultiplier,
                    gain,
                    bias,
                    columnSpeed: colSpeed,
                    heads,
                    respawn,
                    headTexture,
                    targets,
                    index: 0,
                }
            }

            const toScreenCoord = (layer: RainLayer, col: number, row: number): [number, number] => {
                const angle = transformUniforms.uAngle.value
                const hw = (viewWidth * dpr) / 2
                const hh = (viewHeight * dpr) / 2
                const rx = layer.originX + col * layer.cellW - hw
                const ry = layer.originY + row * layer.cellH - hh
                const c = Math.cos(angle)
                const s = Math.sin(angle)
                return [c * rx - s * ry + hw, s * rx + c * ry + hh]
            }

            const updateLayerHeads = (layer: RainLayer, dt: number) => {
                const spd = 9 * clamp(configRef.current.speed ?? 1, 0, 5) * layer.speedScale

                for (let c = 0; c < layer.cols; c++) {
                    const cSpeed = spd * layer.columnSpeed[c]
                    layer.heads[4 * c * 4] = cSpeed

                    for (let l = 0; l < 3; l++) {
                        const headOffset = (4 * c + l + 1) * 4
                        const rOffset = 3 * c + l

                        if (layer.heads[headOffset + 2] > 0.5) {
                            if (layer.heads[headOffset + 2] < 1.5) {
                                layer.heads[headOffset + 2] = Math.min(
                                    1.5,
                                    layer.heads[headOffset + 2] + dt / 0.3,
                                )
                            }
                            const prevY = layer.heads[headOffset + 1]
                            const [scrX, scrY] = toScreenCoord(layer, c + 0.5, prevY)
                            layer.heads[headOffset] = prevY
                            layer.heads[headOffset + 1] = prevY + cSpeed * getSlowFactor(scrX, scrY) * dt

                            if (layer.heads[headOffset + 1] > layer.rows + 1) {
                                layer.heads[headOffset + 2] = 0
                                layer.respawn[rOffset] =
                                    l === 2
                                        ? Infinity
                                        : calcRespawn((layer.rows + 3) / Math.max(cSpeed, 0.5), l)
                            }
                        } else if (layer.respawn[rOffset] !== Infinity) {
                            layer.respawn[rOffset] -= dt
                            if (layer.respawn[rOffset] <= 0) {
                                const newY = l === 2 ? layer.heads[headOffset + 1] : -2 - 2 * nextRandom()
                                layer.heads.set([newY, newY, l === 2 ? 0.52 : 1.5, nextRandom()], headOffset)
                            }
                        }
                    }
                }
                layer.headTexture.needsUpdate = true
            }

            const stepLayerSimulation = (layer: RainLayer, dt: number) => {
                const s = configRef.current
                const u = simMat.uniforms
                u.uPrevious.value = layer.targets[layer.index].texture
                u.uHeads.value = layer.headTexture
                u.uOrigin.value.set(layer.originX, layer.originY)
                u.uCell.value.set(layer.cellW, layer.cellH)
                u.uDt.value = dt
                u.uTrail.value = clamp(s.trail ?? 16, 2, 80)
                u.uShuffle.value = clamp(s.shuffle ?? 0.35, 0, 1)
                u.uSeed.value = 1000 * nextRandom()

                renderPass(simMat, layer.targets[1 - layer.index])
                layer.index = 1 - layer.index
            }

            const setupLayers = () => {
                const s = configRef.current
                const depthVal = clamp(s.depth ?? 0.6, 0, 1)
                const key = [
                    viewWidth,
                    viewHeight,
                    dpr,
                    s.glyphSize,
                    s.spacing,
                    s.angle,
                    depthVal > 0,
                    s.variance,
                ].join('|')

                if (key === layerKey && layers.length) return
                layerKey = key
                cleanLayers()

                transformUniforms.uAngle.value = (clamp(s.angle ?? 0, -80, 80) * Math.PI) / 180
                transformUniforms.uCenter.value.set((viewWidth * dpr) / 2, (viewHeight * dpr) / 2)

                layers = [createLayer(1, 1, 1, 0)]
                if (depthVal > 0) {
                    layers.push(createLayer(0.62, 0.58, 1, 1.2))
                }

                const warmupDt = 1 / 30
                for (let t = 0; t < 3; t += warmupDt) {
                    for (const lyr of layers) {
                        updateLayerHeads(lyr, warmupDt)
                        stepLayerSimulation(lyr, warmupDt)
                    }
                }
            }

            const updateRenderUniforms = () => {
                const s = configRef.current
                const w = viewWidth * dpr
                const h = viewHeight * dpr
                const bgRgb = parseColor(s.backgroundColor || '#0A0A0A', [0.04, 0.04, 0.04])
                const luminance = 0.2126 * bgRgb[0] + 0.7152 * bgRgb[1] + 0.0722 * bgRgb[2]
                const isInk = s.mode === 'ink' || (s.mode === 'auto' && luminance > 0.5)

                const c0 = srgbToOklab(parseColor(s.colors?.[0] || '#9D7BFF', [0.6, 0.48, 1]))
                const c1 = srgbToOklab(parseColor(s.colors?.[1] || '#FFD6F5', [1, 0.84, 0.96]))

                const lu = linesMat.uniforms
                lu.uResolution.value.set(w, h)
                lu.uMirror.value = s.mirror ? 1 : 0
                lu.uLabTrail.value.set(c0[0], c0[1], c0[2])
                lu.uLabHead.value.set(c1[0], c1[1], c1[2])
                lu.uInk.value = isInk ? 1 : 0

                const l0 = layers[0]
                if (l0) {
                    lu.uState0.value = l0.targets[l0.index].texture
                    lu.uHeads0.value = l0.headTexture
                    lu.uOrigin0.value.set(l0.originX, l0.originY)
                    lu.uGrid0.value.set(l0.cellW, l0.cellH, l0.cols, l0.rows)
                }

                const l1 = layers[1]
                lu.uFar.value = l1 ? 0.32 * clamp(s.depth ?? 0.6, 0, 1) : 0
                if (l1) {
                    lu.uState1.value = l1.targets[l1.index].texture
                    lu.uHeads1.value = l1.headTexture
                    lu.uOrigin1.value.set(l1.originX, l1.originY)
                    lu.uGrid1.value.set(l1.cellW, l1.cellH, l1.cols, l1.rows)
                }

                hoverUniforms.uSlow.value = clamp(s.slowStrength ?? 0.6, 0, 1)
                hoverUniforms.uHover.value.set(
                    hoverState.x,
                    hoverState.y,
                    hoverState.amount,
                    clamp(s.slowRadius ?? 170, 20, 800) * dpr,
                )

                const cu = compositeMat.uniforms
                cu.uBackground.value.set(srgbToLinear(bgRgb[0]), srgbToLinear(bgRgb[1]), srgbToLinear(bgRgb[2]))
                cu.uGlow.value = clamp(s.glow ?? 0.22, 0, 3)
                cu.uExposure.value = (isInk ? 5 : 1.25) * clamp(s.intensity ?? 1, 0, 4)
                cu.uMode.value = isInk ? 1 : 0
                cu.uGrain.value = grainSeed
            }

            const renderFrame = () => {
                if (!mainTarget || !downTargets.length) return

                buildAtlas()
                setupLayers()
                updateRenderUniforms()

                renderPass(linesMat, mainTarget)

                let currentSource = mainTarget
                for (const dt of downTargets) {
                    downsampleMat.uniforms.uSource.value = currentSource.texture
                    downsampleMat.uniforms.uTexel.value.set(1 / currentSource.width, 1 / currentSource.height)
                    renderPass(downsampleMat, dt)
                    currentSource = dt
                }

                let currentBloom = downTargets[downTargets.length - 1]
                for (let i = downTargets.length - 2; i >= 0; i--) {
                    upsampleMat.uniforms.uSource.value = currentBloom.texture
                    upsampleMat.uniforms.uBase.value = downTargets[i].texture
                    upsampleMat.uniforms.uTexel.value.set(1 / currentBloom.width, 1 / currentBloom.height)
                    renderPass(upsampleMat, upTargets[i])
                    currentBloom = upTargets[i]
                }

                compositeMat.uniforms.uLines.value = mainTarget.texture
                compositeMat.uniforms.uBloom.value = currentBloom.texture
                renderPass(compositeMat, null)
            }

            const animationLoop = (now: number) => {
                rafId = 0
                if (isDestroyed) return

                const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000))
                lastTime = now

                const s = configRef.current
                const hoverGoal =
                    hoverState.inside && s.interactive && s.bulletTime && !s.reduced ? 1 : 0

                hoverState.amount += (hoverGoal - hoverState.amount) * (1 - Math.exp(-dt / 0.35))
                hoverState.vx += (81 * (hoverState.goalX - hoverState.x) - 18 * hoverState.vx) * dt
                hoverState.vy += (81 * (hoverState.goalY - hoverState.y) - 18 * hoverState.vy) * dt
                hoverState.x += hoverState.vx * dt
                hoverState.y += hoverState.vy * dt

                if (!s.paused && !s.reduced) {
                    buildAtlas()
                    setupLayers()
                    updateRenderUniforms()
                    for (const lyr of layers) {
                        updateLayerHeads(lyr, dt)
                        stepLayerSimulation(lyr, dt)
                    }
                    grainSeed = (grainSeed + 0.618034) % 1
                }

                renderFrame()

                const active = !s.paused && !s.reduced
                const hoverActive =
                    Math.abs(hoverState.amount - (hoverState.inside && s.bulletTime ? 1 : 0)) > 0.002

                if (isIntersecting && !document.hidden && (active || hoverActive)) {
                    rafId = requestAnimationFrame(animationLoop)
                }
            }

            const wake = () => {
                if (!isDestroyed && !rafId && isIntersecting && !document.hidden) {
                    lastTime = performance.now()
                    rafId = requestAnimationFrame(animationLoop)
                }
            }

            const handleResize = () => {
                const rect = container.getBoundingClientRect()
                viewWidth = Math.max(1, rect.width)
                viewHeight = Math.max(1, rect.height)
                dpr = Math.min(window.devicePixelRatio || 1, 2) * clamp(configRef.current.quality ?? 1, 0.25, 1)

                renderer.setPixelRatio(dpr)
                renderer.setSize(viewWidth, viewHeight, false)

                const pixelW = Math.round(viewWidth * dpr)
                const pixelH = Math.round(viewHeight * dpr)

                cleanRenderTargets()
                mainTarget = makeRenderTarget(pixelW, pixelH, floatType, THREE.LinearFilter)

                const downLevels = clamp(Math.floor(Math.log2(Math.min(pixelW, pixelH) / 8)), 3, 7)
                for (let i = 1; i <= downLevels; i++) {
                    downTargets.push(makeRenderTarget(pixelW >> i, pixelH >> i, floatType, THREE.LinearFilter))
                    upTargets.push(makeRenderTarget(pixelW >> i, pixelH >> i, floatType, THREE.LinearFilter))
                }

                renderFrame()
                wake()
            }

            const getRelativeCoords = (e: MouseEvent | PointerEvent): [number, number] => {
                const rect = container.getBoundingClientRect()
                return [(e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr]
            }

            const onPointerMove = (e: PointerEvent) => {
                if (e.pointerType === 'touch' || !configRef.current.interactive) return
                const [x, y] = getRelativeCoords(e)
                hoverState.goalX = x
                hoverState.goalY = y
                if (!hoverState.placed) {
                    hoverState.x = x
                    hoverState.y = y
                    hoverState.placed = true
                }
                if (!hoverState.inside) {
                    hoverState.inside = true
                    wake()
                }
            }

            const onPointerLeave = () => {
                hoverState.inside = false
                hoverState.placed = hoverState.amount > 0.01
                wake()
            }

            const spawnBurst = (x: number, y: number) => {
                const s = configRef.current
                if (s.reduced || s.paused) return
                const bSize = clamp(s.burstSize ?? 1, 0, 3)
                if (bSize <= 0) return

                layers.forEach((lyr, lIdx) => {
                    const angle = transformUniforms.uAngle.value
                    const hw = (viewWidth * dpr) / 2
                    const hh = (viewHeight * dpr) / 2
                    const dx = x - hw
                    const dy = y - hh
                    const c = Math.cos(angle)
                    const sn = Math.sin(angle)

                    const col = (c * dx + sn * dy + hw - lyr.originX) / lyr.cellW
                    const row = (-sn * dx + c * dy + hh - lyr.originY) / lyr.cellH

                    const radius = Math.max(1, Math.round((lIdx === 0 ? 6 : 8) * bSize))
                    const centerCol = Math.floor(col)

                    for (let cIdx = centerCol - radius; cIdx <= centerCol + radius; cIdx++) {
                        if (cIdx < 0 || cIdx >= lyr.cols) continue
                        const distNorm = Math.abs(cIdx - centerCol) / radius
                        if (nextRandom() > Math.exp(-distNorm * distNorm * 2.2) * (lIdx === 0 ? 0.95 : 0.6)) {
                            continue
                        }
                        const headOffset = (4 * cIdx + 2 + 1) * 4
                        const rOffset = 3 * cIdx + 2
                        if (lyr.heads[headOffset + 2] > 0.5) continue

                        const initY = row - 0.5 - 1.5 * nextRandom()
                        lyr.heads.set([initY, initY, 0, nextRandom()], headOffset)
                        lyr.respawn[rOffset] = distNorm * radius * 0.045 + 0.06 * nextRandom()
                    }
                })
                wake()
            }

            const onPointerDown = (e: PointerEvent) => {
                const target = e.target as HTMLElement | null
                if (target?.closest('button, input, textarea, a, select, [role="button"], form')) return
                const s = configRef.current
                if (e.button !== 0 || !s.interactive || !s.clickBurst) return
                const [x, y] = getRelativeCoords(e)
                spawnBurst(x, y)
            }

            container.addEventListener('pointermove', onPointerMove)
            container.addEventListener('pointerleave', onPointerLeave)
            container.addEventListener('pointercancel', onPointerLeave)
            container.addEventListener('pointerdown', onPointerDown)

            const resizeObserver = new ResizeObserver(handleResize)
            resizeObserver.observe(container)

            const intersectionObserver = new IntersectionObserver(
                (entries) => {
                    isIntersecting = entries.some((e) => e.isIntersecting)
                    if (isIntersecting) wake()
                },
                { rootMargin: '80px' },
            )
            intersectionObserver.observe(container)

            const onVisibilityChange = () => {
                if (!document.hidden) wake()
            }
            document.addEventListener('visibilitychange', onVisibilityChange)

            const onContextLost = (e: Event) => e.preventDefault()
            canvas.addEventListener('webglcontextlost', onContextLost)

            handleResize()

            runnerRef.current = {
                sync: () => {
                    const targetDpr =
                        Math.min(window.devicePixelRatio || 1, 2) *
                        clamp(configRef.current.quality ?? 1, 0.25, 1)
                    if (Math.abs(targetDpr - dpr) > 0.001) {
                        handleResize()
                    } else {
                        renderFrame()
                    }
                    wake()
                },
                destroy: () => {
                    isDestroyed = true
                    cancelAnimationFrame(rafId)
                    container.removeEventListener('pointermove', onPointerMove)
                    container.removeEventListener('pointerleave', onPointerLeave)
                    container.removeEventListener('pointercancel', onPointerLeave)
                    container.removeEventListener('pointerdown', onPointerDown)
                    document.removeEventListener('visibilitychange', onVisibilityChange)
                    canvas.removeEventListener('webglcontextlost', onContextLost)
                    resizeObserver.disconnect()
                    intersectionObserver.disconnect()
                    cleanRenderTargets()
                    cleanLayers()
                    atlasCache?.texture.dispose()
                    quadGeometry.dispose()
                        ;[simMat, linesMat, downsampleMat, upsampleMat, compositeMat].forEach((m) => m.dispose())
                    renderer.dispose()
                    renderer.forceContextLoss()
                    canvas.remove()
                },
                burst: (bx: number, by: number) => {
                    spawnBurst(
                        clamp(bx, 0, 1) * viewWidth * dpr,
                        clamp(by, 0, 1) * viewHeight * dpr,
                    )
                },
            }

            return () => {
                runnerRef.current?.destroy()
                runnerRef.current = null
            }
        }, [])

        useImperativeHandle(
            ref,
            () => ({
                burst: (x = 0.5, y = 0.3) => runnerRef.current?.burst(x, y),
            }),
            [],
        )

        return (
            <div
                ref={containerRef}
                className={cn('relative isolate h-full min-h-[240px] w-full overflow-hidden', className)}
                style={{ backgroundColor, ...style }}
            >
                {children && <div className="relative z-10 h-full w-full">{children}</div>}
            </div>
        )
    },
)

TerminalRain.displayName = 'TerminalRain'

export default TerminalRain
