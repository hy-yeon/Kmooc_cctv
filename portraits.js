// ============================================================
// portraits.js — 책(출입표 · 택배장부) 페이지에 붙는 동물 증명사진 (SVG)
// portraitSvg("햄스터") → <svg> 글자. 모르는 동물이나 빈 값(미등록)은 물음표 실루엣.
// 새 동물을 넣으려면 FACES 에 하나 더 그리면 된다 (viewBox 0 0 100 120, 얼굴은 대략 x 20~80, y 20~90).
// ============================================================

const portraitSvg = (() => {
  const INK = "#2a241a";
  const eye = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r || 3}" fill="${INK}"/><circle cx="${x + 1}" cy="${y - 1}" r="1" fill="#fff"/>`;
  const smile = (y) => `<path d="M44 ${y} Q50 ${y + 5} 56 ${y}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;

  // 동물마다: shirt(옷 색), face(얼굴 SVG)
  const FACES = {
    햄스터: { shirt: "#b5523b", face: `
      <circle cx="30" cy="36" r="9" fill="#d9a066" stroke="${INK}" stroke-width="2"/><circle cx="30" cy="36" r="4.5" fill="#e8a0a0"/>
      <circle cx="70" cy="36" r="9" fill="#d9a066" stroke="${INK}" stroke-width="2"/><circle cx="70" cy="36" r="4.5" fill="#e8a0a0"/>
      <ellipse cx="50" cy="60" rx="31" ry="28" fill="#d9a066" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="34" cy="70" rx="11" ry="9" fill="#f3e3c3"/><ellipse cx="66" cy="70" rx="11" ry="9" fill="#f3e3c3"/>
      ${eye(40, 56)}${eye(60, 56)}<ellipse cx="50" cy="66" rx="3" ry="2.2" fill="#e8a0a0"/>${smile(70)}` },
    토끼: { shirt: "#3a6f8f", face: `
      <ellipse cx="38" cy="24" rx="8" ry="24" fill="#f2f0ea" stroke="${INK}" stroke-width="2.5"/><ellipse cx="38" cy="24" rx="3.5" ry="17" fill="#e8a0a0"/>
      <ellipse cx="62" cy="24" rx="8" ry="24" fill="#f2f0ea" stroke="${INK}" stroke-width="2.5"/><ellipse cx="62" cy="24" rx="3.5" ry="17" fill="#e8a0a0"/>
      <ellipse cx="50" cy="64" rx="26" ry="25" fill="#f2f0ea" stroke="${INK}" stroke-width="2.5"/>
      ${eye(41, 60)}${eye(59, 60)}<path d="M47 68 L53 68 L50 72 Z" fill="#e8a0a0"/>${smile(73)}` },
    게코도마뱀: { shirt: "#2d2d2d", face: `
      <ellipse cx="50" cy="64" rx="30" ry="24" fill="#7fb069" stroke="${INK}" stroke-width="2.5"/>
      <circle cx="35" cy="54" r="10" fill="#f2c14e" stroke="${INK}" stroke-width="2"/><rect x="34" y="47" width="2.5" height="14" rx="1" fill="${INK}"/>
      <circle cx="65" cy="54" r="10" fill="#f2c14e" stroke="${INK}" stroke-width="2"/><rect x="64" y="47" width="2.5" height="14" rx="1" fill="${INK}"/>
      <circle cx="44" cy="72" r="1.5" fill="${INK}"/><circle cx="56" cy="72" r="1.5" fill="${INK}"/>
      <path d="M36 78 Q50 86 64 78" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="30" cy="74" r="2" fill="#5f9150"/><circle cx="70" cy="74" r="2" fill="#5f9150"/>` },
    고양이: { shirt: "#5b6b3a", face: `
      <path d="M24 50 L28 22 L46 40 Z" fill="#e08a3c" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M76 50 L72 22 L54 40 Z" fill="#e08a3c" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="50" cy="62" rx="29" ry="26" fill="#e08a3c" stroke="${INK}" stroke-width="2.5"/>
      <path d="M50 37 V46 M42 39 L44 47 M58 39 L56 47" stroke="#b9652a" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="50" cy="72" rx="12" ry="9" fill="#f6d7a8"/>
      <ellipse cx="39" cy="58" rx="5" ry="6" fill="#9be564" stroke="${INK}" stroke-width="1.5"/><rect x="38" y="53" width="2" height="10" fill="${INK}"/>
      <ellipse cx="61" cy="58" rx="5" ry="6" fill="#9be564" stroke="${INK}" stroke-width="1.5"/><rect x="60" y="53" width="2" height="10" fill="${INK}"/>
      <path d="M47 68 L53 68 L50 71 Z" fill="#e8a0a0"/>
      <path d="M22 66 H36 M22 72 L36 70 M78 66 H64 M78 72 L64 70" stroke="${INK}" stroke-width="1.2"/>` },
    오소리: { shirt: "#6b4a2a", face: `
      <circle cx="28" cy="42" r="7" fill="#5a5f64" stroke="${INK}" stroke-width="2"/><circle cx="72" cy="42" r="7" fill="#5a5f64" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="50" cy="62" rx="28" ry="27" fill="#8a8f94" stroke="${INK}" stroke-width="2.5"/>
      <path d="M50 35 C44 50 44 70 50 84 C56 70 56 50 50 35 Z" fill="#f2f0ea"/>
      <path d="M30 52 C36 50 42 56 42 64 C36 64 30 60 30 52 Z" fill="#26292c"/><path d="M70 52 C64 50 58 56 58 64 C64 64 70 60 70 52 Z" fill="#26292c"/>
      ${eye(38, 59, 2.5)}${eye(62, 59, 2.5)}<ellipse cx="50" cy="78" rx="4" ry="3" fill="${INK}"/>` },
    사슴: { shirt: "#8a3b2f", face: `
      <path d="M38 34 L30 10 M33 20 L24 16 M62 34 L70 10 M67 20 L76 16" stroke="#d8c9a0" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="22" cy="48" rx="11" ry="5" transform="rotate(-20 22 48)" fill="#a9713f" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="78" cy="48" rx="11" ry="5" transform="rotate(20 78 48)" fill="#a9713f" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="50" cy="60" rx="22" ry="28" fill="#a9713f" stroke="${INK}" stroke-width="2.5"/>
      <ellipse cx="50" cy="76" rx="13" ry="11" fill="#e9d6b4"/>
      ${eye(41, 54)}${eye(59, 54)}<circle cx="50" cy="72" r="5" fill="#e5484d" stroke="${INK}" stroke-width="1.5"/>${smile(80)}` },
    고슴도치: { shirt: "#3a5f7a", face: `
      <path d="M50 22 L58 30 L68 24 L70 36 L82 36 L78 48 L88 56 L78 62 L82 74 L22 74 L18 62 L12 56 L22 48 L18 36 L30 36 L32 24 L42 30 Z" fill="#5a3d2c" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="50" cy="66" rx="22" ry="20" fill="#e9d3a8" stroke="${INK}" stroke-width="2.5"/>
      ${eye(42, 62)}${eye(58, 62)}<circle cx="50" cy="72" r="3.5" fill="${INK}"/>${smile(77)}` },
    염소: { shirt: "#4a6b4a", face: `
      <path d="M38 36 C30 30 30 18 40 16" fill="none" stroke="#9a8a6a" stroke-width="5" stroke-linecap="round"/>
      <path d="M62 36 C70 30 70 18 60 16" fill="none" stroke="#9a8a6a" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="22" cy="48" rx="11" ry="5" transform="rotate(15 22 48)" fill="#e6e2d8" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="78" cy="48" rx="11" ry="5" transform="rotate(-15 78 48)" fill="#e6e2d8" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="50" cy="58" rx="21" ry="27" fill="#e6e2d8" stroke="${INK}" stroke-width="2.5"/>
      <path d="M44 82 L50 98 L56 82 Z" fill="#cfc8b8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <rect x="37" y="52" width="8" height="3" rx="1.5" fill="${INK}"/><rect x="55" y="52" width="8" height="3" rx="1.5" fill="${INK}"/>
      <ellipse cx="50" cy="72" rx="5" ry="3" fill="#b9a6a0"/>` },
    카피바라: { shirt: "#2f6b5a", face: `
      <circle cx="30" cy="38" r="6" fill="#7a5235" stroke="${INK}" stroke-width="2"/><circle cx="70" cy="38" r="6" fill="#7a5235" stroke="${INK}" stroke-width="2"/>
      <rect x="22" y="36" width="56" height="52" rx="20" fill="#9a6b45" stroke="${INK}" stroke-width="2.5"/>
      <rect x="32" y="62" width="36" height="24" rx="10" fill="#7a5235"/>
      <rect x="35" y="52" width="9" height="3" rx="1.5" fill="${INK}"/><rect x="56" y="52" width="9" height="3" rx="1.5" fill="${INK}"/>
      <ellipse cx="44" cy="70" rx="2.5" ry="2" fill="${INK}"/><ellipse cx="56" cy="70" rx="2.5" ry="2" fill="${INK}"/>
      <path d="M44 79 H56" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` },
  };
  const UNKNOWN = { shirt: "#1b1e28", bg: "#5a5f6b", face: `
      <ellipse cx="50" cy="58" rx="27" ry="29" fill="#1b1e28"/>
      <text x="50" y="72" text-anchor="middle" font-size="42" font-weight="900" fill="#e5484d" font-family="sans-serif">?</text>` };

  return function portraitSvg(animal) {
    const p = FACES[animal] || UNKNOWN;
    const bg = p.bg || "#cfe0ea";
    return `<svg viewBox="0 0 100 120" role="img" aria-label="${animal || "미등록"} 증명사진">
      <rect width="100" height="120" fill="${bg}"/>
      <path d="M8 120 C10 96 28 88 50 88 C72 88 90 96 92 120 Z" fill="${p.shirt}" stroke="${INK}" stroke-width="2.5"/>
      <path d="M40 89 L50 102 L60 89 Z" fill="#f2f0ea" stroke="${INK}" stroke-width="1.5"/>
      ${p.face}
    </svg>`;
  };
})();
