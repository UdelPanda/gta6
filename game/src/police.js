// The law in Solstice City: a heat score, five wanted stars, and police units
// that chase the player in cars, get out on foot to make an arrest, and lose
// the trail when the player stays out of sight. Nothing here draws.

import { POLICE, WANTED } from './config.js';
import { angleDelta, clamp, distance } from './random.js';
import { collideBuildings, onRoad, randomRoadPoint } from './city.js';

function wantedFromHeat(heat) {
  let level = 0;
  for (let i = 0; i < WANTED.thresholds.length; i += 1) {
    if (heat >= WANTED.thresholds[i]) level = i;
  }
  return level;
}

export function createPolice(random, city) {
  let heat = 0;
  let wanted = 0;
  let unseenTimer = 0;
  let decayTimer = 0;
  const units = [];
  const events = [];

  function targetUnits() {
    if (wanted === 0) return 0;
    return Math.min(1 + wanted, POLICE.maxCars);
  }

  function spawnUnit(player) {
    // Appear on a road a little way off, so they drive in rather than pop in.
    for (let tries = 0; tries < 12; tries += 1) {
      const p = randomRoadPoint(random, city);
      const d = distance(p.x, p.y, player.x, player.y);
      if (d > 420 && d < 900) {
        units.push({
          x: p.x, y: p.y,
          angle: Math.atan2(player.y - p.y, player.x - p.x),
          speed: 0, mode: 'car',
          color: '#1e4f9e', light: 0,
          shootCooldown: 1.5,
          bustTimer: 0,
          ramming: false,
          bumping: false,
          seed: random(),
        });
        return;
      }
    }
  }

  function nearestUnitDistance(player) {
    let best = Infinity;
    for (const u of units) {
      const d = distance(u.x, u.y, player.x, player.y);
      if (d < best) best = d;
    }
    return best;
  }

  return {
    units,
    events,
    get heat() {
      return heat;
    },
    get wanted() {
      return wanted;
    },
    /** Add heat for a crime; returns the new wanted level. */
    addHeat(points) {
      heat += points;
      const next = wantedFromHeat(heat);
      if (next > wanted) {
        wanted = next;
        events.push({ type: 'wanted-up', level: wanted });
      } else if (next < wanted) {
        wanted = next;
      }
      return wanted;
    },
    /** Clear all heat (hideout, mission script, fresh start). */
    clearHeat() {
      heat = 0;
      wanted = 0;
      unseenTimer = 0;
      decayTimer = 0;
      units.length = 0;
    },
    setHeat(points) {
      heat = points;
      wanted = wantedFromHeat(heat);
    },
    /** A police car or foot cop at (x, y) within r, or null (for bullets). */
    unitAt(x, y, r) {
      for (const u of units) {
        if (distance(u.x, u.y, x, y) < r) return u;
      }
      return null;
    },
    /** Take a unit out (shot by the player). */
    removeUnit(unit) {
      const index = units.indexOf(unit);
      if (index >= 0) units.splice(index, 1);
      heat += WANTED.killCop;
      wanted = wantedFromHeat(heat);
      events.push({ type: 'cop-down', x: unit.x, y: unit.y });
    },
    /** 0..1 siren loudness from the nearest unit's distance. */
    sirenLevel(player) {
      const d = nearestUnitDistance(player);
      if (!Number.isFinite(d)) return 0;
      return clamp(1 - d / 900, 0, 1);
    },
    update(dt, player, effects) {
      const px = player.x;
      const py = player.y;
      // Spawn up to the target count; drop units when the heat is gone.
      while (units.length < targetUnits()) spawnUnit(player);
      if (wanted === 0) {
        for (let i = units.length - 1; i >= 0; i -= 1) {
          const u = units[i];
          if (distance(u.x, u.y, px, py) > 800) units.splice(i, 1);
        }
      }
      // Heat fades when no unit can see the player for a while.
      const nearest = nearestUnitDistance(player);
      const seen = wanted > 0 && nearest < POLICE.sightRange;
      if (seen) {
        unseenTimer = 0;
        decayTimer = 0;
      } else if (wanted > 0) {
        unseenTimer += dt;
        if (unseenTimer > POLICE.loseSightSeconds) {
          decayTimer += dt;
          if (decayTimer > POLICE.decaySeconds) {
            decayTimer = 0;
            heat = Math.max(0, WANTED.thresholds[wanted - 1]);
            wanted = wantedFromHeat(heat);
            events.push({ type: 'wanted-down', level: wanted });
          }
        }
      }

      for (let i = units.length - 1; i >= 0; i -= 1) {
        const u = units[i];
        u.light += dt;
        if (u.mode === 'car') {
          const d = distance(u.x, u.y, px, py);
          // Pursuit routes along the grid: close in, drive straight at the
          // player; further out, take the streets, or a diagonal line will
          // grind the car along the buildings at the road's edge. Off the
          // road, head for the nearest intersection first.
          let targetAngle;
          if (d < 150) {
            targetAngle = Math.atan2(py - u.y, px - u.x);
          } else {
            const streetY = Math.round(u.y / city.pitch) * city.pitch;
            const streetX = Math.round(u.x / city.pitch) * city.pitch;
            const onH = Math.abs(u.y - streetY) < 48;
            const onV = Math.abs(u.x - streetX) < 48;
            let tx;
            let ty;
            if (!onH && !onV) {
              tx = streetX;
              ty = streetY;
            } else if (onH && Math.abs(py - streetY) > 120) {
              const avenue = Math.round(px / city.pitch) * city.pitch;
              tx = Math.abs(u.x - avenue) > 80 ? avenue : px;
              ty = Math.abs(u.x - avenue) > 80 ? streetY : py;
            } else if (onV && Math.abs(px - streetX) > 120) {
              const street = Math.round(py / city.pitch) * city.pitch;
              tx = Math.abs(u.y - street) > 80 ? streetX : px;
              ty = Math.abs(u.y - street) > 80 ? street : py;
            } else {
              tx = px;
              ty = py;
            }
            targetAngle = Math.atan2(ty - u.y, tx - u.x);
          }
          const turn = angleDelta(u.angle, targetAngle);
          const maxTurn = 2.4 * dt;
          u.angle += clamp(turn, -maxTurn, maxTurn);
          let targetSpeed = wanted === 0 ? POLICE.speed * 0.5 : POLICE.speed;
          const roadSpeed = onRoad(city, u.x, u.y) ? targetSpeed : targetSpeed * 0.55;
          targetSpeed = roadSpeed;
          // Pull up to a player on foot instead of driving through them:
          // slow down close in, so the unit stops and gets out to arrest.
          if (!player.inCar && d < 260) targetSpeed = Math.min(targetSpeed, 140);
          u.speed = clamp(u.speed + (targetSpeed - u.speed) * Math.min(1, dt * 1.2), 0, POLICE.speed);
          u.x += Math.cos(u.angle) * u.speed * dt;
          u.y += Math.sin(u.angle) * u.speed * dt;
          // Police cars respect buildings: two circles (nose and tail) slide
          // along walls, never through them. The circles are sized to the
          // car's width, so the car can use the full road without scraping
          // the buildings that sit just past the road's edge.
          let bumped = false;
          for (const s of [20, -20]) {
            const px0 = u.x + Math.cos(u.angle) * s;
            const py0 = u.y + Math.sin(u.angle) * s;
            const body = { x: px0, y: py0, r: 16 };
            collideBuildings(city, body);
            if (body.x !== px0 || body.y !== py0) {
              bumped = true;
              u.x += body.x - px0;
              u.y += body.y - py0;
            }
          }
          if (bumped) {
            // The speed cut applies once per scrape, not every frame of
            // contact, or the car grinds to a halt against the wall instead
            // of sliding along it and around the corner.
            if (!u.bumping) {
              u.speed *= 0.55;
              u.bumping = true;
            } else {
              u.speed *= 0.99;
            }
          } else {
            u.bumping = false;
          }
          u.x = clamp(u.x, 20, city.size - 20);
          u.y = clamp(u.y, 20, city.waterY - 20);
          const dNow = distance(u.x, u.y, px, py);
          // Ram the player's car, or get out to arrest a player on foot.
          if (!player.inCar && dNow < 110 && u.speed < 200) {
            u.mode = 'foot';
            u.speed = 0;
          } else if (player.inCar && dNow < 46) {
            // Shove the player's car. The speed cut applies once per shove,
            // not every frame of contact — a ram slows you, it does not pin
            // you to the road while three cars lean on you.
            const push = Math.atan2(player.carY - u.y, player.carX - u.x);
            player.pushCar(Math.cos(push) * 190 * dt, Math.sin(push) * 190 * dt);
            if (!u.ramming) {
              u.ramming = true;
              player.rammed();
            }
            if (Math.random() < dt * 2) events.push({ type: 'ram', x: u.x, y: u.y });
          } else {
            u.ramming = false;
          }
          // A slow player car boxed in by a police car gets busted.
          if (player.inCar && dNow < 70 && player.carSpeed < 50) {
            u.bustTimer += dt;
            if (u.bustTimer > POLICE.bustSeconds) {
              events.push({ type: 'busted' });
              return;
            }
          } else {
            u.bustTimer = 0;
          }
        } else {
          // On foot: run the player down and make the arrest.
          const targetAngle = Math.atan2(py - u.y, px - u.x);
          u.angle = targetAngle;
          const run = 235;
          u.x += Math.cos(targetAngle) * run * dt;
          u.y += Math.sin(targetAngle) * run * dt;
          const d = distance(u.x, u.y, px, py);
          if (d < 30) {
            u.bustTimer += dt;
            if (u.bustTimer > POLICE.bustSeconds) {
              events.push({ type: 'busted' });
              return;
            }
          } else {
            u.bustTimer = Math.max(0, u.bustTimer - dt);
          }
          // The player drove off: the cop gives up and the unit leaves.
          if (player.inCar && player.carSpeed > 200 && d > 420) {
            units.splice(i, 1);
            continue;
          }
          // Foot cops shoot when the wanted level is high and the player is far.
          if (wanted >= 3 && d > 90 && d < 460) {
            u.shootCooldown -= dt;
            if (u.shootCooldown <= 0) {
              u.shootCooldown = 1.6 + random() * 0.9;
              const spread = (random() - 0.5) * 0.35;
              const hit = random() < 0.45;
              effects.push({
                type: 'tracer', x: u.x, y: u.y,
                x2: px + Math.cos(targetAngle + spread) * d,
                y2: py + Math.sin(targetAngle + spread) * d,
                t: 0, life: 0.12,
              });
              if (hit) events.push({ type: 'shot-player', damage: 9 });
            }
          }
        }
      }
    },
  };
}
