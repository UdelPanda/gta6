// Solstice City — every tuning number and colour in one place.
// The world is a fixed 4800 x 4800 pixel coastal city: a grid of streets
// every 600 px, a beach and the sea along the south edge, a park, a casino
// strip and a dock district. The renderer scales the canvas to the window,
// so no rule below depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = {
  size: 4800,
  pitch: 600, // distance between street centrelines
  road: 96, // street width, kerb to kerb
  beachY: 4380, // sand starts here
  waterY: 4560, // sea starts here
};

// The player's on-foot body and the wanted/health economy.
export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  sprintSpeed: 265,
  health: 100,
  punchDamage: 34,
  punchRange: 34,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolCooldown: 0.28,
  pistolMag: 12,
  reloadTime: 1.1,
  arrestRange: 30,
};

// Cars: how they drive, how hard they hit, how far the camera sits back.
export const CAR = {
  length: 62,
  width: 30,
  radius: 24,
  accel: 340,
  reverseAccel: 220,
  maxSpeed: 520,
  maxReverse: 160,
  drag: 0.55,
  offRoadDrag: 1.7,
  steer: 2.6,
  brake: 620,
  hitDamage: 22,
};

// Traffic and pedestrians: how many, how fast, how they behave.
export const TRAFFIC = {
  cars: 34,
  cruiseMin: 130,
  cruiseMax: 185,
  peds: 56,
  walkMin: 38,
  walkMax: 70,
  parked: 16,
};

// Police: how many cars per wanted star, how fast they are, how the heat fades.
export const POLICE = {
  maxCars: 6,
  speed: 560,
  ramDamage: 10,
  sightRange: 620,
  loseSightSeconds: 14,
  decaySeconds: 11,
  bustSeconds: 1.2,
};

// Wanted stars: points of heat needed to reach each star, and what each crime adds.
export const WANTED = {
  thresholds: [0, 60, 160, 320, 560, 900],
  stealCar: 70,
  hitPed: 90,
  shoot: 60,
  killCop: 200,
  shootNearCop: 40,
};

// Money: what the city pays, what getting caught costs.
export const MONEY = {
  start: 80,
  bustLoss: 0.25,
  wastedLoss: 0.2,
  pickup: 25,
};

// The minimap and the camera.
export const CAMERA = {
  footZoom: 1.0,
  carZoom: 0.82,
  lerp: 5.2,
};
export const MINIMAP = { size: 188, margin: 14 };

export const SAVE_KEY = 'solstice-city.save.v1';

// Sun-soaked coastal palette: sand, teal sea, pastel roofs, warm asphalt.
export const PALETTE = {
  ground: '#e6d6a4',
  grass: '#8fae5d',
  sand: '#ecd9a0',
  water: '#2fa8b5',
  waterDeep: '#1f7f9e',
  asphalt: '#3c414d',
  asphaltEdge: '#2e323d',
  lane: '#e8d98a',
  sidewalk: '#cbbd97',
  kerb: '#a89a78',
  roof: ['#e07856', '#e8a34c', '#7fb3a4', '#d96a7e', '#8fa8c8', '#c9b458', '#b98ac2', '#e8e0cc'],
  roofEdge: '#00000033',
  park: '#7da65a',
  tree: '#4d7a35',
  treeLight: '#6b9a48',
  text: '#f5efe0',
  muted: '#cfc4a8',
  panel: '#20242cee',
  panelBorder: '#f5efe055',
  accent: '#ffb03a',
  danger: '#ff5a4e',
  police: '#2b6fd6',
  player: '#ffcf3d',
  cash: '#7ee081',
  health: '#ff6b5e',
  objective: '#ffd94d',
  headlight: '#fff2b0',
};

export const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
