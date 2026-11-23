// ============================================================
// scenes.js — CCTV 복도 연출 (PS1 레트로 스타일)
//  복도를 옆에서 보는 고정 CCTV. 카메라는 복도를 따라 좌우로만 움직인다 (◀ ▶, 화면 끌기, ← →).
//  - CctvView.init(container) → CctvView.show(key, floor) → CctvView.pan(±1)
//  - three.js 로 로우폴리 복도와 동물을 그리고, 저해상도로 렌더링해 크게 늘린다.
//    꼭짓점 떨림(vertex snapping), 픽셀 텍스처(NearestFilter), 낮은 프레임(20fps)
//  - 키 = data.js 의 cctvScene
//  - WebGL 을 못 쓰는 환경이면 조용히 포기한다 (게임은 자막만으로도 진행된다)
// ============================================================

const CctvView = (() => {
  const W = 320, H = 180, FPS = 20, LAMP = 1.5;      // W,H: 꼭짓점 떨림 격자의 기준 해상도. 실제 렌더 크기는 화면 비율에 맞춘다(fit)
  let renderer = null, scene = null, camera = null, actors = null;
  let doors = [], plates = [], lamps = [];
  let update = null, running = false, last = 0, acc = 0, time = 0, ok = false, host = null;

  // 카메라: 복도 앞쪽에서 뒷벽을 바라본다. x 만 움직인다.
  const CAM = { y: 1.75, z: 11.5, lookY: 1.35, fov: 28 };
  const PAN_STEP = 3.5;                                // ◀ ▶ 한 번에 움직이는 거리
  const pan = { x: 0, target: 0, max: 0 };

  // ---------- 재료 / 도형 도우미 ----------
  // PS1 느낌: 화면 좌표를 거친 격자에 맞춰 꼭짓점이 덜덜 떨리게 한다
  function ps1(material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         if (gl_Position.w > 0.0) {
           vec4 sp = gl_Position;
           sp.xyz /= sp.w;
           sp.xy = floor(sp.xy * vec2(${(W / 2).toFixed(1)}, ${(H / 2).toFixed(1)}) + 0.5) / vec2(${(W / 2).toFixed(1)}, ${(H / 2).toFixed(1)});
           sp.xyz *= sp.w;
           gl_Position = sp;
         }`
      );
    };
    return material;
  }
  const lambert = (color, extra) => ps1(new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {})));
  const basic = (color, extra) => ps1(new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {})));

  // 면이 각져 보이도록 (플랫 셰이딩)
  function flat(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();
    return g;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ball = (r, detail) => flat(new THREE.IcosahedronGeometry(r, detail || 0));
  const cone = (r, h, seg) => flat(new THREE.ConeGeometry(r, h, seg || 4));
  const cyl = (rt, rb, h, seg) => flat(new THREE.CylinderGeometry(rt, rb, h, seg || 6));

  function put(parent, geo, material, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    parent.add(m);
    return m;
  }

  // 작은 캔버스에 그린 픽셀 텍스처
  function pixelTexture(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function rand(seed) {              // 장면마다 같은 무늬가 나오도록 하는 간단한 난수
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  }

  // ---------- 복도 (x 축으로 길게 뻗어 있다) ----------
  const HALL = { halfLen: 15, back: -1.2, front: 6, height: 3 };
  const DOOR_X = [-8, 0, 8];                           // 01호 · 02호 · 03호

  function buildHall() {
    const len = HALL.halfLen * 2, depth = HALL.front - HALL.back, midZ = (HALL.front + HALL.back) / 2;

    const floorTex = pixelTexture(16, 16, (g) => {
      g.fillStyle = "#3d4a4a"; g.fillRect(0, 0, 16, 16);
      g.fillStyle = "#2b3535"; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
      g.fillStyle = "#465555"; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    });
    floorTex.repeat.set(len, depth);
    const floor = put(scene, new THREE.PlaneGeometry(len, depth), lambert(0xffffff, { map: floorTex }), 0, 0, midZ);
    floor.rotation.x = -Math.PI / 2;

    const wallTex = pixelTexture(16, 32, (g) => {
      const r = rand(7);
      g.fillStyle = "#5c6660"; g.fillRect(0, 0, 16, 32);
      for (let i = 0; i < 60; i++) { g.fillStyle = r() > 0.5 ? "#656f68" : "#535d57"; g.fillRect((r() * 16) | 0, (r() * 32) | 0, 1, 1); }
      g.fillStyle = "#39413d"; g.fillRect(0, 22, 16, 10);      // 아래쪽 징두리
      g.fillStyle = "#2c3330"; g.fillRect(0, 21, 16, 1);
    });
    const backTex = wallTex.clone(); backTex.needsUpdate = true; backTex.repeat.set(len / 2, 1);
    put(scene, new THREE.PlaneGeometry(len, HALL.height), lambert(0xffffff, { map: backTex }), 0, HALL.height / 2, HALL.back);
    [-1, 1].forEach((side) => {                                                         // 복도 양 끝 벽
      const t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(depth / 2, 1);
      const wall = put(scene, new THREE.PlaneGeometry(depth, HALL.height), lambert(0xffffff, { map: t }), side * HALL.halfLen, HALL.height / 2, midZ);
      wall.rotation.y = -side * Math.PI / 2;
    });
    const ceil = put(scene, new THREE.PlaneGeometry(len, depth), lambert(0x30363a), 0, HALL.height, midZ);
    ceil.rotation.x = Math.PI / 2;

    // 문과 문 사이의 창문 (밤하늘)
    [-4, 4].forEach((x) => {
      put(scene, box(1.0, 0.75, 0.05), lambert(0x1c2422), x, 1.65, HALL.back + 0.03);
      put(scene, box(0.86, 0.6, 0.06), basic(0x0b1622), x, 1.65, HALL.back + 0.04);
    });

    // 문 3개 + 호수판 (뒷벽)
    DOOR_X.forEach((x) => {
      const g = new THREE.Group();
      g.position.set(x, 0, HALL.back + 0.02);
      put(g, box(1.25, 2.25, 0.1), lambert(0x232a28), 0, 1.12, 0);                       // 문틀
      const hinge = new THREE.Group();                                                   // 경첩 (문이 열릴 때 회전)
      hinge.position.set(-0.5, 0, 0.06);
      const leaf = put(hinge, box(1.0, 2.05, 0.06), lambert(0x6b4a36), 0.5, 1.05, 0);
      put(leaf, box(0.6, 0.5, 0.02), lambert(0x5a3d2c), 0, 0.45, 0.035);
      put(leaf, box(0.6, 0.5, 0.02), lambert(0x5a3d2c), 0, -0.45, 0.035);
      put(leaf, box(0.06, 0.06, 0.06), lambert(0xc9b26a), 0.38, -0.05, 0.06);            // 손잡이
      g.add(hinge);
      const plateMat = basic(0xffffff);
      put(g, new THREE.PlaneGeometry(0.64, 0.28), plateMat, 0, 2.45, 0.07);
      scene.add(g);
      doors.push({ x, hinge });
      plates.push(plateMat);
    });

    // 천장 등
    [-11, -4, 4, 11].forEach((x) => {
      const mat = basic(0xfff3c4);
      put(scene, box(0.9, 0.06, 0.35), mat, x, HALL.height - 0.04, 0.4);
      const light = new THREE.PointLight(0xffe6b0, LAMP, 10, 1.2);
      light.position.set(x, 2.6, 0.6);
      scene.add(light);
      lamps.push({ mat, light });
    });
    scene.add(new THREE.AmbientLight(0x8fa3aa, 0.85));
  }

  function setRoomNumbers(floorNo) {
    plates.forEach((material, i) => {
      if (material.map) material.map.dispose();
      material.map = pixelTexture(64, 28, (g) => {
        g.fillStyle = "#d9d2b0"; g.fillRect(0, 0, 64, 28);
        g.fillStyle = "#1c211f"; g.fillRect(0, 0, 64, 2); g.fillRect(0, 26, 64, 2); g.fillRect(0, 0, 2, 28); g.fillRect(62, 0, 2, 28);
        g.font = "bold 20px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(String(floorNo * 100 + i + 1), 32, 15);
      });
      material.needsUpdate = true;
    });
  }

  // ---------- 동물 (전부 +z, 즉 카메라 쪽을 본다) ----------
  const BLACK = 0x141414;

  function eyes(parent, x, y, z, size) {
    const m = basic(BLACK);
    return [put(parent, box(size, size, size * 0.5), m, -x, y, z), put(parent, box(size, size, size * 0.5), m, x, y, z)];
  }

  function hamster(tint) {
    const g = new THREE.Group();
    const fur = lambert(tint || 0xd9a066), cream = lambert(0xf3e3c3), pink = lambert(0xe8a0a0);
    const body = new THREE.Group(); g.add(body);
    put(body, ball(0.3), fur, 0, 0.28, 0, 1.05, 0.9, 1.25);
    put(body, ball(0.2), cream, 0, 0.2, 0.22, 1.1, 0.8, 0.9);                 // 배·볼
    put(body, box(0.09, 0.1, 0.04), pink, -0.15, 0.55, 0.12);                 // 귀
    put(body, box(0.09, 0.1, 0.04), pink, 0.15, 0.55, 0.12);
    eyes(body, 0.11, 0.37, 0.33, 0.05);
    put(body, box(0.05, 0.04, 0.04), pink, 0, 0.3, 0.4);                      // 코
    [[-0.16, 0.2], [0.16, 0.2], [-0.16, -0.18], [0.16, -0.18]].forEach(([x, z]) => put(g, box(0.08, 0.06, 0.1), pink, x, 0.03, z));
    g.userData.body = body;
    return g;
  }

  function gecko() {
    const g = new THREE.Group();
    const skin = lambert(0x7fb069), belly = lambert(0xd6e6a5), dark = lambert(0x4d7a45);
    const body = new THREE.Group(); g.add(body);
    put(body, cyl(0.15, 0.2, 0.75, 5), skin, 0, 0.82, 0);
    put(body, box(0.2, 0.55, 0.05), belly, 0, 0.8, 0.16);
    const head = put(body, ball(0.24), skin, 0, 1.36, 0.05, 1.15, 0.8, 1.2);
    put(head, ball(0.08), basic(0xf2c14e), -0.17, 0.08, 0.12);                // 큰 눈
    put(head, ball(0.08), basic(0xf2c14e), 0.17, 0.08, 0.12);
    put(head, box(0.03, 0.1, 0.03), basic(BLACK), -0.18, 0.08, 0.2);
    put(head, box(0.03, 0.1, 0.03), basic(BLACK), 0.18, 0.08, 0.2);
    put(body, cyl(0.34, 0.34, 0.03, 8), lambert(0x1b1b1b), 0, 1.56, 0.03);    // 중절모
    put(body, cyl(0.17, 0.19, 0.18, 6), lambert(0x1b1b1b), 0, 1.66, 0.03);
    put(body, cyl(0.175, 0.195, 0.04, 6), lambert(0xe6e6e6), 0, 1.6, 0.03);
    const tail = put(body, cone(0.1, 0.9, 4), dark, 0, 0.42, -0.4);
    tail.rotation.x = -2.1;
    const arms = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.2, 1.1, 0); body.add(p);
      put(p, box(0.07, 0.4, 0.07), skin, 0, -0.2, 0);
      put(p, box(0.1, 0.08, 0.1), basic(0xf5f5f5), 0, -0.42, 0);              // 흰 장갑
      return p;
    });
    const legs = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.1, 0.46, 0); g.add(p);
      put(p, box(0.08, 0.42, 0.08), skin, 0, -0.21, 0);
      put(p, box(0.1, 0.06, 0.2), lambert(0x1b1b1b), 0, -0.43, 0.05);
      return p;
    });
    g.userData = { body, arms, legs, tail };
    return g;
  }

  function cubeCat() {
    const g = new THREE.Group();
    const fur = lambert(0xe08a3c), light = lambert(0xf6d7a8), pink = lambert(0xe8a0a0);
    const stripes = pixelTexture(16, 16, (c) => {
      c.fillStyle = "#e08a3c"; c.fillRect(0, 0, 16, 16);
      c.fillStyle = "#b9652a"; [2, 6, 10].forEach((y) => c.fillRect(0, y, 16, 2));
    });
    const body = new THREE.Group(); g.add(body);
    put(body, box(0.9, 0.9, 0.9), lambert(0xffffff, { map: stripes }), 0, 0.5, 0);
    put(body, box(0.5, 0.34, 0.02), light, 0, 0.36, 0.46);                    // 주둥이 주변
    put(body, cone(0.16, 0.24, 4), fur, -0.3, 1.06, 0.25);                    // 귀
    put(body, cone(0.16, 0.24, 4), fur, 0.3, 1.06, 0.25);
    const lids = [put(body, box(0.15, 0.13, 0.02), basic(0x9be564), -0.2, 0.62, 0.46), put(body, box(0.15, 0.13, 0.02), basic(0x9be564), 0.2, 0.62, 0.46)];
    put(body, box(0.04, 0.12, 0.02), basic(BLACK), -0.2, 0.62, 0.475);
    put(body, box(0.04, 0.12, 0.02), basic(BLACK), 0.2, 0.62, 0.475);
    put(body, box(0.08, 0.06, 0.03), pink, 0, 0.46, 0.475);
    [-1, 1].forEach((s) => [0.42, 0.36].forEach((y, i) => {
      const w = put(body, box(0.3, 0.012, 0.012), basic(0xffffff), s * 0.33, y, 0.47);
      w.rotation.z = s * (i ? -0.15 : 0.15);
    }));
    [-0.25, 0.25].forEach((x) => put(body, box(0.2, 0.1, 0.12), light, x, 0.1, 0.44));
    const tail = new THREE.Group(); tail.position.set(0.3, 0.9, -0.3); body.add(tail);
    put(tail, box(0.1, 0.5, 0.1), fur, 0, 0.25, 0);
    put(tail, box(0.1, 0.12, 0.1), light, 0, 0.55, 0);
    // 유리 상자 (희미하게 — 데이터를 봐야 "아, 상자구나" 하고 알 수 있을 정도)
    const glass = new THREE.Group(); glass.position.set(0, 0.52, 0); g.add(glass);
    put(glass, box(1.04, 1.04, 1.04), basic(0xbfe6ff, { transparent: true, opacity: 0.1, depthWrite: false }));
    glass.add(new THREE.LineSegments(new THREE.EdgesGeometry(box(1.04, 1.04, 1.04)), new THREE.LineBasicMaterial({ color: 0xd8f1ff, transparent: true, opacity: 0.55 })));
    g.userData = { body, tail, lids };
    return g;
  }

  function bear() {
    const g = new THREE.Group();
    const fur = lambert(0x6b4226), light = lambert(0xb98b5e), honey = lambert(0xf2b632);
    const body = new THREE.Group(); g.add(body);
    put(body, ball(0.8), fur, 0, 0.95, 0, 1, 1.12, 0.9);
    put(body, ball(0.5), light, 0, 0.9, 0.42, 1, 1.1, 0.6);
    const head = new THREE.Group(); head.position.set(0, 2.0, 0.1); body.add(head);
    put(head, ball(0.46), fur);
    put(head, ball(0.15), fur, -0.34, 0.36, 0);
    put(head, ball(0.15), fur, 0.34, 0.36, 0);
    put(head, box(0.34, 0.24, 0.26), light, 0, -0.12, 0.38);
    put(head, box(0.12, 0.08, 0.06), basic(BLACK), 0, -0.04, 0.52);
    eyes(head, 0.18, 0.1, 0.4, 0.07);
    [-1, 1].forEach((s) => {                                                  // 뻗은 다리
      put(g, box(0.36, 0.34, 0.75), fur, s * 0.5, 0.2, 0.62);
      put(g, box(0.3, 0.28, 0.06), light, s * 0.5, 0.2, 1.0);
    });
    const pot = new THREE.Group(); pot.position.set(0, 0.48, 0.78); g.add(pot);  // 꿀단지
    put(pot, cyl(0.3, 0.24, 0.5, 6), lambert(0x9c5a2c));
    put(pot, cyl(0.27, 0.27, 0.04, 6), honey, 0, 0.26, 0);
    const armL = put(body, box(0.26, 0.7, 0.26), fur, -0.72, 1.1, 0.3);
    armL.rotation.set(-0.9, 0, 0.35);
    const arm = new THREE.Group(); arm.position.set(0.7, 1.45, 0.2); body.add(arm);   // 퍼먹는 팔
    put(arm, box(0.26, 0.8, 0.26), fur, 0, -0.4, 0);
    const paw = put(arm, box(0.3, 0.2, 0.3), honey, 0, -0.85, 0);
    g.userData = { body, head, arm, paw };
    return g;
  }

  function hedgehog() {
    const g = new THREE.Group();
    const neon = basic(0x39ff14);
    const body = new THREE.Group(); g.add(body);
    put(body, ball(0.42, 1), lambert(0x2e5a2a, { emissive: 0x1f8f12 }), 0, 0.42, -0.05, 1, 0.85, 1.25);
    const r = rand(42);
    for (let i = 0; i < 34; i++) {                                            // 가시
      const a = r() * Math.PI * 2, up = 0.25 + r() * 1.2;
      const dir = new THREE.Vector3(Math.cos(a) * Math.sin(up), Math.cos(up) + 0.25, Math.sin(a) * Math.sin(up) - 0.25).normalize();
      const s = put(body, cone(0.06, 0.34, 4), neon, dir.x * 0.4, 0.42 + dir.y * 0.36, -0.05 + dir.z * 0.5);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    }
    const face = put(body, cone(0.2, 0.42, 5), lambert(0xe9d3a8), 0, 0.32, 0.55);
    face.rotation.x = Math.PI / 2;
    put(body, box(0.07, 0.07, 0.07), basic(BLACK), 0, 0.32, 0.77);
    eyes(body, 0.11, 0.42, 0.52, 0.06);
    [[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.3], [0.2, -0.3]].forEach(([x, z]) => put(g, box(0.1, 0.08, 0.14), lambert(0xe9d3a8), x, 0.04, z));
    const glow = new THREE.PointLight(0x39ff14, 1.6, 6, 1.4);
    glow.position.set(0, 0.8, 0.2); g.add(glow);
    g.userData = { body, neon, glow };
    return g;
  }

  function koala() {
    const g = new THREE.Group();
    const fur = lambert(0x9aa0a6), light = lambert(0xe6e8ea);
    const body = new THREE.Group(); g.add(body);
    put(body, ball(0.42), fur, 0, 0.52, 0, 1, 1.1, 0.9);
    put(body, ball(0.26), light, 0, 0.48, 0.24, 1, 1.1, 0.6);
    const head = new THREE.Group(); head.position.set(0, 1.12, 0.05); body.add(head);
    put(head, ball(0.34), fur, 0, 0, 0, 1.15, 0.95, 1);
    put(head, ball(0.2), fur, -0.4, 0.2, -0.02);
    put(head, ball(0.2), fur, 0.4, 0.2, -0.02);
    put(head, ball(0.11), light, -0.4, 0.2, 0.08);
    put(head, ball(0.11), light, 0.4, 0.2, 0.08);
    put(head, box(0.16, 0.22, 0.1), basic(BLACK), 0, -0.04, 0.32);            // 큰 코
    eyes(head, 0.17, 0.08, 0.3, 0.06);
    const legs = [-1, 1].map((s) => {
      const p = new THREE.Group(); p.position.set(s * 0.2, 0.22, 0); g.add(p);
      put(p, box(0.18, 0.24, 0.2), fur, 0, -0.1, 0);
      return p;
    });
    [-1, 1].forEach((s) => put(body, box(0.14, 0.42, 0.16), fur, s * 0.46, 0.6, 0.05));
    g.userData = { body, legs };
    return g;
  }

  function deer() {
    const g = new THREE.Group();
    const fur = lambert(0xa9713f), light = lambert(0xe9d6b4), horn = lambert(0xd8c9a0);
    const body = new THREE.Group(); g.add(body);
    put(body, box(0.55, 0.55, 1.1), fur, 0, 1.05, 0);                         // 몸통
    put(body, box(0.4, 0.2, 0.7), light, 0, 0.8, 0);                          // 배
    put(body, box(0.12, 0.14, 0.1), light, 0, 1.2, -0.58);                    // 꼬리
    const neck = put(body, box(0.26, 0.6, 0.28), fur, 0, 1.5, 0.48);
    neck.rotation.x = 0.35;
    const head = new THREE.Group(); head.position.set(0, 1.86, 0.68); body.add(head);
    put(head, box(0.32, 0.3, 0.42), fur);
    put(head, box(0.22, 0.18, 0.2), light, 0, -0.06, 0.28);                   // 주둥이
    put(head, box(0.1, 0.09, 0.08), basic(0xe5484d), 0, -0.02, 0.4);          // 빨간 코 (루돌)
    eyes(head, 0.13, 0.05, 0.2, 0.06);
    put(head, box(0.1, 0.16, 0.05), fur, -0.22, 0.14, -0.1);                  // 귀
    put(head, box(0.1, 0.16, 0.05), fur, 0.22, 0.14, -0.1);
    [-1, 1].forEach((s) => {                                                  // 뿔
      const a = put(head, box(0.05, 0.42, 0.05), horn, s * 0.12, 0.36, -0.05);
      a.rotation.z = -s * 0.3;
      const b1 = put(head, box(0.05, 0.22, 0.05), horn, s * 0.26, 0.46, -0.05);
      b1.rotation.z = -s * 1.0;
      const b2 = put(head, box(0.05, 0.18, 0.05), horn, s * 0.12, 0.56, 0.06);
      b2.rotation.x = 0.8;
    });
    const legs = [[-0.2, 0.42], [0.2, 0.42], [-0.2, -0.42], [0.2, -0.42]].map(([x, z]) => {
      const p = new THREE.Group(); p.position.set(x, 0.8, z); g.add(p);
      put(p, box(0.11, 0.72, 0.11), fur, 0, -0.36, 0);
      put(p, box(0.12, 0.1, 0.12), lambert(0x2a211a), 0, -0.76, 0);
      return p;
    });
    g.userData = { body, head, legs };
    return g;
  }

  const breathe = (group, t, amount) => {
    const b = group.userData.body;
    if (b) b.scale.y = 1 + Math.sin(t * 2.4) * (amount || 0.03);
  };

  // 층마다 카메라가 처음 볼 곳 (x). 이상현상이 화면 안에서 시작하게 한다
  const FOCUS = { hamster_clone: -6.5, gecko_moonwalk: 0, square_cat: 0.5, honey_bear: 1.5, neon_hedgehog: -6, koala_small_door: 6, empty_hall: 0, deer_boxes: -3.2 };

  // ---------- 장면 (층별 이상현상) ----------
  // 좌표: x = 복도를 따라 (문 01호 -8 · 02호 0 · 03호 8), z = 뒷벽(-1.2) → 카메라 쪽
  const SCENES = {
    // 1층: 101호 앞에서 햄스터가 끝없이 불어난다
    hamster_clone(root) {
      const sack = new THREE.Group(); sack.position.set(-6.4, 0, -0.6); root.add(sack);   // 해바라기씨 봉지
      put(sack, box(0.34, 0.32, 0.22), lambert(0xd8c27a), 0, 0.16, 0);
      put(sack, box(0.36, 0.06, 0.24), lambert(0xb89a4a), 0, 0.33, 0);
      put(sack, box(0.12, 0.12, 0.02), lambert(0x3a2a14), 0, 0.17, 0.115);
      for (let i = 0; i < 7; i++) put(sack, box(0.04, 0.02, 0.025), lambert(0x2a2a2a), -0.3 + i * 0.07, 0.01, 0.2 + (i % 3) * 0.05);
      const tints = [0xd9a066, 0xe6c79a, 0xc68642];
      const r = rand(11), list = [];
      const spawn = (x, z, pop) => {
        const h = hamster(tints[list.length % tints.length]);
        h.position.set(x, 0, z);
        list.push({ h, vx: (r() > 0.5 ? 1 : -1) * (0.6 + r() * 0.9), vz: (r() - 0.5) * 0.8, born: pop ? time : -10, phase: r() * 6 });
        root.add(h);
      };
      spawn(-8.4, -0.3, false); spawn(-7.5, 0.4, false);
      let nextAt = 1.5;
      return (t, dt) => {
        if (list.length < 9 && t > nextAt) {          // 9마리에서 멈춘다 (보드의 "6마리 이상"과 맞도록)
          const parent = list[(r() * list.length) | 0].h.position;
          spawn(parent.x, parent.z, true);
          nextAt = t + Math.max(0.25, 1.1 - list.length * 0.03);
        }
        list.forEach((o) => {
          const p = o.h.position;
          p.x += o.vx * dt; p.z += o.vz * dt;
          if (p.x < -12.5 || p.x > -2) { o.vx = -o.vx; p.x = Math.max(-12.5, Math.min(-2, p.x)); }
          if (p.z < -0.8 || p.z > 2) { o.vz = -o.vz; p.z = Math.max(-0.8, Math.min(2, p.z)); }
          o.h.rotation.y = Math.atan2(o.vx, o.vz);
          const grow = Math.min(1, (t - o.born) / 0.4);
          o.h.scale.setScalar(grow * 1.5);
          o.h.position.y = Math.abs(Math.sin(t * 9 + o.phase)) * 0.05;
          breathe(o.h, t + o.phase, 0.05);
        });
      };
    },

    // 2층: 202호 앞, 게코도마뱀의 문워크 (앞을 보고 뒤로 미끄러진다)
    gecko_moonwalk(root) {
      const g = gecko();
      root.add(g);
      return (t) => {
        const span = 3.2, cycle = (t * 0.4) % 2;
        const k = cycle < 1 ? cycle : 2 - cycle;   // 0→1→0 왕복
        const dirLeft = cycle < 1;                 // 보는 방향의 반대로 이동
        g.rotation.y = dirLeft ? Math.PI / 2 : -Math.PI / 2;
        g.position.set(span / 2 - k * span, 0, 0.6);
        g.scale.setScalar(1.35);
        const s = Math.sin(t * 5);
        g.userData.legs[0].rotation.x = s * 0.55;
        g.userData.legs[1].rotation.x = -s * 0.55;
        g.userData.arms[0].rotation.x = -s * 0.4;
        g.userData.arms[1].rotation.x = s * 0.4;
        g.userData.body.rotation.x = -0.12;        // 살짝 앞으로 기운 자세
        g.userData.body.position.y = Math.abs(s) * 0.03;
        breathe(g, t, 0.02);
      };
    },

    // 3층: 302호 앞, 완벽한 네모가 된 고양이
    square_cat(root) {
      const c = cubeCat();
      c.position.set(0.9, 0, 0.5);
      c.scale.setScalar(1.25);
      c.rotation.y = -0.35;
      root.add(c);
      return (t) => {
        breathe(c, t, 0.025);
        c.userData.tail.rotation.z = Math.sin(t * 1.6) * 0.5;
        const blink = (t % 3.4) > 3.25 ? 0.1 : 1;
        c.userData.lids.forEach((e) => { e.scale.y = blink; });
      };
    },

    // 4층: 복도 한가운데서 꿀을 퍼먹는 곰
    honey_bear(root) {
      const b = bear();
      b.position.set(2.4, 0, 0.4);
      b.rotation.y = -0.2;
      root.add(b);
      return (t) => {
        const k = (Math.sin(t * 2.2) + 1) / 2;     // 0 = 단지, 1 = 입
        b.userData.arm.rotation.x = -0.5 - k * 1.9;
        b.userData.arm.rotation.z = -0.25 - k * 0.3;
        b.userData.head.rotation.x = 0.25 - k * 0.3;
        breathe(b, t, 0.02);
      };
    },

    // 5층: 형광 초록으로 번쩍이며 복도를 가로지르는 고슴도치
    neon_hedgehog(root) {
      const h = hedgehog();
      h.rotation.y = Math.PI / 2;                  // 오른쪽을 보고 걷는다
      root.add(h);
      return (t) => {
        const k = (t * 0.05) % 1;
        h.position.set(-11 + k * 22, Math.abs(Math.sin(t * 6)) * 0.03, 0.6 + Math.sin(t * 0.7) * 0.3);
        h.scale.setScalar(1.5);
        const pulse = 0.55 + 0.45 * Math.sin(t * 7) * Math.sin(t * 2.3);
        h.userData.neon.color.setRGB(0.22 + 0.5 * pulse, 1, 0.08 + 0.5 * pulse);
        h.userData.glow.intensity = 0.9 + pulse * 1.6;
        breathe(h, t, 0.04);
      };
    },

    // 6층: 뒷벽의 아주 작은 문으로 들어가는 코알라
    koala_small_door(root) {
      const doorX = 4.6, wallZ = HALL.back + 0.03;
      const frame = new THREE.Group(); frame.position.set(doorX, 0, wallZ); root.add(frame);
      put(frame, box(0.5, 0.62, 0.06), lambert(0x232a28), 0, 0.31, 0);
      const inside = put(frame, box(0.4, 0.52, 0.07), basic(0x000000), 0, 0.27, 0.005);
      const hinge = new THREE.Group(); hinge.position.set(-0.2, 0, 0.05); frame.add(hinge);
      put(hinge, box(0.4, 0.52, 0.04), lambert(0x8a2f2f), 0.2, 0.27, 0);
      put(hinge, box(0.04, 0.04, 0.04), lambert(0xc9b26a), 0.34, 0.27, 0.03);
      const k = koala();
      root.add(k);
      return (t) => {
        const c = t % 9;                           // 9초 주기: 걸어온다 → 문이 열린다 → 줄어들며 들어간다
        const walk = Math.min(1, c / 4.5);
        const enter = Math.max(0, Math.min(1, (c - 5) / 2));
        k.position.set(10 + (doorX - 10) * walk, 0, 0.4 + (wallZ + 0.1 - 0.4) * enter);
        k.rotation.y = enter > 0 ? Math.PI : -Math.PI / 2;   // 걸을 땐 왼쪽, 들어갈 땐 벽 쪽
        k.scale.setScalar(1.25 * (1 - enter * 0.75));
        k.visible = c < 7.2;
        const s = Math.sin(t * 6) * (walk < 1 || enter > 0 ? 1 : 0);
        k.userData.legs[0].rotation.x = s * 0.5;
        k.userData.legs[1].rotation.x = -s * 0.5;
        k.userData.body.rotation.z = s * 0.05;
        const open = Math.max(0, Math.min(1, (c - 4.2) / 0.8)) - Math.max(0, Math.min(1, (c - 7.4) / 0.6));
        hinge.rotation.y = -open * 1.7;
        inside.material.color.setRGB(open * 1.0, open * 0.75, open * 0.35);   // 문 안쪽의 따뜻한 빛
        breathe(k, t, 0.03);
      };
    },

    // 7층: 텅 빈 복도. 아무도 없는데 등은 깜빡이고 702호 문이 혼자 움직인다
    empty_hall() {
      return (t) => {
        const flick = (Math.sin(t * 31) > 0.72 && Math.sin(t * 1.3) > 0.2) ? 0.25 : 1;
        lamps[2].light.intensity = LAMP * flick;
        lamps[2].mat.color.setRGB(1 * flick, 0.95 * flick, 0.77 * flick);
        const c = t % 11;
        const open = Math.max(0, Math.min(1, (c - 6) / 1.5)) - Math.max(0, Math.min(1, (c - 9) / 0.4));
        doors[1].hinge.rotation.y = -open * 0.5;
      };
    },

    // 8층(택배 보관실): 낯선 사슴이 상자를 끝없이 쌓는다
    deer_boxes(root) {
      const cardboard = pixelTexture(16, 16, (g) => {
        g.fillStyle = "#b98a55"; g.fillRect(0, 0, 16, 16);
        g.fillStyle = "#9c7040"; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
        g.fillStyle = "#e3cfa0"; g.fillRect(6, 0, 4, 16);                     // 테이프
      });
      const boxMat = lambert(0xffffff, { map: cardboard });
      const pile = [];
      for (let i = 0; i < 12; i++) {                                          // 3줄 x 4단
        const col = i % 3, row = (i / 3) | 0;
        const b = put(root, box(0.62, 0.5, 0.62), boxMat, -5.2 + col * 0.68 + (row % 2) * 0.06, 0.25 + row * 0.5, -0.7);
        b.rotation.y = ((i * 37) % 7 - 3) * 0.03;
        pile.push(b);
      }
      const d = deer();
      d.rotation.y = -Math.PI / 2;                 // 상자 더미(왼쪽)를 보고
      root.add(d);
      const carried = put(d, box(0.5, 0.4, 0.5), boxMat, 0, 1.75, 1.05);      // 입에 문 상자
      return (t) => {
        const c = t % 16, placed = Math.min(12, Math.floor(c / 1.1));          // 1.1초마다 하나씩, 12개 뒤 처음부터
        pile.forEach((b, i) => {
          b.visible = i < placed;
          if (i === placed - 1) b.scale.setScalar(Math.min(1, 0.4 + ((c / 1.1) % 1) * 2));
          else b.scale.setScalar(1);
        });
        const k = (c / 1.1) % 1;                   // 한 상자를 나르는 동안 0→1
        d.position.set(-1.4 - Math.sin(k * Math.PI) * 1.1, 0, 0.3);
        carried.visible = k < 0.5 && placed < 12;
        const s = Math.sin(t * 9);
        d.userData.legs[0].rotation.x = s * 0.4; d.userData.legs[3].rotation.x = s * 0.4;
        d.userData.legs[1].rotation.x = -s * 0.4; d.userData.legs[2].rotation.x = -s * 0.4;
        d.userData.head.rotation.x = Math.sin(t * 2.2) * 0.12;
        breathe(d, t, 0.015);
      };
    },
  };

  // ---------- 준비 / 장면 전환 / 루프 ----------
  function clear(group) {
    while (group.children.length) {
      const c = group.children.pop();
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }
  }

  function init(container) {
    try {
      if (typeof THREE === "undefined") throw new Error("three.js 없음");
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      host = container;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x04070a);
      scene.fog = new THREE.Fog(0x04070a, 14, 30);
      camera = new THREE.PerspectiveCamera(CAM.fov, W / H, 0.1, 60);
      camera.rotation.set(-Math.atan2(CAM.y - CAM.lookY, CAM.z - HALL.back), 0, 0);   // 살짝 내려다본다
      buildHall();
      actors = new THREE.Group();
      scene.add(actors);
      renderer.domElement.className = "cctv-canvas";
      container.appendChild(renderer.domElement);
      ok = true;
      fit();
      if (typeof ResizeObserver === "function") new ResizeObserver(() => fit()).observe(container);
      window.addEventListener("resize", fit);
    } catch (e) {
      console.warn("CCTV 3D 연출을 쓸 수 없어요 (자막으로 진행):", e);
      ok = false;
    }
    return ok;
  }

  function show(key, floorNo) {
    if (!ok) return;
    clear(actors);
    doors.forEach((d) => { d.hinge.rotation.y = 0; });
    lamps.forEach((l) => { l.light.intensity = LAMP; l.mat.color.set(0xfff3c4); });
    setRoomNumbers(floorNo);
    time = 0;
    update = SCENES[key] ? SCENES[key](actors) : null;
    fit();
    pan.x = pan.target = Math.max(-pan.max, Math.min(pan.max, FOCUS[key] || 0));
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
    render(0);
  }

  function placeCamera(dt) {
    pan.x += (pan.target - pan.x) * Math.min(1, dt * 6);          // 부드럽게 미끄러진다
    camera.position.set(pan.x, CAM.y, CAM.z);
  }

  function render(dt) {
    placeCamera(dt || 1);
    if (update) update(time, dt);
    renderer.render(scene, camera);
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    if (acc < 1 / FPS) return;                                  // 일부러 낮은 프레임 (레트로 + 가벼움)
    const dt = acc; acc = 0; time += dt;
    render(dt);
  }

  function stop() { running = false; }

  // 화면(모니터) 크기가 바뀌면 렌더 크기와 카메라 비율을 맞춘다: 높이는 180 고정, 너비는 비율대로
  // 보이는 폭이 바뀌므로 좌우로 갈 수 있는 끝(pan.max)도 다시 잰다
  function fit() {
    if (!ok || !host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const aspect = w / h, RH = 180, RW = Math.max(160, Math.min(560, Math.round(RH * aspect)));
    renderer.setSize(RW, RH, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const halfW = (CAM.z - HALL.back) * Math.tan((CAM.fov / 2) * Math.PI / 180) * aspect;
    pan.max = Math.max(0, HALL.halfLen - 0.2 - halfW);
    pan.target = Math.max(-pan.max, Math.min(pan.max, pan.target));
    renderer.render(scene, camera);
  }

  // ---- 좌우 이동 ----
  function panTo(x) {
    const next = Math.max(-pan.max, Math.min(pan.max, x));
    if (Math.abs(next - pan.target) < 0.01) return false;
    pan.target = next;
    return true;
  }
  const step = (dir) => panTo(pan.target + dir * PAN_STEP);    // +1 오른쪽, -1 왼쪽. 움직였으면 true
  const drag = (dx) => panTo(pan.target + dx);                 // 화면을 끌 때 (복도 단위)

  return {
    init, show, stop, fit, pan: step, drag,
    get ok() { return ok; },
    get atLeft() { return pan.target <= -pan.max + 0.01; },
    get atRight() { return pan.target >= pan.max - 0.01; },
  };
})();
