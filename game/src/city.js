// Solstice City: a deterministic coastal grid, built once from the seed.
// Streets run every 600 px; the blocks between them hold buildings, parks,
// the casino strip, the docks and the hideout. The beach and the sea close
// the south edge. Everything here is pure data: drawing lives in render.js.

import { WORLD, PALETTE } from './config.js';
import { pick, range, rangeInt, shuffle } from './random.js';

const STREET_COUNT = 8; // centrelines at 0, 600, ... 4200, plus the edge road

/** A building: a rectangle with a roof colour, a height class and roof props. */
function makeBuilding(random, x, y, w, h) {
  return {
    x, y, w, h,
    roof: pick(random, PALETTE.roof),
    tall: random() < 0.3,
    vents: rangeInt(random, 0, 3),
    pool: random() < 0.12,
    seed: random(),
  };
}

/**
 * Build the city from the seed. Returns buildings, trees, parks, water, the
 * named landmarks (casino, bank, docks, hideout, motel, airstrip, hospital,
 * police station) and the road centreline list.
 */
export function createCity(random) {
  const { size, pitch, road, beachY, waterY } = WORLD;
  const half = road / 2;
  const streets = [];
  for (let i = 0; i <= STREET_COUNT; i += 1) streets.push(i * pitch);

  const buildings = [];
  const trees = [];
  const parks = [];
  const landmarks = {};

  // One special block each, spread across the map so missions cross the city.
  const specials = {
    casino: { bx: 5, by: 1, name: 'The Countess Casino' },
    bank: { bx: 4, by: 3, name: 'Solstice Bank' },
    docks: { bx: 0, by: 5, name: 'Marina Docks' },
    hideout: { bx: 2, by: 5, name: 'Hideout' },
    motel: { bx: 1, by: 2, name: 'Sunset Motel' },
    hospital: { bx: 6, by: 4, name: 'St. Palma Hospital' },
    station: { bx: 3, by: 1, name: 'Central Precinct' },
    airstrip: { bx: 6, by: 0, name: 'Palm Airstrip' },
    chopshop: { bx: 0, by: 3, name: "Big Al's Chop Shop" },
  };
  const specialAt = new Map();
  for (const [key, s] of Object.entries(specials)) specialAt.set(`${s.bx},${s.by}`, key);

  // Blocks are the squares between streets: block (bx, by) spans
  // [bx*pitch + half, (bx+1)*pitch - half] in both axes, for bx,by in 0..7.
  // The southern row (by 7) is beach; the far south is sea.
  for (let by = 0; by < 8; by += 1) {
    for (let bx = 0; bx < 8; bx += 1) {
      const x0 = bx * pitch + half + 14;
      const y0 = by * pitch + half + 14;
      const x1 = (bx + 1) * pitch - half - 14;
      const y1 = (by + 1) * pitch - half - 14;
      const key = specialAt.get(`${bx},${by}`);
      if (by === 7) {
        // Beach row: a few palm trees and the boardwalk, no buildings.
        for (let i = 0; i < 6; i += 1) {
          trees.push({ x: range(random, x0, x1), y: range(random, y0, y1), r: range(random, 9, 13) });
        }
        continue;
      }
      if (key) {
        // Landmark block: one big building with a forecourt, plus its sign spot.
        const bw = Math.min(300, x1 - x0 - 90);
        const bh = Math.min(210, y1 - y0 - 90);
        const b = makeBuilding(random, x0 + (x1 - x0 - bw) / 2, y0 + 30, bw, bh);
        b.landmark = key;
        buildings.push(b);
        landmarks[key] = {
          x: b.x + b.w / 2,
          y: b.y + b.h + 44,
          name: specials[key].name,
          bx, by,
        };
        for (let i = 0; i < 3; i += 1) {
          trees.push({ x: range(random, x0, x1), y: range(random, y0 + b.h + 90, y1), r: range(random, 8, 12) });
        }
        continue;
      }
      if (random() < 0.16) {
        // Park block: lawn and trees, no buildings.
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: range(random, x0 + 20, x1 - 20), y: range(random, y0 + 20, y1 - 20), r: range(random, 9, 14) });
        }
        continue;
      }
      // Ordinary block: two to four buildings along its edges.
      const count = rangeInt(random, 2, 4);
      const slots = shuffle(random, [0, 1, 2, 3]).slice(0, count);
      for (const slot of slots) {
        const w = range(random, 120, 210);
        const h = range(random, 110, 190);
        let x, y;
        if (slot === 0) { x = x0; y = y0; }
        else if (slot === 1) { x = x1 - w; y = y0; }
        else if (slot === 2) { x = x0; y = y1 - h; }
        else { x = x1 - w; y = y1 - h; }
        buildings.push(makeBuilding(random, x, y, w, h));
      }
      if (random() < 0.5) {
        trees.push({ x: range(random, x0 + 30, x1 - 30), y: range(random, y0 + 30, y1 - 30), r: range(random, 8, 12) });
      }
    }
  }

  return { size, pitch, road, beachY, waterY, streets, buildings, trees, parks, landmarks };
}

/** True when the point is on a street (not inside a block). */
export function onRoad(city, x, y) {
  const { pitch, road } = city;
  const half = road / 2;
  const fx = ((x % pitch) + pitch) % pitch;
  const fy = ((y % pitch) + pitch) % pitch;
  const nearX = fx < half || fx > pitch - half;
  const nearY = fy < half || fy > pitch - half;
  return nearX || nearY;
}

/** True when the point is in the sea (not drivable, not walkable). */
export function inWater(city, x, y) {
  return y >= city.waterY;
}

/** True when the point is on sand (drivable, but slow). */
export function onSand(city, x, y) {
  return y >= city.beachY && y < city.waterY;
}

/** The nearest street centreline coordinate to a point, on one axis. */
export function nearestStreet(city, value) {
  return Math.round(value / city.pitch) * city.pitch;
}

/** Circle-vs-buildings collision: push the circle out of any building it overlaps. */
export function collideBuildings(city, body) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.r * body.r) continue;
    if (d2 === 0) {
      body.x += body.r;
      continue;
    }
    const d = Math.sqrt(d2);
    const push = (body.r - d) / d;
    body.x += dx * push;
    body.y += dy * push;
  }
}

/** True when a circle overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** Clamp a point into the world, keeping it out of the sea. */
export function clampToWorld(city, body, margin) {
  body.x = Math.max(margin, Math.min(city.size - margin, body.x));
  body.y = Math.max(margin, Math.min(city.waterY - margin, body.y));
}

/** A random point on a street, for spawning cars and pedestrians. */
export function randomRoadPoint(random, city) {
  const horizontal = random() < 0.5;
  const street = Math.floor(random() * (STREET_COUNT + 1)) * city.pitch;
  const along = range(random, 100, city.size - 100);
  if (horizontal) return { x: along, y: street + (random() < 0.5 ? -18 : 18) };
  return { x: street + (random() < 0.5 ? -18 : 18), y: along };
}
