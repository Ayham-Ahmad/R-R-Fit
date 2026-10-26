const avatarCache = new Map();
const stickmanCache = new Map();

function createDrawingAvatar(preset) {
  const cacheKey = String(preset || "sara");
  if (avatarCache.has(cacheKey)) return avatarCache.get(cacheKey);
  const palettes = {
    coach: { bg: "#F9E6E8",ring: "#C87D87", hair: "#4A2E35", skin: "#F7DFD4", shirt: "#C87D87", accent: "#D4AF37", style: "hijab_crown" },
    sara:  { bg: "#FDF1E6",ring: "#D96B52", hair: "#3B2822", skin: "#F9E2D2", shirt: "#D96B52", accent: "#8FA895", style: "ponytail_visor" },
    reem:  { bg: "#ECE8F8",ring: "#5D3FD3", hair: "#2E2540", skin: "#F6DEC9", shirt: "#7A5AF8", accent: "#E5C158", style: "hijab_sport" },
    maha:  { bg: "#E9F0EB",ring: "#6A9478", hair: "#47332B", skin: "#F5D9C6", shirt: "#6A9478", accent: "#C87D87", style: "bun_headband" },
    noura: { bg: "#F6EFEA",ring: "#9A7B6E", hair: "#362723", skin: "#F6DFCF", shirt: "#9A7B6E", accent: "#C87D87", style: "braid_cap" }
  };
  const p = palettes[preset] || palettes.sara;

  let characterArt = "";

  if (p.style === "hijab_crown" || p.style === "hijab_sport") {
    /* Modest Sporty Hijab Drawing Illustration */
    characterArt = `
      <!-- Shoulders / Sport Jacket Drawing -->
      <path d="M24,120 C26,90 42,82 60,82 C78,82 94,90 96,120 Z" fill="${p.shirt}" stroke="#2D2628" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M48,84 L60,104 L72,84" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" />
      <!-- Hijab Wrap Drawing -->
      <path d="M35,54 C35,32 46,22 60,22 C74,22 85,32 85,54 C85,74 75,86 60,88 C45,86 35,74 35,54 Z" fill="${p.hair}" stroke="#2D2628" stroke-width="2.5" />
      <!-- Face Drawing -->
      <ellipse cx="60" cy="54" rx="17" ry="19" fill="${p.skin}" stroke="#2D2628" stroke-width="2.3" />
      <!-- Hijab Forehead Band -->
      <path d="M43,46 Q60,38 77,46" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round" />
      <!-- Minimalist Line-Art Eyes, Lashes & Warm Smile -->
      <path d="M50,53 Q53,50 56,53" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
      <path d="M64,53 Q67,50 70,53" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
      <circle cx="48" cy="58" r="3" fill="#F2A6A6" opacity="0.55" />
      <circle cx="72" cy="58" r="3" fill="#F2A6A6" opacity="0.55" />
      <path d="M55,63 Q60,67 65,63" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
      <!-- Small Dumbbell Sketch Icon on Collar -->
      <circle cx="60" cy="96" r="4" fill="${p.accent}" stroke="#2D2628" stroke-width="1.8" />
    `;
  } else if (p.style === "bun_headband") {
    /* Sporty Top-Bun & Headband Drawing Illustration */
    characterArt = `
      <!-- High Bun Drawing -->
      <circle cx="60" cy="20" r="12" fill="${p.hair}" stroke="#2D2628" stroke-width="2.5" />
      <path d="M51,26 Q60,21 69,26" fill="none" stroke="${p.accent}" stroke-width="3.5" stroke-linecap="round" />
      <!-- Shoulders / Activewear Top -->
      <path d="M25,120 C28,90 42,82 60,82 C78,82 92,90 95,120 Z" fill="${p.shirt}" stroke="#2D2628" stroke-width="2.5" />
      <path d="M45,83 Q60,96 75,83" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" />
      <!-- Neck -->
      <rect x="54" y="70" width="12" height="15" rx="5" fill="${p.skin}" stroke="#2D2628" stroke-width="2.2" />
      <!-- Hair Frame -->
      <path d="M38,52 C38,32 48,25 60,25 C72,25 82,32 82,52" fill="${p.hair}" stroke="#2D2628" stroke-width="2.5" />
      <!-- Face -->
      <ellipse cx="60" cy="55" rx="18" ry="20" fill="${p.skin}" stroke="#2D2628" stroke-width="2.3" />
      <!-- Sporty Headband -->
      <path d="M41,44 Q60,36 79,44" fill="none" stroke="${p.accent}" stroke-width="4.5" stroke-linecap="round" />
      <!-- Eyes & Smile -->
      <circle cx="53" cy="54" r="2.2" fill="#2D2628" />
      <circle cx="67" cy="54" r="2.2" fill="#2D2628" />
      <path d="M50,49 Q53,47 56,49" fill="none" stroke="#2D2628" stroke-width="1.8" stroke-linecap="round" />
      <path d="M64,49 Q67,47 70,49" fill="none" stroke="#2D2628" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="48" cy="59" r="3" fill="#F2A6A6" opacity="0.55" />
      <circle cx="72" cy="59" r="3" fill="#F2A6A6" opacity="0.55" />
      <path d="M55,64 Q60,68 65,64" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
    `;
  } else {
    /* Sporty Ponytail & Fitness Hoodie Drawing Illustration */
    characterArt = `
      <!-- Flowing Ponytail Drawing -->
      <path d="M76,36 C92,34 98,52 90,68 C84,64 80,54 76,46 Z" fill="${p.hair}" stroke="#2D2628" stroke-width="2.5" stroke-linejoin="round" />
      <!-- Shoulders / Sport Top -->
      <path d="M24,120 C27,90 42,82 60,82 C78,82 93,90 96,120 Z" fill="${p.shirt}" stroke="#2D2628" stroke-width="2.5" />
      <!-- Towel / Collar Detail -->
      <path d="M44,82 L60,98 L76,82" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Neck -->
      <rect x="54" y="70" width="12" height="15" rx="5" fill="${p.skin}" stroke="#2D2628" stroke-width="2.2" />
      <!-- Face & Hair Sweep -->
      <ellipse cx="58" cy="54" rx="18" ry="20" fill="${p.skin}" stroke="#2D2628" stroke-width="2.3" />
      <path d="M40,50 C40,32 50,26 62,26 C72,26 78,34 77,48 C68,40 52,40 40,50 Z" fill="${p.hair}" stroke="#2D2628" stroke-width="2.4" stroke-linejoin="round" />
      <!-- Happy Winking / Smiling Expression -->
      <path d="M49,53 Q52,50 55,53" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
      <path d="M62,53 Q65,50 68,53" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
      <circle cx="47" cy="58" r="3" fill="#F2A6A6" opacity="0.55" />
      <circle cx="70" cy="58" r="3" fill="#F2A6A6" opacity="0.55" />
      <path d="M53,63 Q58,68 64,63" fill="none" stroke="#2D2628" stroke-width="2.2" stroke-linecap="round" />
    `;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100%" height="100%">
    <rect width="120" height="120" rx="60" fill="${p.bg}" />
    <circle cx="24" cy="26" r="4" fill="${p.accent}" opacity="0.45" />
    <circle cx="96" cy="28" r="5" fill="${p.ring}" opacity="0.3" />
    ${characterArt}
  </svg>`;

  const avatar = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  avatarCache.set(cacheKey, avatar);
  return avatar;
}

/* ==========================================================================
   ★ 3. STICKMAN ANIMATED GIF GENERATOR (MINIMALIST STICKMAN STYLE) ★
   ========================================================================== */
function createStickmanGif(type) {
  const cacheKey = String(type || "");
  if (stickmanCache.has(cacheKey)) return stickmanCache.get(cacheKey);
  let innerSvg = "";

  if (type === "squat") {
    innerSvg = `
      <circle cx="120" cy="60" r="7.5" fill="#C87D87" stroke="#2D2628" stroke-width="2.5">
        <animate attributeName="cy" values="60;84;60" dur="1.7s" repeatCount="indefinite" />
      </circle>
      <path d="M128,30 Q142,27 144,38" stroke="#C87D87" stroke-width="4" stroke-linecap="round" fill="none">
        <animate attributeName="d" values="M128,30 Q142,27 144,38; M128,54 Q144,51 146,62; M128,30 Q142,27 144,38" dur="1.7s" repeatCount="indefinite" />
      </path>
      <circle cx="120" cy="32" r="10" fill="#FFFFFF" stroke="#2D2628" stroke-width="4">
        <animate attributeName="cy" values="32;56;32" dur="1.7s" repeatCount="indefinite" />
      </circle>
      <line x1="120" y1="42" x2="120" y2="80" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round">
        <animate attributeName="y1" values="42;66;42" dur="1.7s" repeatCount="indefinite" />
        <animate attributeName="y2" values="80;104;80" dur="1.7s" repeatCount="indefinite" />
      </line>
      <path d="M120,50 L105,66 L120,60 L135,66 L120,50" stroke="#2D2628" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M120,50 L105,66 L120,60 L135,66 L120,50; M120,74 L105,90 L120,84 L135,90 L120,74; M120,50 L105,66 L120,60 L135,66 L120,50" dur="1.7s" repeatCount="indefinite" />
      </path>
      <path d="M120,80 L106,104 L100,128" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M120,80 L106,104 L100,128; M120,104 L88,102 L100,128; M120,80 L106,104 L100,128" dur="1.7s" repeatCount="indefinite" />
      </path>
      <path d="M120,80 L134,104 L140,128" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M120,80 L134,104 L140,128; M120,104 L152,102 L140,128; M120,80 L134,104 L140,128" dur="1.7s" repeatCount="indefinite" />
      </path>
    `;
  } else if (type === "hipthrust") {
    innerSvg = `
      <rect x="44" y="92" width="36" height="36" rx="6" fill="#ECDFDC" stroke="#C87D87" stroke-width="2.5" />
      <path d="M66,74 Q54,72 52,82" stroke="#C87D87" stroke-width="4" stroke-linecap="round" fill="none" />
      <circle cx="76" cy="76" r="9.5" fill="#FFFFFF" stroke="#2D2628" stroke-width="4">
        <animate attributeName="cy" values="78;73;78" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <path d="M82,90 L122,116 L156,88 L158,128" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M82,90 L122,116 L156,88 L158,128; M82,90 L122,86 L156,88 L158,128; M82,90 L122,116 L156,88 L158,128" dur="1.8s" repeatCount="indefinite" />
      </path>
      <path d="M88,90 L122,110" stroke="#2D2628" stroke-width="3.8" stroke-linecap="round" fill="none">
        <animate attributeName="d" values="M88,90 L122,110; M88,90 L122,80; M88,90 L122,110" dur="1.8s" repeatCount="indefinite" />
      </path>
      <circle cx="122" cy="110" r="9" fill="#C87D87" stroke="#2D2628" stroke-width="2.5">
        <animate attributeName="cy" values="110;80;110" dur="1.8s" repeatCount="indefinite" />
      </circle>
    `;
  } else if (type === "plank") {
    innerSvg = `
      <circle cx="122" cy="94" r="10" fill="none" stroke="#C87D87" stroke-width="2.5">
        <animate attributeName="r" values="6;22;6" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.85;0.1;0.85" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <path d="M62,72 Q52,64 48,74" stroke="#C87D87" stroke-width="4" stroke-linecap="round" fill="none" />
      <circle cx="68" cy="80" r="9.5" fill="#FFFFFF" stroke="#2D2628" stroke-width="4">
        <animate attributeName="cy" values="81;77;81" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <path d="M82,86 L78,128 L62,128" stroke="#2D2628" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M82,86 L78,128 L62,128; M82,82 L78,128 L62,128; M82,86 L78,128 L62,128" dur="1.6s" repeatCount="indefinite" />
      </path>
      <path d="M78,86 L128,92 L178,126" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M78,86 L128,92 L178,126; M78,82 L128,87 L178,126; M78,86 L128,92 L178,126" dur="1.6s" repeatCount="indefinite" />
      </path>
    `;
  } else if (type === "latpulldown") {
    innerSvg = `
      <line x1="120" y1="8" x2="120" y2="34" stroke="#8FA895" stroke-width="3">
        <animate attributeName="y2" values="32;62;32" dur="1.8s" repeatCount="indefinite" />
      </line>
      <line x1="82" y1="32" x2="158" y2="32" stroke="#C87D87" stroke-width="4.5" stroke-linecap="round">
        <animate attributeName="y1" values="32;62;32" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="y2" values="32;62;32" dur="1.8s" repeatCount="indefinite" />
      </line>
      <circle cx="120" cy="52" r="9.5" fill="#FFFFFF" stroke="#2D2628" stroke-width="4" />
      <path d="M120,62 L120,104 L144,104 L144,128" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <line x1="106" y1="108" x2="134" y2="108" stroke="#C87D87" stroke-width="4" stroke-linecap="round" />
      <line x1="120" y1="108" x2="120" y2="128" stroke="#C87D87" stroke-width="4" stroke-linecap="round" />
      <path d="M88,32 L100,52 L120,68 L140,52 L152,32" stroke="#2D2628" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M88,32 L100,52 L120,68 L140,52 L152,32; M88,62 L98,84 L120,68 L142,84 L152,62; M88,32 L100,52 L120,68 L140,52 L152,32" dur="1.8s" repeatCount="indefinite" />
      </path>
    `;
  } else if (type === "shoulderpress") {
    innerSvg = `
      <path d="M128,48 Q142,46 144,56" stroke="#C87D87" stroke-width="4" stroke-linecap="round" fill="none" />
      <circle cx="120" cy="52" r="9.5" fill="#FFFFFF" stroke="#2D2628" stroke-width="4" />
      <line x1="120" y1="62" x2="120" y2="102" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" />
      <path d="M102,128 L108,102 L120,102 L132,102 L138,128" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <path d="M90,62 L96,84 L120,70 L144,84 L150,62" stroke="#2D2628" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M90,62 L96,84 L120,70 L144,84 L150,62; M96,24 L104,48 L120,70 L136,48 L144,24; M90,62 L96,84 L120,70 L144,84 L150,62" dur="1.6s" repeatCount="indefinite" />
      </path>
      <line x1="82" y1="62" x2="98" y2="62" stroke="#C87D87" stroke-width="5" stroke-linecap="round">
        <animate attributeName="x1" values="82;88;82" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="x2" values="98;104;98" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="y1" values="62;24;62" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="y2" values="62;24;62" dur="1.6s" repeatCount="indefinite" />
      </line>
      <line x1="142" y1="62" x2="158" y2="62" stroke="#C87D87" stroke-width="5" stroke-linecap="round">
        <animate attributeName="x1" values="142;136;142" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="x2" values="158;152;158" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="y1" values="62;24;62" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="y2" values="62;24;62" dur="1.6s" repeatCount="indefinite" />
      </line>
    `;
  } else {
    innerSvg = `
      <rect x="116" y="116" width="46" height="12" rx="4" fill="#C87D87" />
      <path d="M100,32 Q86,28 84,40" stroke="#C87D87" stroke-width="4" stroke-linecap="round" fill="none">
        <animate attributeName="d" values="M100,32 Q86,28 84,40; M118,22 Q104,18 102,30; M100,32 Q86,28 84,40" dur="1.2s" repeatCount="indefinite" />
      </path>
      <circle cx="110" cy="34" r="9.5" fill="#FFFFFF" stroke="#2D2628" stroke-width="4">
        <animate attributeName="cx" values="110;128;110" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="cy" values="34;24;34" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <line x1="110" y1="44" x2="110" y2="82" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round">
        <animate attributeName="x1" values="110;128;110" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="x2" values="110;128;110" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="y1" values="44;34;44" dur="1.2s" repeatCount="indefinite" />
        <animate attributeName="y2" values="82;72;82" dur="1.2s" repeatCount="indefinite" />
      </line>
      <path d="M94,68 L110,52 L128,64" stroke="#2D2628" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M94,68 L110,52 L128,64; M112,56 L128,42 L146,56; M94,68 L110,52 L128,64" dur="1.2s" repeatCount="indefinite" />
      </path>
      <path d="M96,128 L110,82 L134,96 L136,116" stroke="#2D2628" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <animate attributeName="d" values="M96,128 L110,82 L134,96 L136,116; M116,104 L128,72 L140,94 L140,116; M96,128 L110,82 L134,96 L136,116" dur="1.2s" repeatCount="indefinite" />
      </path>
    `;
  }

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 145" width="100%" height="100%">
    <rect width="240" height="145" rx="12" fill="#FDF6F4" />
    <line x1="28" y1="128" x2="212" y2="128" stroke="#E2D2CE" stroke-width="3.5" stroke-linecap="round" />
    <circle cx="24" cy="22" r="11" fill="#F9E6E8" />
    <text x="24" y="26" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C87D87" text-anchor="middle">⟳</text>
    ${innerSvg}
  </svg>`;

  const stickman = "data:image/svg+xml;utf8," + encodeURIComponent(fullSvg);
  stickmanCache.set(cacheKey, stickman);
  return stickman;
}

export { createDrawingAvatar, createStickmanGif };
