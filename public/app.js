import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { io } from "/socket.io/socket.io.esm.min.js";

const socket = io({ autoConnect: false, query: { role: "participant" } });
const canvas = document.getElementById("world3d");
const hud = document.getElementById("hud");
const taskBannerEl = document.getElementById("taskBanner");
const taskTitleEl = document.getElementById("taskTitle");
const taskBodyEl = document.getElementById("taskBody");
const damageBarWrapEl = document.getElementById("damageBarWrap");
const damageBarTitleEl = document.getElementById("damageBarTitle");
const damageBarStatsEl = document.getElementById("damageBarStats");
const damageBarHealthEl = document.getElementById("damageBarHealth");
const damageBarLossEl = document.getElementById("damageBarLoss");
// URL-encoded session config, e.g. /?quality=low&rings=1&shadows=0 (performance / sharing)
const URLP = new URLSearchParams(window.location.search);
const URL_QUALITY = (URLP.get("quality") || "auto").toLowerCase();
const URL_RINGS = URLP.has("rings") ? Math.max(0, Math.min(3, parseInt(URLP.get("rings"), 10) || 0)) : null;
const LOW_END = URL_QUALITY === "low";

const state = {
  world: { width: 90, height: 70 },
  you: null,
  yourTag: "",
  yourRole: "normal",
  yourGroup: "A",
  inOasis: false,
  yourScore: 100,
  yourDamage: 0,
  yourBumps: 0,
  bumpingNow: false,
  youAreDead: false,
  deadLeftSec: 0,
  stoppedByCollision: false,
  informedTargetDeg: null,
  phase: "bots_only",
  counts: { humans: 0, bots: 0, total: 0 },
  config: {
    boundaryMode: "hex_torus",
    hexSpacing: 20,
    hexRings: 2,
    mirrorGhosts: true,
    showScarves: true,
    showTags: false,
    oasisEnabled: false,
    oasisShowHint: true,
    oasisX: 62,
    oasisY: 35,
    oasisRadius: 11,
    humanSize: 1.0,
    botSize: 1.0,
    humanSpeed: 6.2,
    botSpeed: 5.5,
    speedVariance: 0.15,
    stopAndGoEnabled: false,
    collisionScoreEnabled: false,
    collisionRadius: 1.25,
    collisionStopDist: 2.1,
    randomWalkTurnRate: 0.12,
    randomWalkSpeedJitter: 0.15,
  },
  instruction: { title: "", body: "" },
  activePreset: "",
  selfCanon: null, // last canonical (torus) position of self {x,y}
  selfContinuous: null, // unwrapped continuous position of self {x,y}
  lastBoundary: "",
  perf: { emaMs: 16, frames: 0, ringCap: 99, degraded: false },
  looming: null, // { startMs, durationMs, approachAngle }
  input: { up: false, down: false, left: false, right: false, aim: 0, pitch: 0 },
  look: { yaw: 0, pitch: -0.05 },
  pointerLocked: false,
  draggingLook: false,
  lastMouseX: 0,
  lastMouseY: 0,
};

const CAPTURE = URLP.get("capture") === "1";
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !LOW_END,
  powerPreference: "high-performance",
  preserveDrawingBuffer: CAPTURE,
});
renderer.setPixelRatio(LOW_END ? 1 : Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !LOW_END && URLP.get("shadows") !== "0";
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);
camera.rotation.order = "YXZ";
camera.position.set(state.world.width / 2, 1.7, state.world.height / 2);

const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x4d7c3f, 1.2);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xfff4d4, 1.65);
dir.position.set(45 + 34, 65, 35 + 28);
dir.target.position.set(45, 0, 35);
scene.add(dir.target);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
dir.shadow.camera.near = 10;
dir.shadow.camera.far = 190;
dir.shadow.camera.left = -65;
dir.shadow.camera.right = 65;
dir.shadow.camera.top = 55;
dir.shadow.camera.bottom = -55;
dir.shadow.bias = -0.0003;
scene.add(dir);

const FOG_HEX = 0xc4cfc0;
const FOG_RGB = "196, 207, 192";
scene.fog = new THREE.FogExp2(FOG_HEX, 0.034); // thick atmospheric mist shrouds distant replicas so LOD/culling is invisible

// Legacy hazeSkirt kept disabled (skybox equator mist + linear scene.fog now dissolve the horizon seamlessly)
const hazeSkirt = null;

const worldDecor = {
  ground: null,
  oasisMesh: null,
  informedBeacon: null,
  loomingMesh: null,
};

const agentVisuals = new Map();
const forwardVec = new THREE.Vector3();
const tmpVec3 = new THREE.Vector3();
const textureLoader = new THREE.TextureLoader();
const cubeTextureLoader = new THREE.CubeTextureLoader();
const gltfLoader = new GLTFLoader();
let foxAsset = null;

// --- Hex torus maths (mirrors server): canonical positions live in one hex cell, rendered infinitely ---
function hexS() { return Math.max(6, Number(state.config.hexSpacing) || 20); }
function isHexMode() { return state.config.boundaryMode === "hex_torus" && state.config.mirrorGhosts !== false; }
function worldToLat(x, y) { const s = hexS(); const v = y / (s * (Math.sqrt(3) / 2)); return { u: x / s - v / 2, v }; }
function latToWorld(u, v) { const s = hexS(); return { x: s * (u + v / 2), y: s * (Math.sqrt(3) / 2) * v }; }
function wrapLat(c) { return c - Math.floor(c + 0.5); }
const HEX_VORONOI_SHIFTS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 1],
  [1, -1],
];
function torusDeltaClient(ax, ay, bx, by) {
  const s = hexS();
  const rt3h = Math.sqrt(3) / 2;
  const la = worldToLat(ax, ay);
  const lb = worldToLat(bx, by);
  const u0 = wrapLat(lb.u - la.u);
  const v0 = wrapLat(lb.v - la.v);
  let bestX = 0;
  let bestY = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < HEX_VORONOI_SHIFTS.length; i += 1) {
    const u = u0 + HEX_VORONOI_SHIFTS[i][0];
    const v = v0 + HEX_VORONOI_SHIFTS[i][1];
    const wx = s * (u + v * 0.5);
    const wy = s * rt3h * v;
    const d2 = wx * wx + wy * wy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestX = wx;
      bestY = wy;
    }
  }
  return { x: bestX, y: bestY };
}
function hexGhostOffsets(rings) {
  const out = [];
  const s = hexS();
  const rt3h = Math.sqrt(3) / 2;
  for (let q = -rings; q <= rings; q += 1) {
    for (let r = -rings; r <= rings; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > rings) continue;
      if (q === 0 && r === 0) continue;
      out.push({ x: s * (q + r / 2), z: s * rt3h * r });
    }
  }
  return out;
}
function buildNeckerchiefGeometry() {
  const collar = new THREE.TorusGeometry(0.30, 0.042, 10, 28);
  collar.rotateY(Math.PI / 2);
  collar.translate(0.50, 1.16, 0);
  const kerchief = new THREE.ConeGeometry(0.20, 0.44, 3);
  kerchief.scale(1, 1, 0.38);
  kerchief.rotateX(Math.PI);
  kerchief.rotateY(Math.PI / 2);
  kerchief.translate(0.60, 0.88, 0);
  const knot = new THREE.SphereGeometry(0.075, 10, 8);
  knot.translate(0.50, 1.02, 0.24);
  return mergeGeometries([collar, kerchief, knot]);
}

function applyBandanaEmissiveAndFog(mat) {
  mat.fog = true;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "vec3 totalEmissiveRadiance = emissive;",
        "vec3 totalEmissiveRadiance = emissive + diffuseColor.rgb * 0.18;",
      )
      .replace(
        "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
        "fogFactor = clamp( max( fogFactor, smoothstep( 18.0, 38.0, vFogDepth ) ), 0.0, 1.0 );\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
      );
  };
}

// Mirrored ghosts: once Fox.glb loads, ghosts use the exact Fox.glb mesh, UV texture, neckerchief,
// and a 17-keyframe Vertex Animation Texture (VAT) matching every frame of the Walk clip to <5mm.
const GHOST_CAP = 620;
let ghostMeshes = null;
let ghostAnimAttr = null;
let ghostCountNow = 0;

function disposeGhostMeshes() {
  if (!ghostMeshes) return;
  for (const m of Object.values(ghostMeshes)) {
    scene.remove(m);
    if (m.geometry && (!foxAsset || m.geometry !== foxAsset.bakedGhostGeo)) {
      m.geometry.dispose();
    }
  }
  ghostMeshes = null;
  ghostAnimAttr = null;
}

function buildGhostMeshes() {
  if (ghostMeshes) return ghostMeshes;

  const bandGeo = buildNeckerchiefGeometry();
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.08,
  });
  applyBandanaEmissiveAndFog(bandMat);

  const mk = (geo, mat, castShadow = false, receiveShadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, GHOST_CAP);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    scene.add(m);
    return m;
  };

  if (foxAsset && foxAsset.bakedGhostGeo && foxAsset.ghostMat) {
    ghostAnimAttr = foxAsset.bakedGhostGeo.getAttribute("aAnim");
    const foxInst = mk(
      foxAsset.bakedGhostGeo,
      foxAsset.ghostMat,
      !LOW_END && URLP.get("shadows") !== "0",
      true,
    );
    if (foxAsset.ghostDepthMat) {
      foxInst.customDepthMaterial = foxAsset.ghostDepthMat;
    }
    const bandInst = mk(bandGeo, bandMat, false, true);
    ghostMeshes = {
      fox: foxInst,
      band: bandInst,
    };
    return ghostMeshes;
  }

  const foxMat = new THREE.MeshLambertMaterial({ color: 0xd97925, fog: true });
  const creamMat = new THREE.MeshLambertMaterial({ color: 0xf3e3c2, fog: true });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x4a2e1c, fog: true });

  const body = new THREE.CapsuleGeometry(0.27, 0.60, 4, 10); body.rotateZ(Math.PI / 2); body.translate(0, 0.68, 0);
  const head = new THREE.ConeGeometry(0.235, 0.55, 4); head.rotateY(Math.PI / 4); head.rotateZ(-Math.PI / 2); head.translate(0.72, 0.97, 0);
  const earL = new THREE.ConeGeometry(0.09, 0.30, 4); earL.translate(0.56, 1.22, 0.14);
  const earR = new THREE.ConeGeometry(0.09, 0.30, 4); earR.translate(0.56, 1.22, -0.14);
  const tail = new THREE.ConeGeometry(0.17, 0.72, 6); tail.rotateZ(Math.PI / 2.25); tail.translate(-0.78, 0.86, 0);
  const orangeGeo = mergeGeometries([body, head, earL, earR, tail]);

  const snout = new THREE.ConeGeometry(0.125, 0.36, 4); snout.rotateY(Math.PI / 4); snout.rotateZ(-Math.PI / 2); snout.translate(1.02, 0.92, 0);
  const chest = new THREE.BoxGeometry(0.30, 0.38, 0.32); chest.translate(0.52, 0.70, 0);
  const tailTip = new THREE.ConeGeometry(0.105, 0.32, 6); tailTip.rotateZ(Math.PI / 2.25); tailTip.translate(-1.03, 0.99, 0);
  const creamGeo = mergeGeometries([snout, chest, tailTip]);

  const legParts = [];
  for (const lx of [0.34, -0.34]) for (const lz of [0.15, -0.15]) { const leg = new THREE.BoxGeometry(0.10, 0.56, 0.10); leg.translate(lx, 0.28, lz); legParts.push(leg); }
  const darkGeo = mergeGeometries(legParts);

  ghostMeshes = { orange: mk(orangeGeo, foxMat), cream: mk(creamGeo, creamMat), dark: mk(darkGeo, darkMat), band: mk(bandGeo, bandMat) };
  return ghostMeshes;
}
function shortestAngleDelta(current, target) {
  const twoPi = Math.PI * 2;
  let delta = (target - current) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}

function loadSkyboxFallbackCube() {
  cubeTextureLoader.setPath("/assets/skybox/");
  cubeTextureLoader.load(
    ["posx.jpg", "negx.jpg", "posy.jpg", "negy.jpg", "posz.jpg", "negz.jpg"],
    (cubeMap) => {
      cubeMap.colorSpace = THREE.SRGBColorSpace;
      scene.background = cubeMap;
    },
  );
}

function loadMountainSky() {
  textureLoader.load(
    "/assets/skybox/mountain-panorama.jpg",
    (tex) => {
      try {
        const img = tex.image;
        const c = document.createElement("canvas");
        c.width = img.width || 2048;
        c.height = img.height || 1024;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, c.width, c.height);
        // Tall, gradual cubic atmospheric mist from y=0.26H (+43° elevation) down to the equator y=0.505H
        // so there is no hard cutoff line against the sky and the horizon matches the thick ground fog.
        const yTop = Math.round(c.height * 0.26);
        const yEq = Math.round(c.height * 0.505);
        const grad = ctx.createLinearGradient(0, yTop, 0, yEq);
        for (let s = 0; s <= 10; s += 1) {
          const t = s / 10;
          const a = Math.pow(t, 2.8);
          grad.addColorStop(t, `rgba(${FOG_RGB}, ${a.toFixed(4)})`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, yTop, c.width, yEq - yTop);
        ctx.fillStyle = `rgb(${FOG_RGB})`;
        ctx.fillRect(0, yEq, c.width, c.height - yEq);
        const mistTex = new THREE.CanvasTexture(c);
        mistTex.colorSpace = THREE.SRGBColorSpace;
        mistTex.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = mistTex;
        tex.dispose();
      } catch (_err) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = tex;
      }
    },
    undefined,
    () => {
      loadSkyboxFallbackCube();
    },
  );
}

function clearAgentVisuals() {
  for (const entry of agentVisuals.values()) {
    scene.remove(entry.mesh);
  }
  agentVisuals.clear();
}

const WALK_VAT_STEPS = 17; // Fox.glb Walk clip has exactly 17 keyframe intervals (17/24 s = 0.70833 s)
const WALK_VAT_ROWS = WALK_VAT_STEPS + 1; // rows 0..16 + row 17 (= row 0 wrap-around)
const IDLE_SURVEY_NORM_TIME = 0.65; // exact symmetric straight-ahead standing frame of Survey (asym = 0.000 m)

function bakeFoxGhostResources(gltf, normScale) {
  try {
    const bakeRoot = SkeletonUtils.clone(gltf.scene);
    bakeRoot.scale.setScalar(normScale);
    bakeRoot.rotation.y = Math.PI / 2;
    bakeRoot.updateMatrixWorld(true);
    let skinned = null;
    bakeRoot.traverse((n) => {
      if (n.isSkinnedMesh && !skinned) skinned = n;
    });
    if (!skinned || !skinned.geometry) return null;

    const anims = gltf.animations || [];
    const surveyClip = anims.find((a) => /survey/i.test(a.name)) || anims[0];
    const walkClip = anims.find((a) => /walk/i.test(a.name)) || anims[1] || anims[0];
    const vertCount = skinned.geometry.attributes.position.count;

    const samplePose = (clip, normTime) => {
      skinned.skeleton.pose();
      const bMixer = new THREE.AnimationMixer(bakeRoot);
      if (clip) {
        const act = bMixer.clipAction(clip);
        act.reset().play();
        act.time = (clip.duration || 1) * normTime;
        bMixer.update(0);
      }
      bakeRoot.updateMatrixWorld(true);
      const arr = new Float32Array(vertCount * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < vertCount; i += 1) {
        skinned.getVertexPosition(i, v);
        v.applyMatrix4(skinned.matrixWorld);
        arr[i * 3] = v.x;
        arr[i * 3 + 1] = v.y;
        arr[i * 3 + 2] = v.z;
      }
      return arr;
    };

    const idlePos = samplePose(surveyClip, IDLE_SURVEY_NORM_TIME);
    const vatData = new Float32Array(vertCount * WALK_VAT_ROWS * 4);
    for (let r = 0; r < WALK_VAT_ROWS; r += 1) {
      const normT = (r % WALK_VAT_STEPS) / WALK_VAT_STEPS;
      const pose = samplePose(walkClip, normT);
      const rowOffset = r * vertCount * 4;
      for (let i = 0; i < vertCount; i += 1) {
        const base = rowOffset + i * 4;
        vatData[base] = pose[i * 3];
        vatData[base + 1] = pose[i * 3 + 1];
        vatData[base + 2] = pose[i * 3 + 2];
        vatData[base + 3] = 1.0;
      }
    }

    const vatTex = new THREE.DataTexture(
      vatData,
      vertCount,
      WALK_VAT_ROWS,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    vatTex.minFilter = THREE.NearestFilter;
    vatTex.magFilter = THREE.NearestFilter;
    vatTex.wrapS = THREE.ClampToEdgeWrapping;
    vatTex.wrapT = THREE.ClampToEdgeWrapping;
    vatTex.generateMipmaps = false;
    vatTex.needsUpdate = true;

    const bakedGeo = new THREE.BufferGeometry();
    if (skinned.geometry.index) bakedGeo.setIndex(skinned.geometry.index.clone());
    bakedGeo.setAttribute("position", new THREE.BufferAttribute(idlePos, 3));
    if (skinned.geometry.attributes.uv) {
      bakedGeo.setAttribute("uv", skinned.geometry.attributes.uv.clone());
    }
    const vertIds = new Float32Array(vertCount);
    for (let i = 0; i < vertCount; i += 1) vertIds[i] = i;
    bakedGeo.setAttribute("aVertId", new THREE.BufferAttribute(vertIds, 1));

    const animArray = new Float32Array(GHOST_CAP * 2);
    const animAttr = new THREE.InstancedBufferAttribute(animArray, 2);
    animAttr.setUsage(THREE.DynamicDrawUsage);
    bakedGeo.setAttribute("aAnim", animAttr);

    const patchVatVertexShader = (shader) => {
      shader.uniforms.uFoxVat = { value: vatTex };
      shader.vertexShader =
        "uniform sampler2D uFoxVat;\nattribute float aVertId;\nattribute vec2 aAnim;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `
          vec3 transformed = vec3( position );
          float uVat = ( aVertId + 0.5 ) / ${vertCount.toFixed(1)};
          float fp = fract( aAnim.x ) * ${WALK_VAT_STEPS.toFixed(1)};
          float r0 = floor( fp );
          float frac = fp - r0;
          vec3 w0 = texture2D( uFoxVat, vec2( uVat, ( r0 + 0.5 ) / ${WALK_VAT_ROWS.toFixed(1)} ) ).xyz;
          vec3 w1 = texture2D( uFoxVat, vec2( uVat, ( r0 + 1.5 ) / ${WALK_VAT_ROWS.toFixed(1)} ) ).xyz;
          vec3 wPos = mix( w0, w1, frac );
          transformed = mix( transformed, wPos, clamp( aAnim.y, 0.0, 1.0 ) );
          `,
        );
    };

    const srcMat = Array.isArray(skinned.material) ? skinned.material[0] : skinned.material;
    const ghostMat = srcMat
      ? srcMat.clone()
      : new THREE.MeshStandardMaterial({ color: 0xd97925, roughness: 0.58 });
    ghostMat.flatShading = true;
    ghostMat.fog = true;
    ghostMat.onBeforeCompile = (shader) => {
      patchVatVertexShader(shader);
      shader.fragmentShader = shader.fragmentShader.replace(
        "gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
        "fogFactor = clamp( max( fogFactor, smoothstep( 18.0, 38.0, vFogDepth ) ), 0.0, 1.0 );\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );",
      );
    };

    const ghostDepthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    ghostDepthMat.onBeforeCompile = patchVatVertexShader;

    return { bakedGhostGeo: bakedGeo, ghostMat, ghostDepthMat };
  } catch (_err) {
    return null;
  }
}

function loadFoxModel() {
  gltfLoader.load(
    "/assets/models/Fox.glb",
    (gltf) => {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const normScale = 2.1 / Math.max(size.y, 0.001);

      gltf.scene.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
          n.frustumCulled = false;
        }
      });

      const baked = bakeFoxGhostResources(gltf, normScale);
      foxAsset = {
        scene: gltf.scene,
        animations: gltf.animations || [],
        normScale,
        bakedGhostGeo: baked?.bakedGhostGeo || null,
        ghostMat: baked?.ghostMat || null,
        ghostDepthMat: baked?.ghostDepthMat || null,
      };
      disposeGhostMeshes();
      clearAgentVisuals();
    },
    undefined,
    () => {
      foxAsset = null;
    },
  );
}

const groundMaps = {
  diffuse: null,
  normal: null,
};

function loadGroundTextures() {
  textureLoader.load("/assets/textures/grass.jpg", (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    groundMaps.diffuse = tex;
    rebuildWorldDecor();
  });
  textureLoader.load("/assets/textures/grass_ground/normal.jpg", (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    groundMaps.normal = tex;
    rebuildWorldDecor();
  });
}

const TILE_WORLD_SIZE = 9;
const GROUND_SPAN = 432;

function rebuildWorldDecor() {
  if (worldDecor.ground) scene.remove(worldDecor.ground);

  const repeats = Math.round(GROUND_SPAN / TILE_WORLD_SIZE);
  if (groundMaps.diffuse) {
    groundMaps.diffuse.repeat.set(repeats, repeats);
  }
  if (groundMaps.normal) {
    groundMaps.normal.repeat.set(repeats, repeats);
  }

  const segX = 64;
  const segY = 64;
  const groundGeo = new THREE.PlaneGeometry(GROUND_SPAN, GROUND_SPAN, segX, segY);
  const posAttr = groundGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cBase = new THREE.Color(0xb8c894);
  const cWarm = new THREE.Color(0xc9c48c);
  const cCool = new THREE.Color(0x98b478);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i += 1) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const w1 = 0.5 + 0.5 * Math.sin(vx * 0.05 + vy * 0.04);
    const w2 = 0.5 + 0.5 * Math.cos(vx * 0.03 - vy * 0.06);
    tmpColor.copy(cBase).lerp(cWarm, w1 * 0.45).lerp(cCool, w2 * 0.45);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      map: groundMaps.diffuse,
      normalMap: groundMaps.normal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.92,
      metalness: 0.0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(state.world.width / 2, 0, state.world.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  worldDecor.ground = ground;

  if (!worldDecor.oasisMesh) {
    const oasisGroup = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.03;
    oasisGroup.add(disc);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    oasisGroup.add(ring);

    oasisGroup.visible = false;
    scene.add(oasisGroup);
    worldDecor.oasisMesh = oasisGroup;
  }

  if (!worldDecor.informedBeacon) {
    const beaconGroup = new THREE.Group();
    const outerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 1.55, 46, 20),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        fog: false,
      }),
    );
    beaconGroup.add(outerBeam);

    const innerCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.45, 46, 12),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        fog: false,
      }),
    );
    beaconGroup.add(innerCore);

    const starCrown = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.55, 0),
      new THREE.MeshBasicMaterial({
        color: 0xfde047,
        fog: false,
      }),
    );
    starCrown.position.y = -11;
    beaconGroup.add(starCrown);
    beaconGroup.userData.starCrown = starCrown;

    beaconGroup.visible = false;
    scene.add(beaconGroup);
    worldDecor.informedBeacon = beaconGroup;
  }

  if (!worldDecor.loomingMesh) {
    const loom = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 28, 22),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        emissive: 0x991b1b,
        emissiveIntensity: 0.78,
        roughness: 0.35,
        fog: false,
      }),
    );
    loom.visible = false;
    scene.add(loom);
    worldDecor.loomingMesh = loom;
  }
}

function makeTagSprite(text, bgHex = "#f59e0b") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.strokeStyle = bgHex;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(12, 12, 232, 72, 22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 42px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text || ""), 128, 50);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.45, 0.55, 1);
  sprite.position.set(0, 2.45, 0);
  return { sprite, canvas: c, texture: tex };
}

function updateTagSprite(entry, text, bgHex) {
  if (!entry.tagObj) return;
  const { canvas: c, texture } = entry.tagObj;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.strokeStyle = bgHex || "#f59e0b";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(12, 12, 232, 72, 22);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 42px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(text || ""), 128, 50);
  texture.needsUpdate = true;
}

function makeAgentInstance(scarfHex, tagText) {
  const group = new THREE.Group();
  let mixer = null;
  let walkAction = null;
  let idleAction = null;
  let neckBone = null;
  let headBone = null;

  const scarfColor = new THREE.Color(scarfHex || "#f59e0b");
  const scarfMat = new THREE.MeshStandardMaterial({
    color: scarfColor,
    emissive: scarfColor.clone().multiplyScalar(0.18),
    roughness: 0.4,
    metalness: 0.08,
  });

  const ringMat = scarfMat; // legacy alias (ground ring removed — it read as a stray disc on the floor)

  if (foxAsset) {
    const cloned = SkeletonUtils.clone(foxAsset.scene);
    cloned.scale.setScalar(foxAsset.normScale);
    cloned.rotation.y = Math.PI / 2;
    cloned.traverse((n) => {
      if (n.name === "b_Neck_04") neckBone = n;
      if (n.name === "b_Head_05") headBone = n;
    });
    group.add(cloned);

    if (foxAsset.animations.length > 0) {
      mixer = new THREE.AnimationMixer(cloned);
      const surveyClip =
        foxAsset.animations.find((a) => /survey/i.test(a.name)) || foxAsset.animations[0];
      const walkClip =
        foxAsset.animations.find((a) => /walk/i.test(a.name)) ||
        foxAsset.animations[1] ||
        foxAsset.animations[0];

      idleAction = mixer.clipAction(surveyClip);
      walkAction = mixer.clipAction(walkClip);
      idleAction.play();
      idleAction.paused = true;
      idleAction.time = (surveyClip.duration || 1) * IDLE_SURVEY_NORM_TIME;
      walkAction.play();
      idleAction.weight = 1;
      walkAction.weight = 0;
    }
  } else {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.48,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.72, 8, 14), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0, 0.75, 0);
    body.castShadow = true;
    group.add(body);
  }

  // Neckerchief: a slim collar band around the neck + a small triangular kerchief tip on the chest.
  // (Replaces the thick torus that read as a blob, and the ground ring that read as a stray disc.)
  const scarfGroup = new THREE.Group();
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.042, 10, 28), scarfMat);
  collar.rotation.y = Math.PI / 2; // torus plane = YZ, wrapping the forward (X) neck axis
  collar.rotation.x = 0; // keep it a clean band, not a tilted oval
  collar.position.set(0.50, 1.16, 0);
  scarfGroup.add(collar);
  const kerchief = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.44, 3), scarfMat);
  kerchief.scale.set(1, 1, 0.38); // flattened triangular tip
  kerchief.rotation.x = Math.PI; // point down
  kerchief.rotation.y = Math.PI / 2;
  kerchief.position.set(0.60, 0.88, 0);
  scarfGroup.add(kerchief);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), scarfMat);
  knot.position.set(0.50, 1.02, 0.24);
  scarfGroup.add(knot);
  group.add(scarfGroup);

  const tagObj = makeTagSprite(tagText || "", scarfHex);
  group.add(tagObj.sprite);

  return {
    group,
    mixer,
    walkAction,
    idleAction,
    neckBone,
    headBone,
    scarfGroup,
    scarfMat,
    ringMat,
    tagObj,
  };
}

function scaleForType(type) {
  const raw = type === "human" ? state.config.humanSize : state.config.botSize;
  return Math.max(0.2, Number(raw) || 1);
}

function ensureAgentVisual(agent) {
  if (agentVisuals.has(agent.id)) return agentVisuals.get(agent.id);
  const inst = makeAgentInstance(agent.scarfColor, agent.tag);
  scene.add(inst.group);
  const initialPhase = Math.random();
  if (inst.mixer && inst.walkAction) {
    const dur = inst.walkAction.getClip()?.duration || 1;
    inst.walkAction.time = initialPhase * dur;
    inst.mixer.update(0.01);
  }
  const entry = {
    id: agent.id,
    type: agent.type,
    tag: agent.tag || "",
    scarfColor: agent.scarfColor || "#f59e0b",
    mesh: inst.group,
    mixer: inst.mixer,
    walkAction: inst.walkAction,
    idleAction: inst.idleAction,
    neckBone: inst.neckBone,
    headBone: inst.headBone,
    scarfGroup: inst.scarfGroup,
    scarfMat: inst.scarfMat,
    ringMat: inst.ringMat,
    tagObj: inst.tagObj,
    canonPos: null,
    authPos: new THREE.Vector3(agent.x, 0, agent.y),
    contTarget: new THREE.Vector3(agent.x, 0, agent.y),
    contSmooth: new THREE.Vector3(agent.x, 0, agent.y),
    targetPos: new THREE.Vector3(agent.x, 0, agent.y),
    targetVel: new THREE.Vector2(agent.vx || 0, agent.vy || 0),
    targetHeading: agent.heading || 0,
    targetPitch: agent.pitch || 0,
    smoothPitch: agent.pitch || 0,
    smoothYawLead: 0,
    walkDirSign: 1,
    targetScale: scaleForType(agent.type),
    smoothScale: scaleForType(agent.type),
    walkPhase: initialPhase,
    walkWeight: 0,
  };
  inst.group.position.copy(entry.targetPos);
  inst.group.rotation.y = -entry.targetHeading;
  entry.mesh.scale.setScalar(entry.targetScale);
  agentVisuals.set(agent.id, entry);
  return entry;
}

function syncAgents(agents) {
  if (CAPTURE) window.__agents = agents;
  const visibleIds = new Set();
  const boundary = state.config.boundaryMode || "";
  if (boundary !== state.lastBoundary) {
    state.lastBoundary = boundary;
    state.selfCanon = null;
    state.selfContinuous = null;
    for (const e of agentVisuals.values()) e.canonPos = null;
  }
  // Maintain a continuous (unwrapped) self position so crossing the torus seam never teleports the camera
  const selfAgent = agents.find((a) => a.id === state.you);
  if (isHexMode() && selfAgent) {
    if (!state.selfCanon || !state.selfContinuous) {
      state.selfCanon = { x: selfAgent.x, y: selfAgent.y };
      state.selfContinuous = { x: selfAgent.x, y: selfAgent.y };
    } else {
      const d = torusDeltaClient(state.selfCanon.x, state.selfCanon.y, selfAgent.x, selfAgent.y);
      state.selfContinuous = { x: state.selfContinuous.x + d.x, y: state.selfContinuous.y + d.y };
      state.selfCanon = { x: selfAgent.x, y: selfAgent.y };
    }
  }
  for (const agent of agents) {
    visibleIds.add(agent.id);
    const entry = ensureAgentVisual(agent);
    entry.type = agent.type;
    if (isHexMode() && state.selfCanon && state.selfContinuous) {
      if (!entry.canonPos) {
        entry.canonPos = { x: agent.x, y: agent.y };
        const d0 = torusDeltaClient(state.selfCanon.x, state.selfCanon.y, agent.x, agent.y);
        entry.authPos.set(state.selfContinuous.x + d0.x, 0, state.selfContinuous.y + d0.y);
        entry.contTarget.copy(entry.authPos);
        entry.contSmooth.copy(entry.authPos);
      } else {
        const step = torusDeltaClient(entry.canonPos.x, entry.canonPos.y, agent.x, agent.y);
        entry.canonPos.x = agent.x;
        entry.canonPos.y = agent.y;
        if (Math.hypot(step.x, step.y) > hexS() * 0.42) {
          // Teleport / preset reset: re-anchor cleanly around selfContinuous
          const d0 = torusDeltaClient(state.selfCanon.x, state.selfCanon.y, agent.x, agent.y);
          entry.authPos.set(state.selfContinuous.x + d0.x, 0, state.selfContinuous.y + d0.y);
          entry.contTarget.copy(entry.authPos);
          entry.contSmooth.copy(entry.authPos);
        } else {
          entry.authPos.x += step.x;
          entry.authPos.z += step.y;
          entry.contTarget.copy(entry.authPos);
        }
      }
      entry.targetPos.copy(entry.contTarget);
    } else {
      entry.canonPos = null;
      entry.authPos.set(agent.x, 0, agent.y);
      entry.contTarget.set(agent.x, 0, agent.y);
      entry.targetPos.set(agent.x, 0, agent.y);
      if (entry.contSmooth.distanceTo(entry.contTarget) > 14) {
        entry.contSmooth.copy(entry.contTarget);
      }
    }
    entry.targetVel.set(agent.vx || 0, agent.vy || 0);
    entry.targetHeading = Number.isFinite(agent.heading) ? agent.heading : entry.targetHeading;
    entry.targetPitch = Number.isFinite(agent.pitch) ? agent.pitch : 0;
    entry.knockedOut = !!agent.knockedOut;
    entry.targetScale = scaleForType(agent.type);

    // Update scarf & tag visibility/colors live if changed in Admin
    const nextColor = agent.scarfColor || "#f59e0b";
    const nextTag = agent.tag || agent.id.slice(0, 4);
    if (entry.scarfColor !== nextColor || entry.tag !== nextTag) {
      entry.scarfColor = nextColor;
      entry.tag = nextTag;
      const c = new THREE.Color(nextColor);
      entry.scarfMat.color.copy(c);
      entry.scarfMat.emissive.copy(c).multiplyScalar(0.18);
      entry.ringMat.color.copy(c);
      updateTagSprite(entry, nextTag, nextColor);
    }
    entry.scarfGroup.visible = !!state.config.showScarves;
    entry.tagObj.sprite.visible = !!state.config.showTags;
  }
  for (const [id, entry] of agentVisuals) {
    if (!visibleIds.has(id)) {
      scene.remove(entry.mesh);
      agentVisuals.delete(id);
    }
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onResize);

canvas.addEventListener("click", () => {
  if (canvas.requestPointerLock) {
    canvas.requestPointerLock();
  }
});

canvas.addEventListener("mousedown", (e) => {
  state.draggingLook = true;
  state.lastMouseX = e.clientX;
  state.lastMouseY = e.clientY;
});

window.addEventListener("mouseup", () => {
  state.draggingLook = false;
});

document.addEventListener("pointerlockchange", () => {
  state.pointerLocked = document.pointerLockElement === canvas;
});

document.addEventListener("mousemove", (e) => {
  if (state.pointerLocked) {
    state.look.yaw -= e.movementX * 0.0025;
    state.look.pitch -= e.movementY * 0.0021;
  } else if (state.draggingLook) {
    const dx = e.clientX - state.lastMouseX;
    const dy = e.clientY - state.lastMouseY;
    state.lastMouseX = e.clientX;
    state.lastMouseY = e.clientY;
    state.look.yaw -= dx * 0.004;
    state.look.pitch -= dy * 0.0032;
  } else {
    return;
  }
  const limit = Math.PI * 0.42;
  state.look.pitch = Math.max(-limit, Math.min(limit, state.look.pitch));
});

function setKeyState(key, isDown) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "w" || k === "ArrowUp") state.input.up = isDown;
  if (k === "s" || k === "ArrowDown") state.input.down = isDown;
  if (k === "a" || k === "ArrowLeft") state.input.left = isDown;
  if (k === "d" || k === "ArrowRight") state.input.right = isDown;
}

document.addEventListener("keydown", (e) => {
  setKeyState(e.key, true);
  if (e.key.startsWith("Arrow")) e.preventDefault();
});

document.addEventListener("keyup", (e) => {
  setKeyState(e.key, false);
  if (e.key.startsWith("Arrow")) e.preventDefault();
});

socket.on("joined", (payload) => {
  state.you = payload.id;
  state.yourTag = payload.tag || "";
  const youNameEl = document.getElementById("youName");
  if (youNameEl) youNameEl.textContent = state.yourTag || "";
  const gate = document.getElementById("joinGate");
  if (gate) gate.classList.add("is-hidden");
  if (payload.world) {
    state.world = payload.world;
    rebuildWorldDecor();
  }
});

socket.on("stimulus:looming", (payload) => {
  const ang = payload?.approachAngle ?? 0;
  state.looming = {
    startMs: performance.now(),
    durationMs: payload?.durationMs || 3400,
    approachAngle: ang,
    aimX: camera.position.x,
    aimZ: camera.position.z,
    dirX: Math.cos(ang),
    dirZ: Math.sin(ang),
    threat: 1,
    hit: false,
    resolved: false,
    reported: false,
  };
});

socket.on("world", (payload) => {
  if (!payload) return;
  if (payload.world) {
    const worldChanged = payload.world.width !== state.world.width || payload.world.height !== state.world.height;
    state.world = payload.world;
    if (worldChanged) rebuildWorldDecor();
  }
  state.you = payload.you || state.you;
  state.yourTag = payload.yourTag || state.yourTag;
  state.yourRole = payload.yourRole || "normal";
  state.yourGroup = payload.yourGroup || "A";
  state.inOasis = !!payload.inOasis;
  state.yourScore = Number.isFinite(payload.yourScore) ? payload.yourScore : state.yourScore;
  state.yourDamage = Number.isFinite(payload.yourDamage) ? payload.yourDamage : state.yourDamage;
  state.yourBumps = Number.isFinite(payload.yourBumps) ? payload.yourBumps : state.yourBumps;
  state.bumpingNow = !!payload.bumpingNow;
  state.youAreDead = !!payload.youAreDead;
  state.deadLeftSec = Number.isFinite(payload.deadLeftSec) ? payload.deadLeftSec : 0;
  state.stoppedByCollision = !!payload.stoppedByCollision;
  state.informedTargetDeg = Number.isFinite(payload.informedTargetDeg) ? payload.informedTargetDeg : null;
  state.phase = payload.phase || state.phase;
  state.activePreset = payload.activePreset || state.activePreset;
  if (payload.config && typeof payload.config === "object") {
    state.config = { ...state.config, ...payload.config };
  }
  if (payload.instruction) {
    const prevTitle = state.instruction.title;
    state.instruction = payload.instruction;
    if (payload.instruction.title && payload.instruction.title !== prevTitle && taskBannerEl) {
      taskBannerEl.classList.remove("banner-pulse");
      void taskBannerEl.offsetWidth;
      taskBannerEl.classList.add("banner-pulse");
    }
  }
  state.counts = payload.counts || state.counts;
  syncAgents(Array.isArray(payload.agents) ? payload.agents : []);
});

setInterval(() => {
  camera.getWorldDirection(forwardVec);
  state.input.aim = Math.atan2(forwardVec.z, forwardVec.x);
  state.input.pitch = state.look.pitch;
  if (socket.connected) socket.emit("input", state.input);
}, 50);

const _ghostDummy = new THREE.Object3D();
const _ghostColor = new THREE.Color();
function smoothstep01(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
function collideDistThreshold() {
  return Math.max(0.85, Number(state.config.collisionRadius) || 1.25);
}
function updateGhosts(_nowMs) {
  const show = isHexMode();
  const ringsWanted = URL_RINGS !== null ? URL_RINGS : Math.max(0, Math.min(3, Number(state.config.hexRings) || 0));
  const rings = Math.min(ringsWanted, state.perf.ringCap);
  if (!show || rings === 0) {
    if (ghostMeshes) { for (const m of Object.values(ghostMeshes)) m.count = 0; }
    ghostCountNow = 0;
    return;
  }
  const s = hexS();
  const cullDist = Math.min(42, s * (rings * 0.72 + 0.30));
  const fadeStart = cullDist - 12.0;
  const collideR = collideDistThreshold();
  const g = buildGhostMeshes();
  if (g.band) g.band.visible = state.config.showScarves !== false;
  // Stencil rings + 2 guarantees every lattice point inside the camera's cullDist disk is tested
  // both before and after a peer's canonical copy wraps across the Voronoi cell boundary.
  const offsets = hexGhostOffsets(rings + 2);
  let idx = 0;
  for (const entry of agentVisuals.values()) {
    if (entry.id === state.you) continue;
    const baseScale = entry.smoothScale || entry.targetScale || 1;
    const walkPhase = ((entry.walkPhase % 1) + 1) % 1;
    const wWeight = entry.walkWeight ?? 0;
    for (const off of offsets) {
      if (idx >= GHOST_CAP) break;
      const px = entry.mesh.position.x + off.x;
      const pz = entry.mesh.position.z + off.z;
      const dx = px - camera.position.x;
      const dz = pz - camera.position.z;
      const distC = Math.hypot(dx, dz);
      // Disappear cleanly on collision (distC <= collideR) without shrinking at close range
      if (distC >= cullDist || distC <= collideR) continue;
      const farEase = distC <= fadeStart ? 1.0 : 1.0 - smoothstep01((distC - fadeStart) / (cullDist - fadeStart));
      const effScale = baseScale * farEase;
      if (effScale <= 0.005) continue;
      _ghostDummy.position.set(px, 0, pz);
      _ghostDummy.rotation.set(0, entry.mesh.rotation.y, 0);
      _ghostDummy.scale.setScalar(effScale);
      _ghostDummy.updateMatrix();
      for (const m of Object.values(g)) m.setMatrixAt(idx, _ghostDummy.matrix);
      g.band.setColorAt(idx, _ghostColor.set(entry.scarfColor || "#f59e0b"));
      if (ghostAnimAttr) {
        ghostAnimAttr.setXY(idx, walkPhase, wWeight);
      }
      idx += 1;
    }
  }
  ghostCountNow = idx;
  for (const m of Object.values(g)) { m.count = idx; m.instanceMatrix.needsUpdate = true; }
  if (g.band.instanceColor) g.band.instanceColor.needsUpdate = true;
  if (ghostAnimAttr) ghostAnimAttr.needsUpdate = true;
}

rebuildWorldDecor();
loadGroundTextures();
loadMountainSky();
loadFoxModel();

let lastFrameMs = performance.now();

const _leadEuler = new THREE.Euler(0, 0, 0, "YZX");
const _leadQuat = new THREE.Quaternion();
function addLocalTwist(bone, yaw, pitch) {
  if (!bone) return;
  if (Math.abs(yaw) < 0.0008 && Math.abs(pitch) < 0.0008) return;
  _leadEuler.set(0, yaw, pitch, "YZX");
  _leadQuat.setFromEuler(_leadEuler);
  bone.quaternion.multiply(_leadQuat);
}

function animate(nowMs = performance.now()) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.08, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;

  camera.rotation.y = state.look.yaw;
  camera.rotation.x = state.look.pitch;

  const posLerp = 1 - Math.exp(-dt * 18);
  const rotLerp = 1 - Math.exp(-dt * 14);

  const me = agentVisuals.get(state.you);
  if (me) {
    me.contTarget.x += me.targetVel.x * dt;
    me.contTarget.z += me.targetVel.y * dt;
    if (me.contSmooth.distanceTo(me.contTarget) > 6) {
      me.contSmooth.copy(me.contTarget);
    } else {
      me.contSmooth.lerp(me.contTarget, posLerp);
    }
    tmpVec3.set(me.contSmooth.x, 1.7, me.contSmooth.z);
    camera.position.copy(tmpVec3);
  }

  if (worldDecor.ground) {
    const snapX = Math.round(camera.position.x / TILE_WORLD_SIZE) * TILE_WORLD_SIZE;
    const snapZ = Math.round(camera.position.z / TILE_WORLD_SIZE) * TILE_WORLD_SIZE;
    worldDecor.ground.position.set(snapX, 0, snapZ);
  }
  if (hazeSkirt) hazeSkirt.position.set(camera.position.x, 3, camera.position.z);
  dir.target.position.set(camera.position.x, 0, camera.position.z);
  dir.position.set(camera.position.x + 34, 65, camera.position.z + 28);

  // Update Oasis visual if enabled
  if (worldDecor.oasisMesh) {
    const showOasis = !!state.config.oasisEnabled && !!state.config.oasisShowHint;
    worldDecor.oasisMesh.visible = showOasis;
    if (showOasis) {
      const r = Math.max(2, Number(state.config.oasisRadius) || 11);
      worldDecor.oasisMesh.position.set(state.config.oasisX, 0, state.config.oasisY);
      worldDecor.oasisMesh.scale.set(r, 1, r);
    }
  }

  // Update Informed Leader sky beacon if this student is an informed individual
  if (worldDecor.informedBeacon) {
    if (state.informedTargetDeg !== null) {
      const rad = (state.informedTargetDeg * Math.PI) / 180;
      worldDecor.informedBeacon.visible = true;
      worldDecor.informedBeacon.position.set(
        camera.position.x + Math.cos(rad) * 55,
        22,
        camera.position.z + Math.sin(rad) * 55,
      );
      const starCrown = worldDecor.informedBeacon.userData?.starCrown;
      if (starCrown) {
        starCrown.rotation.y = nowMs * 0.0022;
        starCrown.position.y = -11 + Math.sin(nowMs * 0.004) * 0.6;
      }
    } else {
      worldDecor.informedBeacon.visible = false;
    }
  }

  // The dive flies a straight line through where you were. Step off that line and it misses.
  if (worldDecor.loomingMesh && state.looming) {
    const loom = state.looming;
    const elapsed = nowMs - loom.startMs;
    const strikeAt = loom.durationMs * 0.86;
    const along = 34 * (1 - elapsed / strikeAt);
    const height = Math.max(1.15, 14 * Math.max(0, 1 - elapsed / strikeAt) + 1.15);
    const px = loom.aimX + loom.dirX * along;
    const pz = loom.aimZ + loom.dirZ * along;
    worldDecor.loomingMesh.visible = elapsed <= loom.durationMs + 500;
    worldDecor.loomingMesh.position.set(px, height, pz);
    const closing = Math.max(0, Math.min(1, 1 - along / 34));
    worldDecor.loomingMesh.scale.setScalar(1.15 + Math.pow(closing, 1.2) * 4.2);
    const relX = camera.position.x - loom.aimX;
    const relZ = camera.position.z - loom.aimZ;
    const alongYou = relX * loom.dirX + relZ * loom.dirZ;
    const lateral = Math.hypot(relX - loom.dirX * alongYou, relZ - loom.dirZ * alongYou);
    const onPath = lateral < 2.7;
    loom.threat = onPath ? Math.max(loom.threat * 0.9, closing * (1 - lateral / 3.4)) : loom.threat * 0.82;
    if (!loom.resolved && Math.abs(along) < 3.2 && elapsed >= strikeAt - 120 && lateral < 2.4) {
      loom.hit = true;
      loom.resolved = true;
    }
    if (!loom.resolved && elapsed > strikeAt + 260) {
      loom.hit = false;
      loom.resolved = true;
    }
    if (loom.resolved && !loom.reported) {
      loom.reported = true;
      socket.emit("looming:resolved", { hit: !!loom.hit });
    }
    if (elapsed > loom.durationMs + 500) {
      worldDecor.loomingMesh.visible = false;
      state.looming = null;
    }
  }

  // Show task banner ONLY when there is a relevant instruction or active state alert
  if (taskBannerEl) {
    let effTitle = state.instruction?.title || "";
    let effBody = state.instruction?.body || "";
    if (state.looming) {
      effTitle = state.looming.resolved ? (state.looming.hit ? "HIT" : "IT MISSED") : "STEP ASIDE";
      effBody = state.looming.resolved ? "" : "It is flying a straight line. Move off that line.";
    } else if (state.config.stopAndGoEnabled && state.stoppedByCollision && !effTitle) {
      effTitle = "⏸ PAUSED";
      effBody = "Waiting briefly for the fox ahead to clear.";
    }
    const showBanner = Boolean(effTitle);
    taskBannerEl.classList.toggle("is-hidden", !showBanner);
    if (showBanner) {
      if (taskTitleEl && taskTitleEl.textContent !== effTitle) taskTitleEl.textContent = effTitle;
      if (taskBodyEl && taskBodyEl.textContent !== effBody) taskBodyEl.textContent = effBody;
      taskBannerEl.classList.toggle("role-informed", state.yourRole === "informed" && state.informedTargetDeg !== null);
      taskBannerEl.classList.toggle("in-oasis", !!state.inOasis);
      taskBannerEl.classList.toggle("looming-alert", !!state.looming || !!state.bumpingNow);
      taskBannerEl.classList.toggle("stop-go-paused", !!state.stoppedByCollision);
    }
  }

  // Full-width horizontal damage / looming threat bar (only when relevant)
  if (damageBarWrapEl) {
    const collisionOn = !!state.config.collisionScoreEnabled || Number(state.yourDamage || 0) > 0;
    const loomingOn = !!state.looming;
    const showBar = collisionOn || loomingOn;
    damageBarWrapEl.classList.toggle("is-hidden", !showBar);
    if (showBar) {
      damageBarWrapEl.classList.toggle("is-bumping", !!state.bumpingNow && collisionOn);
      damageBarWrapEl.classList.toggle("is-threat", loomingOn && !state.bumpingNow);
        if (state.youAreDead) {
          const stayed = state.deadLeftSec > 3000;
          if (damageBarTitleEl) damageBarTitleEl.textContent = "DOWN";
          if (damageBarStatsEl) {
            damageBarStatsEl.textContent = stayed
              ? "OUT UNTIL THE LECTURER RESETS"
              : `BACK IN ${Math.max(0, Math.ceil(state.deadLeftSec))}s`;
          }
          if (damageBarHealthEl) {
            damageBarHealthEl.style.width = "0%";
            damageBarHealthEl.style.background = "linear-gradient(90deg, #7f1d1d 0%, #ef4444 100%)";
          }
          if (damageBarLossEl) damageBarLossEl.style.width = "100%";
        } else if (loomingOn && state.looming) {
        const threatPct = Math.round(Math.max(0, Math.min(1, state.looming.threat || 0)) * 100);
        const clear = threatPct < 28;
        if (damageBarTitleEl) {
          damageBarTitleEl.textContent = state.looming.resolved
            ? state.looming.hit
              ? "HIT"
              : "MISSED YOU"
            : clear
              ? "OFF ITS PATH"
              : "DIVE — STEP ASIDE";
        }
        if (damageBarStatsEl) damageBarStatsEl.textContent = state.looming.resolved ? "" : `ON PATH ${threatPct}%`;
        if (damageBarHealthEl) {
          damageBarHealthEl.style.width = `${(100 - threatPct).toFixed(1)}%`;
          damageBarHealthEl.style.background = clear
            ? "linear-gradient(90deg, #047857 0%, #34d399 100%)"
            : "linear-gradient(90deg, #b91c1c 0%, #f97316 100%)";
        }
        if (damageBarLossEl) damageBarLossEl.style.width = `${threatPct.toFixed(1)}%`;
      } else {
        const dmg = Math.max(0, Number(state.yourDamage || 0));
        const healthPct = Math.max(0, Math.min(100, 100 - dmg));
        const lossPct = 100 - healthPct;
        if (damageBarTitleEl) {
          damageBarTitleEl.textContent = state.bumpingNow
            ? "⚠️ COLLISION — TAKING DAMAGE"
            : "COLLISION INTEGRITY";
        }
        if (damageBarStatsEl) {
          damageBarStatsEl.textContent = `INTEGRITY ${Math.round(healthPct)}%   DAMAGE ${dmg.toFixed(0)}   BUMPS ${state.yourBumps || 0}`;
        }
        if (damageBarHealthEl) {
          damageBarHealthEl.style.width = `${healthPct.toFixed(1)}%`;
          damageBarHealthEl.style.background =
            healthPct > 65
              ? "linear-gradient(90deg, #10b981 0%, #34d399 100%)"
              : healthPct > 35
                ? "linear-gradient(90deg, #d97706 0%, #fbbf24 100%)"
                : "linear-gradient(90deg, #b91c1c 0%, #f87171 100%)";
        }
        if (damageBarLossEl) damageBarLossEl.style.width = `${lossPct.toFixed(1)}%`;
      }
    }
  }

  const collideR = collideDistThreshold();
  for (const entry of agentVisuals.values()) {
    if (entry.id !== state.you) {
      // Advance contTarget smoothly along velocity between 50ms server packets (60-120fps dead-reckoning)
      entry.contTarget.x += entry.targetVel.x * dt;
      entry.contTarget.z += entry.targetVel.y * dt;
    }
    const stepX = entry.contTarget.x - entry.contSmooth.x;
    const stepZ = entry.contTarget.z - entry.contSmooth.z;
    const dist = Math.hypot(stepX, stepZ);
    const speed = entry.targetVel.length();
    const moving = (dist > 0.015 && dist < 12) || speed > 0.22;

    if (entry.id !== state.you) {
      if (dist > 6) {
        entry.contSmooth.copy(entry.contTarget);
      } else {
        entry.contSmooth.x += stepX * posLerp;
        entry.contSmooth.z += stepZ * posLerp;
      }
    }

    if (isHexMode()) {
      const rel = torusDeltaClient(
        camera.position.x,
        camera.position.z,
        entry.contSmooth.x,
        entry.contSmooth.z,
      );
      entry.mesh.position.set(camera.position.x + rel.x, 0, camera.position.z + rel.y);
    } else {
      entry.mesh.position.set(entry.contSmooth.x, 0, entry.contSmooth.z);
    }

    const camDistXZ = Math.hypot(
      entry.mesh.position.x - camera.position.x,
      entry.mesh.position.z - camera.position.z,
    );
    // Fox stays full size (no close-range shrinking) and disappears when you collide with it (camDistXZ <= collideR)
    entry.mesh.visible = entry.id !== state.you && camDistXZ > collideR;
    const targetY = -entry.targetHeading;
    const yawDelta = shortestAngleDelta(entry.mesh.rotation.y, targetY);
    entry.mesh.rotation.y += yawDelta * rotLerp;
    // A big body turn used to crank the neck through a bad Euler flip. Hold the neck still until the body has caught up.
    const bodyCatchingUp = Math.abs(yawDelta) > 0.5 || entry.knockedOut;
    const leadTarget = bodyCatchingUp ? 0 : Math.max(-0.28, Math.min(0.28, yawDelta * 0.7));
    const pitchTarget = bodyCatchingUp ? 0 : Math.max(-0.28, Math.min(0.28, entry.targetPitch || 0));
    const leadBlend = 1 - Math.exp(-dt * 5);
    entry.smoothYawLead += (leadTarget - entry.smoothYawLead) * leadBlend;
    entry.smoothPitch += (pitchTarget - entry.smoothPitch) * leadBlend;
    const wantLie = entry.knockedOut ? 1.15 : 0;
    entry.lie = (entry.lie || 0) + (wantLie - (entry.lie || 0)) * (1 - Math.exp(-dt * 5));
    entry.mesh.rotation.x = entry.lie;

    entry.smoothScale += (entry.targetScale - entry.smoothScale) * posLerp;
    entry.mesh.scale.setScalar(Math.max(0.001, entry.smoothScale));

    if (speed > 0.35) {
      const faceX = Math.cos(entry.targetHeading);
      const faceZ = Math.sin(entry.targetHeading);
      const forwardDot = entry.targetVel.x * faceX + entry.targetVel.y * faceZ;
      if (forwardDot < -0.25) entry.walkDirSign = -1;
      else if (forwardDot > 0.15) entry.walkDirSign = 1;
    }
    const walkTimeScale = entry.walkDirSign * 1.15;

    if (entry.mixer) {
      if (entry.walkAction && entry.idleAction) {
        const targetWalk = moving ? 1 : 0;
        entry.walkAction.weight += (targetWalk - entry.walkAction.weight) * (1 - Math.exp(-dt * 12));
        entry.idleAction.weight = 1 - entry.walkAction.weight;
        entry.walkAction.timeScale = walkTimeScale;
      }
      entry.mixer.update(dt);
      if (entry.walkAction) {
        const dur = entry.walkAction.getClip()?.duration || 1;
        entry.walkPhase = (((entry.walkAction.time / dur) % 1) + 1) % 1;
        entry.walkWeight = entry.walkAction.weight;
      }

      // Attenuate secondary neck/head twist to 0 by 9.5 m (well inside the 12 m Voronoi boundary)
      // and reset Euler from the mixer's animated quaternion each frame so rotations never accumulate.
      const boneLod = camDistXZ <= 5.5 ? 1.0 : camDistXZ >= 9.5 ? 0.0 : 1.0 - (camDistXZ - 5.5) / 4.0;
      const yawLead = entry.smoothYawLead * boneLod * 0.35;
      const pitchLead = entry.smoothPitch * boneLod * 0.35;
      addLocalTwist(entry.neckBone, yawLead, pitchLead * 0.8);
      addLocalTwist(entry.headBone, yawLead * 0.85, pitchLead);
    } else {
      const targetWalk = moving ? 1 : 0;
      entry.walkWeight += (targetWalk - entry.walkWeight) * (1 - Math.exp(-dt * 12));
      entry.walkPhase = (((entry.walkPhase + dt * walkTimeScale) % 1) + 1) % 1;
    }
  }

  if (hud) {
    hud.textContent = "";
  }
  updateGhosts(nowMs);
  // Adaptive performance: if frames run slow on a student laptop, shed cost (pixels, shadows, ghost rings)
  state.perf.emaMs = state.perf.emaMs * 0.96 + Math.min(100, dt * 1000) * 0.04;
  state.perf.frames += 1;
  if (state.perf.frames % 240 === 0 && state.perf.emaMs > 27 && !state.perf.degraded) {
    state.perf.degraded = true;
    state.perf.ringCap = 1;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = false;
    if (dir) dir.castShadow = false;
  }
  window.__ghostCount = ghostCountNow;
  renderer.render(scene, camera);
}

function connectStudent(name, code) {
  const gate = document.getElementById("joinGate");
  const err = document.getElementById("joinError");
  if (err) err.textContent = "";
  sessionStorage.setItem("foxName", name);
  sessionStorage.setItem("foxCode", code || "");
  socket.io.opts.query = { role: "participant", name, code: code || "" };
  if (socket.connected) socket.disconnect();
  socket.connect();
  if (gate) gate.classList.add("is-hidden");
}

socket.on("join:rejected", () => {
  const gate = document.getElementById("joinGate");
  const err = document.getElementById("joinError");
  if (err) err.textContent = "That join code does not match. Ask the lecturer.";
  if (gate) gate.classList.remove("is-hidden");
  sessionStorage.removeItem("foxCode");
});

socket.on("connect_error", () => {
  const gate = document.getElementById("joinGate");
  const err = document.getElementById("joinError");
  if (gate && !socket.connected) {
    gate.classList.remove("is-hidden");
    if (err) err.textContent = "Cannot reach the lab. Check the link and try again.";
  }
});

const joinForm = document.getElementById("joinForm");
const joinNameEl = document.getElementById("joinName");
const joinCodeEl = document.getElementById("joinCode");
if (joinNameEl) joinNameEl.value = sessionStorage.getItem("foxName") || "";
if (joinCodeEl) joinCodeEl.value = sessionStorage.getItem("foxCode") || "";
if (joinForm) {
  joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = (joinNameEl?.value || "").trim();
    if (!name) return;
    connectStudent(name, (joinCodeEl?.value || "").trim());
  });
}

fetch("/join-info")
  .then((res) => res.json())
  .then((info) => {
    const label = document.getElementById("joinCodeLabel");
    if (label && info?.needsCode) {
      label.textContent = "Join code";
      if (joinCodeEl) joinCodeEl.required = true;
    }
    const saved = (sessionStorage.getItem("foxName") || "").trim();
    if (saved && (!info?.needsCode || (sessionStorage.getItem("foxCode") || "").trim())) {
      connectStudent(saved, (sessionStorage.getItem("foxCode") || "").trim());
    }
  })
  .catch(() => {});

animate();
window.__classroomState = state;
if (CAPTURE) {
  window.__grabFrame = () => renderer.domElement.toDataURL("image/jpeg", 0.72);
}
window.__classroomAgents = agentVisuals;
