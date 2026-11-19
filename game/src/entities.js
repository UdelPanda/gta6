// The city's other inhabitants: traffic cars that follow the street grid,
// pedestrians who walk the sidewalks and flee from trouble, parked cars to
// steal, and the cash and ammo pickups scattered around. Nothing here draws;
// render.js paints what these functions move.

import { TRAFFIC, PALETTE } from './config.js';
import { clamp, distance, pick, range, rangeInt } from './random.js';
import { hitsBuilding, onRoad, randomRoadPoint } from './city.js';

const CAR_COLORS = ['#d94f3d', '#3d7bd9', '#e8c33a', '#7a7f8c', '#4fae62', '#c25ab0', '#e8e4da', '#2f333d', '#e07b39', '#5ec4c4'];
const SHIRTS = ['#ff8a5c', '#5cb8ff', '#ffd94d', '#9be15d', '#ff6b9d', '#b18cff', '#f2f2f2', '#3dd6c4'];
const KINDS = [
  { name: 'sedan', length: 62, width: 30, cruise: 1.0 },
  { name: 'taxi', length: 62, width: 30, cruise: 0.95 },
  { name: 'van', length: 74, width: 32, cruise: 0.8 },
  { name: 'sport', length: 58, width: 28, cruise: 1.25 },
  { name: 'truck', length: 84, width: 34, cruise: 0.7 },
];

function laneOffset(angle) {
  // Right-hand traffic: the lane sits 18 px to the right of the heading.
  return { x: -Math.sin(angle) * 18, y: Math.cos(angle) * 18 };
}

function curbOffset(angle) {
  // Parked at the kerb: 54 px to the right of the heading. A car in the
  // driving lane (18 px) passes 36 px from the parked car's centre — clear
  // of its body — so the lane stays drivable and nobody gets shoved into
  // the buildings. The car sits tight to the wall, as parked cars do.
  return { x: -Math.sin(angle) * 54, y: Math.cos(angle) * 54 };
}

function makeTrafficCar(random, city, parked) {
  const kind = pick(random, KINDS);
  const point = randomRoadPoint(random, city);
  const horizontal = random() < 0.5;
  const angle = horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  const off = parked ? curbOffset(angle) : laneOffset(angle);
  const street = horizontal ? Math.round(point.y / city.pitch) * city.pitch : Math.round(point.x / city.pitch) * city.pitch;
  const x = horizontal ? point.x : street + off.x;
  const y = horizontal ? street + off.y : point.y;
  return {
    x, y, angle,
    speed: parked ? 0 : range(random, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax) * kind.cruise,
    cruise: range(random, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax) * kind.cruise,
    kind: kind.name, length: kind.length, width: kind.width,
    color: kind.name === 'taxi' ? '#f2c230' : pick(random, CAR_COLORS),
    parked: !!parked,
    turnedAt: '',
    wait: 0,
    dodge: 0,
    driver: !parked,
  };
}

function makePed(random, city) {
  const point = randomRoadPoint(random, city);
  const horizontal = random() < 0.5;
  const angle = horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  const off = 66; // sidewalk, just outside the kerb
  const street = horizontal ? Math.round(point.y / city.pitch) * city.pitch : Math.round(point.x / city.pitch) * city.pitch;
  const x = horizontal ? point.x : street + (angle === Math.PI / 2 ? -off : off);
  const y = horizontal ? street + (angle === 0 ? off : -off) : point.y;
  return {
    x, y, angle,
    speed: range(random, TRAFFIC.walkMin, TRAFFIC.walkMax),
    shirt: pick(random, SHIRTS),
    skin: pick(random, ['#f2c29b', '#d9a06b', '#a06b3f', '#8a5a2e']),
    state: 'walk',
    stateT: range(random, 2, 8),
    down: 0,
    seed: random(),
  };
}

export function createEntities(random, city) {
  const traffic = [];
  const peds = [];
  const pickups = [];
  for (let i = 0; i < TRAFFIC.cars; i += 1) traffic.push(makeTrafficCar(random, city, false));
  for (let i = 0; i < TRAFFIC.parked; i += 1) traffic.push(makeTrafficCar(random, city, true));
  for (let i = 0; i < TRAFFIC.peds; i += 1) peds.push(makePed(random, city));
  for (let i = 0; i < 10; i += 1) {
    const p = randomRoadPoint(random, city);
    pickups.push({ x: p.x, y: p.y, kind: i < 7 ? 'cash' : 'ammo', amount: i < 7 ? 25 : 12, bob: random() * 6 });
  }

  const events = [];

  function carAhead(car, rangePx) {
    const hx = Math.cos(car.angle);
    const hy = Math.sin(car.angle);
    let nearest = null;
    let nearestD = rangePx;
    for (const other of traffic) {
      if (other === car || other.parked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * hx + dy * hy;
      const side = Math.abs(-dx * hy + dy * hx);
      if (along > 0 && along < nearestD && side < 34) {
        nearest = other;
        nearestD = along;
      }
    }
    return nearest;
  }

  /** The nearest parked car ahead, within rangePx — what a driver must steer around. */
  function parkedCarAhead(car, rangePx) {
    const hx = Math.cos(car.angle);
    const hy = Math.sin(car.angle);
    for (const other of traffic) {
      if (other === car || !other.parked) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * hx + dy * hy;
      const side = Math.abs(-dx * hy + dy * hx);
      if (along > 0 && along < rangePx && side < 42) return other;
    }
    return null;
  }

  function stepTraffic(dt, player) {
    for (const car of traffic) {
      if (car.parked) continue;
      // Decide at intersections: mostly straight, sometimes a turn.
      const ix = Math.round(car.x / city.pitch);
      const iy = Math.round(car.y / city.pitch);
      const cx = ix * city.pitch;
      const cy = iy * city.pitch;
      const key = `${ix},${iy}`;
      if (Math.abs(car.x - cx) < 26 && Math.abs(car.y - cy) < 26 && car.turnedAt !== key) {
        car.turnedAt = key;
        car.dodge = 0;
        const roll = random();
        let next = car.angle;
        if (roll < 0.14) next = car.angle - Math.PI / 2;
        else if (roll < 0.28) next = car.angle + Math.PI / 2;
        if (next !== car.angle) {
          car.angle = ((next + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
          const off = laneOffset(car.angle);
          if (Math.abs(Math.cos(car.angle)) > 0.5) car.y = cy + off.y;
          else car.x = cx + off.x;
        }
      }
      // Slow for the car ahead, and for the player's car.
      let target = car.cruise;
      const ahead = carAhead(car, 95);
      if (ahead) target = Math.min(target, ahead.speed * 0.9);
      if (player && player.inCar) {
        const d = distance(car.x, car.y, player.carX, player.carY);
        if (d < 110) {
          const hx = Math.cos(car.angle);
          const hy = Math.sin(car.angle);
          const along = (player.carX - car.x) * hx + (player.carY - car.y) * hy;
          if (along > 0) target = 0;
        }
      }
      car.speed = clamp(car.speed + (target - car.speed) * Math.min(1, dt * 1.6), 0, car.cruise * 1.3);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      // Dodge around a parked car ahead: swing into the opposite lane to
      // pass it, then drift back. (Traffic never slows for parked cars —
      // it goes around them, like a real driver.)
      const parkedAhead = parkedCarAhead(car, 170);
      car.dodge = clamp(car.dodge + (parkedAhead ? dt * 2.5 : -dt * 2.5), 0, 1);
      if (car.dodge > 0) {
        const off = laneOffset(car.angle);
        if (Math.abs(Math.cos(car.angle)) > 0.5) {
          const street = Math.round(car.y / city.pitch) * city.pitch;
          const targetY = street + off.y * (1 - 2 * car.dodge);
          car.y += (targetY - car.y) * Math.min(1, dt * 4);
        } else {
          const street = Math.round(car.x / city.pitch) * city.pitch;
          const targetX = street + off.x * (1 - 2 * car.dodge);
          car.x += (targetX - car.x) * Math.min(1, dt * 4);
        }
      }
      // Wrap around the world edges so traffic never runs out.
      if (car.x < -80) car.x = city.size + 70;
      if (car.x > city.size + 80) car.x = -70;
      if (car.y < -80) car.y = city.size + 70;
      if (car.y > city.size + 80) car.y = -70;
    }
  }

  function stepPeds(dt, player, gunshot) {
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.down -= dt;
        if (ped.down <= 0) {
          ped.state = 'flee';
          ped.stateT = 3;
        }
        continue;
      }
      if (ped.stateT > 0) ped.stateT -= dt;
      // Flee gunfire, fast cars and the player when they are close and loud.
      let threat = null;
      if (gunshot && distance(ped.x, ped.y, gunshot.x, gunshot.y) < 420) threat = gunshot;
      else if (player && player.inCar && player.carSpeed > 120 && distance(ped.x, ped.y, player.carX, player.carY) < 150) {
        threat = { x: player.carX, y: player.carY };
      }
      if (threat && ped.state !== 'flee') {
        ped.state = 'flee';
        ped.stateT = 2.5;
      }
      if (ped.state === 'flee') {
        const away = threat ? Math.atan2(ped.y - threat.y, ped.x - threat.x) : ped.angle;
        ped.angle = away;
        const speed = ped.speed * 3.1;
        ped.x += Math.cos(away) * speed * dt;
        ped.y += Math.sin(away) * speed * dt;
        if (ped.stateT <= 0) ped.state = 'walk';
      } else {
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
        if (ped.stateT <= 0) {
          // At an intersection, sometimes turn onto the cross street.
          const ix = Math.round(ped.x / city.pitch);
          const iy = Math.round(ped.y / city.pitch);
          const near = Math.abs(ped.x - ix * city.pitch) < 60 && Math.abs(ped.y - iy * city.pitch) < 60;
          if (near && random() < 0.45) {
            const horizontal = Math.abs(Math.cos(ped.angle)) > 0.5;
            ped.angle = horizontal ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI);
          }
          ped.stateT = range(random, 3, 9);
        }
      }
      // Keep pedestrians on the sidewalks and out of the sea and buildings.
      ped.x = clamp(ped.x, 30, city.size - 30);
      ped.y = clamp(ped.y, 30, city.waterY - 40);
      if (hitsBuilding(city, ped.x, ped.y, 12)) {
        ped.angle += Math.PI / 2;
        ped.x += Math.cos(ped.angle) * 20;
        ped.y += Math.sin(ped.angle) * 20;
      }
    }
  }

  return {
    traffic,
    peds,
    pickups,
    events,
    /** Advance traffic and pedestrians one step. `player` may be null in shots. */
    update(dt, player, gunshot) {
      stepTraffic(dt, player);
      stepPeds(dt, player, gunshot);
    },
    /** A pedestrian at (x, y) within r, still standing, or null. */
    pedAt(x, y, r) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (distance(ped.x, ped.y, x, y) < r) return ped;
      }
      return null;
    },
    /** Knock a pedestrian down (hit by a car or a punch). */
    knockDown(ped) {
      ped.state = 'down';
      ped.down = 6;
      events.push({ type: 'ped-down', x: ped.x, y: ped.y });
    },
    /** Remove a car from traffic (stolen by the player) and hand it back. */
    takeCar(car) {
      const index = traffic.indexOf(car);
      if (index >= 0) traffic.splice(index, 1);
      return car;
    },
    /** Put a car back into traffic (player abandons it): it becomes parked. */
    returnCar(car) {
      car.parked = true;
      car.speed = 0;
      car.driver = false;
      traffic.push(car);
    },
    /** The nearest parked or driverless car to a point, within r. */
    stealableAt(x, y, r) {
      let best = null;
      let bestD = r;
      for (const car of traffic) {
        const d = distance(car.x, car.y, x, y);
        if (d < bestD) {
          best = car;
          bestD = d;
        }
      }
      return best;
    },
    /** The nearest traffic car (any) to a point, within r — for collisions. */
    carAt(x, y, r) {
      for (const car of traffic) {
        if (distance(car.x, car.y, x, y) < r + car.length / 2) return car;
      }
      return null;
    },
    /** True when a point is on a road, for the off-road drag. */
    onRoad,
    /** Respawn a pickup of the same kind somewhere else in the city. */
    respawnPickup(pickup) {
      const p = randomRoadPoint(random, city);
      pickup.x = p.x;
      pickup.y = p.y;
      pickup.bob = random() * 6;
    },
  };
}
