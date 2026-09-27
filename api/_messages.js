// Push texts for G-Tracker. A different line each day (picked by date), so the
// reminders don't read like a robot, but a retry on the same day says the same thing.

const MORNING = [
  ['Heute arbeiten 🎸', 'Ab {time} in der bluegarage.'],
  ['Heute is bluegarage-Tag', 'Schichtbeginn {time} – plan dir den Abend ein.'],
  ['Heut Abend Schicht', 'Um {time} geht’s los. Trinkgeld-Modus an 💶'],
  ['Nicht vergessen 👀', 'Heute Schicht in der bluegarage, Beginn {time}.'],
  ['Bühne frei 🎶', 'Heute arbeitest du ab {time}. Wird a guate Nacht.'],
  ['Kurze Erinnerung', 'Heute ab {time} in Frauental. Viel Spaß!'],
];
const MORNING_NO_TIME = [
  ['Heute arbeiten 🎸', 'Heute hast du eine Schicht in der bluegarage.'],
  ['Heute is bluegarage-Tag', 'Schicht steht an – vergiss nicht, sie in G-Tracker zu starten.'],
];
const EVENING_RUNNING = [
  ['Wie war’s heute?', 'Wenn du fertig bist: „Schicht beenden“ tippen und Verdienst eintragen.'],
  ['Feierabend in Sicht?', 'Tipp auf „Schicht beenden“ – die Stunden rechnet G-Tracker selber aus.'],
  ['Na, wie viel Trinkgeld? 💶', 'Schicht beenden und eintragen, solang du’s noch weißt.'],
  ['Kurzer Check 👋', 'Seit {time} dabei. Wenn’s vorbei is: beenden und Geld eintragen.'],
  ['Geschafft?', 'Dann schnell die Schicht beenden – dauert 10 Sekunden.'],
];
const EVENING_ENDED = [
  ['Noch schnell eintragen', 'Schicht beendet ({hours} h) – was is rausgekommen?'],
  ['Fast fertig ✅', 'Trag noch Verdienst und Trinkgeld ein, dann is die Schicht im Kasten.'],
  ['Wie viel war’s?', '{hours} Stunden gearbeitet – jetzt noch den Verdienst eintragen.'],
];

function seedOf(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
const pick = (list, seed) => list[seed % list.length];
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const hoursText = (h) => String(Math.round(h * 4) / 4).replace('.', ',');

/** Minutes between two HH:MM times, across midnight if needed. */
export function minutesBetween(from, to) {
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (m(to) - m(from) + 1440) % 1440;
}

export function morningMessage(plan, day) {
  const [title, body] = pick(plan.time ? MORNING : MORNING_NO_TIME, seedOf(day + 'm'));
  const text = fill(body, { time: plan.time ? `${plan.time} Uhr` : '' });
  return { title, body: plan.note ? `${text} (${plan.note})` : text, tag: 'g-tracker-' + day, url: '/' };
}

/** endHM: HH:MM (Vienna) when the shift was ended, or '' if it is still running. */
export function eveningMessage(plan, day, endHM) {
  const seed = seedOf(day + 'e');
  if (endHM && plan.time) {
    const [title, body] = pick(EVENING_ENDED, seed);
    return { title, body: fill(body, { hours: hoursText(minutesBetween(plan.time, endHM) / 60) }), tag: 'g-tracker-evening-' + day, url: '/' };
  }
  const list = plan.time ? EVENING_RUNNING : EVENING_RUNNING.filter((m) => !m[1].includes('{time}'));
  const [title, body] = pick(list, seed);
  return { title, body: fill(body, { time: plan.time ? `${plan.time} Uhr` : '' }), tag: 'g-tracker-evening-' + day, url: '/' };
}

export const ALL_TEXTS = { MORNING, MORNING_NO_TIME, EVENING_RUNNING, EVENING_ENDED };
