// The law in Solstice City: a heat score, five wanted stars, and police units
// that chase the player in cars, get out on foot to make an arrest, and lose
// the trail when the player stays out of sight. Nothing here draws.
// Losing them is a real mechanic, not a dice roll: a unit that cannot see
// the player drives to the last spot anyone saw them, waits there once it
// arrives, and never learns the player's live position until some unit sees
// them again — so breaking sight and driving away opens a real gap.

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
  // Last spot any unit saw the player: the trail's cold end. Units that
  // cannot see the player navigate here, never to the live position.
  let lastSeenX = 0;
  let lastSeenY = 0;
  let haveLastSeen = false;
  // Highest wanted level fresh units have answered. A unit that gave up,
  // was culled as the stars dropped, or was shot is never replaced: a
  // fresh ring of units next to the player is exactly what "losing them"
  // must not summon.
  let spawnedLevel = 0;
  const units = [];
  const events = [];

  function targetUnits() {
    if (wanted === 0) return 0;
    return Math.min(1 + wanted, POLICE.maxCars);
  }

  function spawnUnit(player) {
    // Appear on a road a little way off, so they drive in rather than pop in.
    // Never right at the world's edge: a unit that spawns on the kerb of the
    // map looks like it drove in from nowhere. And never on top of the
    // player: a fresh unit answers the call from 650 px out or more.
    for (let tries = 0; tries < 12; tries += 1) {
      const p = randomRoadPoint(random, city);
      if (p.x < 120 || p.x > city.size - 120 || p.y < 120 || p.y > city.waterY - 120) continue;
      const d = distance(p.x, p.y, player.x, player.y);
      if (d > 650 && d < 1100) {
        if (!haveLastSeen) {
          // Dispatch sends them where the crime was reported.
          lastSeenX = player.x;
          lastSeenY = player.y;
          haveLastSeen = true;
        }
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
      haveLastSeen = false;
      spawnedLevel = 0;
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
    /** HUD cue while the heat is fading: null when seen or clean. */
    losingCue() {
      if (wanted === 0 || unseenTimer <= 0) return null;
      if (unseenTimer <= POLICE.loseSightSeconds) {
        return { text: 'Losing them… stay out of sight', progress: unseenTimer / POLICE.loseSightSeconds };
      }
      return { text: 'Heat dropping… keep it up', progress: clamp(decayTimer / POLICE.decaySeconds, 0, 1) };
    },
    update(dt, player, effects) {
      const px = player.x;
      const py = player.y;
      // Fresh units only answer a rising wanted level, up to the count that
      // level calls for. A unit that lost the trail, was culled, or was
      // shot stays gone — the chase thins as the player escapes it, and a
      // new crime (a rising level) is what brings fresh units in.
      if (wanted === 0) {
        spawnedLevel = 0;
      } else if (wanted > spawnedLevel) {
        spawnedLevel = wanted;
        while (units.length < targetUnits()) spawnUnit(player);
      }
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
        lastSeenX = px;
        lastSeenY = py;
        haveLastSeen = true;
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

      // While the trail is cold, a unit left far behind gives up and leaves,
      // and as the stars drop the chase thins to the units the heat still
      // calls for (the farthest goes first).
      if (wanted > 0 && !seen) {
        for (let i = units.length - 1; i >= 0; i -= 1) {
          if (distance(units[i].x, units[i].y, px, py) > 2000) units.splice(i, 1);
        }
        while (units.length > targetUnits()) {
          let far = 0;
          for (let i = 1; i < units.length; i += 1) {
            if (distance(units[i].x, units[i].y, px, py) > distance(units[far].x, units[far].y, px, py)) far = i;
          }
          units.splice(far, 1);
        }
      }
      // Where the units navigate: the live player while anyone can see them,
      // the last seen spot once the trail is cold. A unit never navigates
      // to a position nobody has seen.
      const navX = seen || !haveLastSeen ? px : lastSeenX;
      const navY = seen || !haveLastSeen ? py : lastSeenY;

      for (let i = units.length - 1; i >= 0; i -= 1) {
        const u = units[i];
        u.light += dt;
        if (u.mode === 'car') {
          const d = distance(u.x, u.y, px, py);
          const dNav = distance(u.x, u.y, navX, navY);
          // Pursuit routes along the grid: close in, drive straight at the
          // target; further out, take the streets, or a diagonal line will
          // grind the car along the buildings at the road's edge. Off the
          // road, head for the nearest intersection first. The target is
          // the player while anyone sees them, the last seen spot once the
          // trail is cold.
          let targetAngle;
          if (dNav < 150) {
            targetAngle = Math.atan2(navY - u.y, navX - u.x);
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
            } else if (onH && Math.abs(navY - streetY) > 120) {
              const avenue = Math.round(navX / city.pitch) * city.pitch;
              tx = Math.abs(u.x - avenue) > 80 ? avenue : navX;
              ty = Math.abs(u.x - avenue) > 80 ? streetY : navY;
            } else if (onV && Math.abs(navX - streetX) > 120) {
              const street = Math.round(navY / city.pitch) * city.pitch;
              tx = Math.abs(u.y - street) > 80 ? streetX : navX;
              ty = Math.abs(u.y - street) > 80 ? street : navY;
            } else {
              tx = navX;
              ty = navY;
            }
            targetAngle = Math.atan2(ty - u.y, tx - u.x);
          }
          const turn = angleDelta(u.angle, targetAngle);
          const maxTurn = 2.4 * dt;
          u.angle += clamp(turn, -maxTurn, maxTurn);
          let targetSpeed = wanted === 0 ? POLICE.speed * 0.5 : POLICE.speed;
          const roadSpeed = onRoad(city, u.x, u.y) ? targetSpeed : targetSpeed * 0.55;
          targetSpeed = roadSpeed;
          // A unit that reaches the last seen spot while the trail is cold
          // waits there: there is nowhere else to drive to.
          if (!seen && haveLastSeen && distance(u.x, u.y, lastSeenX, lastSeenY) < 120) targetSpeed = 0;
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
          // On foot: run the target down and make the arrest. The target is
          // the player while anyone sees them, the last seen spot once the
          // trail is cold — and a cop that reaches that spot waits there.
          const targetAngle = Math.atan2(navY - u.y, navX - u.x);
          u.angle = targetAngle;
          const run = 235;
          const arrived = !seen && haveLastSeen && distance(u.x, u.y, lastSeenX, lastSeenY) < 40;
          if (!arrived) {
            u.x += Math.cos(targetAngle) * run * dt;
            u.y += Math.sin(targetAngle) * run * dt;
          }
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
          // Foot cops shoot when the wanted level is high, the player is far
          // — and they can actually see them.
          if (wanted >= 3 && seen && d > 90 && d < 460) {
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
      // Units never stack: a cheap pairwise push keeps police cars (and foot
      // cops) from driving exactly on top of each other in a chase. Each
      // pair is pushed apart to 52 px, half the overlap each way; a pair
      // already on the same spot splits along a fixed angle from its seed.
      for (let i = 0; i < units.length; i += 1) {
        for (let j = i + 1; j < units.length; j += 1) {
          const a = units[i];
          const b = units[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.sqrt(dx * dx + dy * dy);
          if (d >= 52) continue;
          if (d < 0.01) {
            dx = Math.cos(a.seed * 6.283);
            dy = Math.sin(a.seed * 6.283);
            d = 1;
          }
          const push = (52 - d) / 2 / d;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    },
  };
}
