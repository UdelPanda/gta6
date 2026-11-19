// The story of Solstice City: Rico Vega, a wheelman who owes the Countess,
// takes jobs from Dottie Ray to buy his way out. Five missions, each a list
// of objectives with a map marker, a waypoint and a payout. Missions are
// data, not code: the loop only reads the current objective.

import { WANTED } from './config.js';

const MISSION_LIST = [
  {
    id: 'first-fare',
    title: '1 · First Fare',
    intro: 'Dottie Ray: "Rico, you owe the Countess three grand. Drive a fare to the Sunset Motel and we start digging you out. Get a car — any car."',
    reward: 150,
    steps: [
      { kind: 'car', text: 'Get in a car (walk up to one and press E)' },
      { kind: 'drive-to', at: 'motel', radius: 90, text: 'Drive to the Sunset Motel' },
    ],
  },
  {
    id: 'borrowed-wheels',
    title: '2 · Borrowed Wheels',
    intro: 'Dottie Ray: "Big Al pays for clean wheels. Steal a car and bring it to his chop shop — and try not to let the whole city watch you do it."',
    reward: 300,
    steps: [
      { kind: 'steal', text: 'Steal a car (press E beside one)' },
      { kind: 'drive-to', at: 'chopshop', radius: 90, text: "Deliver it to Big Al's Chop Shop" },
    ],
  },
  {
    id: 'hot-cargo',
    title: '3 · Hot Cargo',
    intro: 'Dottie Ray: "A package is waiting at the Marina Docks. Pick it up, bring it to the hideout — and the precinct is already watching the docks, so expect heat."',
    reward: 500,
    steps: [
      { kind: 'goto', at: 'docks', radius: 80, text: 'Pick up the package at the Marina Docks' },
      { kind: 'drive-to', at: 'hideout', radius: 90, text: 'Deliver the package to the Hideout' },
    ],
    heatOnStart: WANTED.thresholds[2],
  },
  {
    id: 'the-countess',
    title: '4 · The Countess',
    intro: 'Dottie Ray: "Time to pay the Countess a visit. Her casino keeps the night\'s take in the back room. Walk in, grab the cash, and run — her guards will not wave you through."',
    reward: 1200,
    steps: [
      { kind: 'goto', at: 'casino', radius: 90, text: 'Get to The Countess Casino' },
      { kind: 'grab', at: 'casino', radius: 70, text: 'Grab the cash (stand in the marker)' },
      { kind: 'drive-to', at: 'hideout', radius: 90, text: 'Escape to the Hideout' },
    ],
    heatOnGrab: WANTED.thresholds[4],
  },
  {
    id: 'clean-getaway',
    title: '5 · Clean Getaway',
    intro: 'Dottie Ray: "That was the Countess\'s money, Rico. Every cop in Solstice is coming. Lose them, get to the Palm Airstrip, and fly out a free man."',
    reward: 2500,
    steps: [
      { kind: 'lose-wanted', text: 'Lose the police (stay out of sight until the stars clear)' },
      { kind: 'goto', at: 'airstrip', radius: 90, text: 'Reach the Palm Airstrip' },
    ],
    heatOnStart: WANTED.thresholds[5],
  },
];

export function createMissions(city, police) {
  let missionIndex = 0;
  let stepIndex = 0;
  let grabTimer = 0;
  let done = false;
  let introShown = false;
  const events = [];

  function current() {
    return MISSION_LIST[missionIndex] || null;
  }

  function step() {
    const mission = current();
    return mission ? mission.steps[stepIndex] : null;
  }

  /** Where the current objective points, in world coordinates, or null. */
  function objectiveTarget() {
    const s = step();
    if (!s || !s.at) return null;
    const landmark = city.landmarks[s.at];
    return landmark ? { x: landmark.x, y: landmark.y, name: landmark.name } : null;
  }

  function startMission(index) {
    missionIndex = index;
    stepIndex = 0;
    grabTimer = 0;
    introShown = false;
    done = missionIndex >= MISSION_LIST.length;
    const mission = current();
    if (mission && mission.heatOnStart) police.setHeat(mission.heatOnStart);
  }

  function advance() {
    const mission = current();
    if (!mission) return;
    stepIndex += 1;
    if (stepIndex >= mission.steps.length) {
      events.push({ type: 'mission-done', mission, reward: mission.reward });
      startMission(missionIndex + 1);
    }
  }

  return {
    events,
    get missionIndex() {
      return missionIndex;
    },
    get done() {
      return done;
    },
    get total() {
      return MISSION_LIST.length;
    },
    current,
    step,
    objectiveTarget,
    /** The intro text of the current mission, once per mission. */
    intro() {
      const mission = current();
      if (!mission || introShown) return null;
      introShown = true;
      return { title: mission.title, text: mission.intro };
    },
    /** Restore progress from a save: mission index only, steps restart. */
    load(index) {
      startMission(Math.min(index, MISSION_LIST.length - 1));
    },
    startMission,
    /**
     * Check the current objective against the game state. `state` carries the
     * player position, whether they are in a car, and the wanted level.
     */
    update(dt, state) {
      const s = step();
      if (!s) return;
      const target = objectiveTarget();
      if (s.kind === 'car' && state.inCar) {
        advance();
      } else if (s.kind === 'steal' && state.inCar && state.stoleThisMission) {
        advance();
      } else if ((s.kind === 'goto' || s.kind === 'drive-to') && target) {
        const dx = state.x - target.x;
        const dy = state.y - target.y;
        const radius = s.radius || 90;
        if (dx * dx + dy * dy < radius * radius) {
          if (s.kind === 'drive-to' && !state.inCar) {
            // Deliveries need the car: wait until they drive in.
          } else {
            advance();
          }
        }
      } else if (s.kind === 'grab' && target) {
        const dx = state.x - target.x;
        const dy = state.y - target.y;
        if (dx * dx + dy * dy < (s.radius || 70) * (s.radius || 70)) {
          grabTimer += dt;
          if (grabTimer > 2.5) {
            const mission = current();
            if (mission && mission.heatOnGrab) police.setHeat(mission.heatOnGrab);
            grabTimer = 0;
            advance();
          }
        } else {
          grabTimer = 0;
        }
      } else if (s.kind === 'lose-wanted' && state.wanted === 0) {
        advance();
      }
    },
    /** Progress text for the HUD: "Mission 2/5 — Borrowed Wheels". */
    progressText() {
      const mission = current();
      if (!mission) return 'All missions complete — King of Solstice City';
      return `Mission ${missionIndex + 1}/${MISSION_LIST.length} — ${mission.title.slice(4)}`;
    },
  };
}
