// Core Breach: Zero - battle map definitions (recon + missions). Pure data.
export const BATTLE_MAPS = {
  easy: {
    id: 'easy', difficulty: 'EASY', name: 'PERIMETER PATROL', sector: 'SECTOR 03 // OUTER FENCE LINE',
    mechanic: 'SINGLE VECTOR', hint: 'One long patrol lane into the reactor.',
    paths: ['M -60 150 H 250 Q 310 150 310 210 V 240 Q 310 300 370 300 H 630 Q 690 300 690 360 V 390 Q 690 450 750 450 H 940'],
    core: { x: 940, y: 450 }, spawns: [[0, 150]],
    pads: [[140, 90], [260, 230], [420, 210], [560, 210], [330, 390], [470, 390], [610, 390], [820, 350], [820, 540], [660, 510], [240, 60]],
    zones: [], gates: [],
  },
  medium: {
    id: 'medium', difficulty: 'MEDIUM', name: 'IRON JUNCTION', sector: 'SECTOR 12 // FREIGHT CROSSROADS',
    mechanic: 'JUNCTION SPLIT', hint: 'The stream forks at the junction — cover both branches.',
    paths: [
      'M -60 300 H 300 Q 340 300 340 260 V 200 Q 340 160 380 160 H 520 Q 560 160 560 200 V 260 Q 560 300 600 300 H 940',
      'M -60 300 H 300 Q 340 300 340 340 V 400 Q 340 440 380 440 H 520 Q 560 440 560 400 V 340 Q 560 300 600 300 H 940',
    ],
    core: { x: 940, y: 300 }, spawns: [[0, 300]],
    pads: [[430, 300], [490, 220], [490, 380], [240, 210], [240, 390], [660, 210], [660, 390], [760, 300], [430, 90], [430, 510], [850, 210], [850, 390]],
    zones: [], gates: [],
  },
  hard: {
    id: 'hard', difficulty: 'HARD', name: 'MELTDOWN GRID', sector: 'SECTOR 21 // COOLING FIELD',
    mechanic: 'DUAL LANE', hint: 'Two independent lanes converge on the reactor.',
    paths: [
      'M -60 110 H 700 Q 760 110 760 170 V 240 Q 760 300 700 300 H 505',
      'M -60 490 H 300 Q 240 490 240 430 V 360 Q 240 300 300 300 H 505',
    ],
    core: { x: 505, y: 300 }, spawns: [[0, 110], [0, 490]],
    pads: [[180, 210], [320, 210], [470, 210], [620, 210], [180, 390], [320, 390], [470, 390], [620, 390], [860, 180], [860, 420], [60, 300], [900, 300], [400, 60], [400, 540]],
    zones: [], gates: [],
  },
  insane: {
    id: 'insane', difficulty: 'INSANE', name: 'OVERLOAD SPIRE', sector: 'SECTOR 47 // VERTIGO SPIRE',
    mechanic: 'SPIRAL LOCK + OVERCHARGE', hint: 'A tightening spiral laced with haste fields.',
    paths: ['M -60 60 H 850 Q 920 60 920 130 V 470 Q 920 540 850 540 H 150 Q 80 540 80 470 V 130 Q 80 150 150 150 H 760 Q 830 150 830 220 V 380 Q 830 450 760 450 H 240 Q 170 450 170 380 V 220 Q 170 240 240 240 H 640 Q 700 240 700 300 H 545'],
    core: { x: 545, y: 300 }, spawns: [[0, 60]],
    pads: [[350, 105], [650, 105], [400, 195], [600, 195], [400, 405], [600, 405], [350, 495], [650, 495], [125, 300], [875, 300], [350, 300], [450, 300]],
    zones: [
      { x: 450, y: 60, r: 58, label: 'OVERCHARGE' },
      { x: 500, y: 450, r: 58, label: 'OVERCHARGE' },
    ],
    gates: [],
  },
  cbz: {
    id: 'cbz', difficulty: 'CBZ', name: 'CORE: ZERO', sector: 'SECTOR 00 // REACTOR CHAMBER',
    mechanic: 'PHASE GRID', hint: 'Twin lanes wired with hostile phase gates.',
    paths: [
      'M -60 150 H 760 Q 820 150 820 210 V 240 Q 820 300 760 300 H 505',
      'M 1060 450 H 240 Q 180 450 180 390 V 360 Q 180 300 240 300 H 505',
    ],
    core: { x: 505, y: 300 }, spawns: [[0, 150], [1060, 450]],
    pads: [[140, 80], [380, 80], [620, 80], [500, 80], [100, 230], [340, 230], [580, 230], [880, 230], [140, 520], [380, 520], [620, 520], [860, 520], [60, 300], [940, 300], [60, 180], [940, 420]],
    zones: [],
    gates: [
      { x: 400, y: 150, toX: 760, toY: 450 },
      { x: 600, y: 450, toX: 240, toY: 150 },
    ],
  },
};

// Event-exclusive battleground — deliberately NOT in BATTLE_MAPS, so it never leaks
// into co-op bay pickers or solo map recon. The Crimson Dawn deploys here alone.
export const CRIMSON_MAP = {
  id: 'crimson', difficulty: 'CRIMSON', name: 'THE CRIMSON WELL', sector: 'SECTOR \u221E // BELOW THE SIGNAL',
  mechanic: 'TWIN VEINS + PHASE TEARS', hint: 'Two burning veins graft into one artery before the Well.',
  theme: 'crimson', event: true, // event gamemode — the mission debrief never offers a retry
  paths: [
    'M -60 120 H 150 Q 220 120 220 190 V 240 Q 220 300 290 300 H 380 Q 450 300 450 360 V 410 Q 450 470 520 470 H 640 Q 700 470 700 410 V 370 Q 700 300 630 300 H 505',
    'M 1060 480 H 860 Q 790 480 790 410 V 360 Q 790 300 720 300 H 690 Q 630 300 630 240 V 190 Q 630 130 570 130 H 370 Q 310 130 310 190 V 230 Q 310 300 380 300 H 505',
  ],
  core: { x: 505, y: 300 }, spawns: [[0, 120], [1060, 480]],
  pads: [[60, 60], [300, 60], [505, 60], [700, 60], [940, 60], [140, 210], [60, 300], [505, 180], [700, 200], [860, 180], [940, 300], [900, 400], [140, 420], [300, 420], [505, 420], [400, 540], [820, 540], [200, 540], [300, 225], [700, 365]],
  zones: [],
  gates: [
    { x: 430, y: 300, toX: 130, toY: 120 },
    { x: 450, y: 130, toX: 560, toY: 470 },
  ],
};
