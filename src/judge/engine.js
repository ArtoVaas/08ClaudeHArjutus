// Rule-based judging engine. Pure functions only: no database, no I/O.

const MAX_PENALTY = 3;
const MAX_VAGUE_PENALTY = 2;

// Section header keywords (English + Estonian). Matched at the start of a line,
// followed by ":", "-", "–" or end of line.
const SECTION_KEYWORDS = {
  title: ['title', 'summary', 'pealkiri'],
  testData: [
    'test data', 'preconditions', 'precondition', 'pre-conditions',
    'testandmed', 'eeltingimused', 'eeltingimus',
  ],
  steps: [
    'steps to reproduce', 'steps', 'repro steps', 'reproduction steps',
    'taasesitamise sammud', 'sammud',
  ],
  expected: ['expected result', 'expected results', 'expected', 'oodatud tulemus', 'oodatav tulemus', 'oodatud'],
  actual: ['actual result', 'actual results', 'actual', 'tegelik tulemus', 'tegelik'],
  environment: ['environment', 'env', 'keskkond'],
  severity: ['severity', 'priority', 'tõsidus', 'prioriteet'],
  evidence: [
    'evidence', 'attachments', 'attachment', 'screenshots', 'screenshot',
    'logs', 'log', 'video', 'kuvatõmmised', 'kuvatõmmis', 'logid', 'logi', 'manused', 'manus',
  ],
};

const CRITERIA = [
  { key: 'title', label: 'Title', max: 1 },
  { key: 'steps', label: 'Steps to reproduce', max: 2 },
  { key: 'expected', label: 'Expected result', max: 1.5 },
  { key: 'actual', label: 'Actual result', max: 1.5 },
  { key: 'environment', label: 'Environment', max: 1 },
  { key: 'severity', label: 'Severity / priority', max: 1 },
  { key: 'evidence', label: 'Evidence', max: 1 },
  { key: 'testData', label: 'Test data / preconditions', max: 1 },
];

const CHARGE_TEXT = {
  title: 'No clear title (first line, 5-100 characters, not just vague words).',
  steps: 'Fewer than 2 numbered or bulleted steps to reproduce.',
  expected: 'Expected result is missing.',
  actual: 'Actual result is missing.',
  environment: 'Environment is missing (env name, browser, OS, version or build).',
  severity: 'Severity or priority is missing.',
  evidence: 'No evidence (screenshot, log, video or attached file).',
  testData: 'Test data or preconditions are missing.',
};

const VAGUE_PHRASES = [
  "doesn't work", 'does not work', 'doesnt work', 'not working', 'broken',
  'asap', 'urgent', 'etc', 'ei tööta', 'katki',
];

const MULTI_DEFECT_PHRASES = ['also', 'another issue', 'lisaks veel'];

// Words that on their own do not make a meaningful title.
const VAGUE_TITLE_WORDS = new Set([
  'bug', 'bugs', 'issue', 'issues', 'problem', 'problems', 'error', 'errors',
  'broken', 'help', 'fix', 'please', 'pls', 'asap', 'urgent', 'etc', 'it',
  'does', 'doesn', 'doesnt', 'not', 'work', 'works', 'working', 'something',
  'stuff', 'thing', 'things', 'wrong', 'is', 'the', 'a', 'an', 'this', 'that',
  'again', 'still', 'everything', 'nothing', 'viga', 'vead', 'probleem', 'katki',
  'ei', 'tööta', 'tööt', 'midagi', 'see', 'on', 'palun', 'kiire', 'abi',
]);

const ENVIRONMENT_HINT = /(?<![\p{L}\d])(chrome|firefox|safari|edge|opera|windows|win1[01]|macos|mac os|ios|android|linux|ubuntu|staging|production|prod|dev|test env|uat|version\s*\d|v\d+(\.\d+)+|build\s*#?\d+|versioon\s*\d)(?![\p{L}])/iu;
const EVIDENCE_HINT = /(?<![\p{L}])(screenshots?|logs?|video|recording|kuvatõmmis\p{L}*|logi(?:d|de|s|st|sse|fail\p{L}*)?|salvestus\p{L}*|\S+\.(png|jpe?g|gif|log|mp4|mov|webm|har|txt))(?![\p{L}])/iu;

const LEVELS = [
  { key: 'GUILTY', label: 'GUILTY', detail: 'report rejected', color: 'red' },
  { key: 'PROBATION', label: 'GUILTY WITH PROBATION', detail: 'rework needed', color: 'amber' },
  { key: 'ACQUITTED', label: 'ACQUITTED', detail: 'good report', color: 'green' },
  { key: 'HALL_OF_FAME', label: 'HALL OF FAME', detail: 'exemplary report', color: 'gold' },
];

const COURTS = {
  junior: { label: 'Junior Court', offset: -1 },
  district: { label: 'District Court', offset: 0 },
  supreme: { label: 'Supreme Court', offset: 1 },
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-phrase matcher that treats Unicode letters (e.g. õ, ö) as word characters.
function phraseRegex(phrase, flags = 'giu') {
  return new RegExp(`(?<![\\p{L}\\d])${escapeRegex(phrase)}(?![\\p{L}\\d])`, flags);
}

const HEADER_PATTERNS = Object.entries(SECTION_KEYWORDS).flatMap(([section, words]) =>
  words.map((word) => ({
    section,
    // Optional markdown decorations (#, *, -, **), keyword, optional "(s)" etc., then separator or EOL.
    re: new RegExp(
      `^[\\s#>*_\\-]*${escapeRegex(word)}(?![\\p{L}\\d])[\\s*_]*(?:\\([^)]*\\))?[\\s*_]*(?:[:\\-–—]\\s*(.*))?$`,
      'iu'
    ),
    length: word.length,
  }))
).sort((a, b) => b.length - a.length); // longest keyword first

function normalize(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’ʼ]/g, "'");
}

function matchHeader(line) {
  for (const p of HEADER_PATTERNS) {
    const m = line.match(p.re);
    if (m) {
      const rest = (m[1] || '').trim();
      // "Expected the page to load" without separator is prose, not a header.
      const hasSeparator = /[:\-–—]/.test(line.slice(0, line.length - rest.length)) || rest === '';
      if (hasSeparator) return { section: p.section, rest };
    }
  }
  return null;
}

/** Split a report into named sections. Lines before the first header are "preamble". */
function parseSections(text) {
  const lines = normalize(text).split('\n');
  const sections = {};
  const preamble = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    const header = line ? matchHeader(line) : null;
    if (header) {
      current = header.section;
      if (!sections[current]) sections[current] = [];
      if (header.rest) sections[current].push(header.rest);
    } else if (current) {
      if (line) sections[current].push(line);
    } else if (line) {
      preamble.push(line);
    }
  }
  return { sections, preamble };
}

const LIST_ITEM = /^\s*(?:\d+\s*[.)]|[-*•]|step\s*\d+\s*[:.)]|samm\s*\d+\s*[:.)])\s*(.+)$/iu;

function splitInlineList(line) {
  // "1. open page 2. click login" -> two items
  return line.split(/\s+(?=\d+[.)]\s)/).map((s) => s.trim()).filter(Boolean);
}

function extractSteps(lines) {
  const items = [];
  for (const line of lines) {
    for (const part of splitInlineList(line)) {
      const m = part.match(LIST_ITEM);
      if (m) items.push(m[1].trim());
    }
  }
  return items;
}

function isMeaningfulTitle(title) {
  if (!title) return false;
  const len = title.trim().length;
  if (len < 5 || len > 100) return false;
  const words = title.toLowerCase().replace(/'/g, '').match(/[\p{L}\d]+/gu) || [];
  return words.some((w) => w.length >= 2 && !VAGUE_TITLE_WORDS.has(w));
}

function countMatches(text, phrase) {
  return (text.match(phraseRegex(phrase)) || []).length;
}

function computePenalties(text, strictness) {
  const items = [];

  let vagueCount = 0;
  const vagueFound = [];
  const lower = text.toLowerCase();
  for (const phrase of VAGUE_PHRASES) {
    const n = countMatches(lower, phrase);
    if (n) {
      vagueCount += n;
      vagueFound.push(phrase);
    }
  }
  if (vagueCount) {
    items.push({
      key: 'vague',
      label: `Vague phrases: ${vagueFound.map((p) => `"${p}"`).join(', ')}`,
      points: Math.min(vagueCount * 0.5, MAX_VAGUE_PENALTY),
    });
  }

  const letters = text.match(/\p{L}/gu) || [];
  const upper = text.match(/\p{Lu}/gu) || [];
  if (letters.length >= 10 && upper.length / letters.length > 0.3) {
    items.push({ key: 'shouting', label: 'Shouting: more than 30% uppercase letters', points: 1 });
  }

  if (/!{3,}/.test(text)) {
    items.push({ key: 'exclamation', label: 'Excessive exclamation marks ("!!!")', points: 0.5 });
  }

  const multi = MULTI_DEFECT_PHRASES.filter((p) => countMatches(lower, p) > 0);
  if (multi.length) {
    items.push({
      key: 'multiple',
      label: `Several defects in one report (${multi.map((p) => `"${p}"`).join(', ')})`,
      points: 1,
    });
  }

  const multiplier = 0.5 + clamp01(strictness);
  const raw = items.reduce((sum, i) => sum + i.points, 0);
  const total = Math.min(round1(raw * multiplier), MAX_PENALTY);
  for (const i of items) i.points = round1(i.points * multiplier);
  return { items, multiplier: round1(multiplier), total };
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.min(1, Math.max(0, x));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function joinOrNull(lines) {
  const s = (lines || []).join('\n').trim();
  return s || null;
}

/**
 * Judge a defect report.
 * @param {string} text report text
 * @param {{court?: string, strictness?: number, attachmentName?: string|null}} opts
 */
function judgeReport(text, opts = {}) {
  const court = COURTS[opts.court] ? opts.court : 'district';
  const body = normalize(text).trim();
  const { sections, preamble } = parseSections(body);

  // Title: explicit Title section, otherwise the first line of the report.
  const firstLine = body.split('\n')[0].trim();
  const title = joinOrNull(sections.title) || (preamble.length && preamble[0] === firstLine ? firstLine : null);

  // Steps: list items in the Steps section; without a section, list items in the preamble.
  let steps = sections.steps ? extractSteps(sections.steps) : extractSteps(preamble);
  if (!steps.length && sections.steps && joinOrNull(sections.steps)) steps = [joinOrNull(sections.steps)];

  const expected = joinOrNull(sections.expected);
  const actual = joinOrNull(sections.actual);

  let environment = joinOrNull(sections.environment);
  if (!environment) {
    const m = body.match(ENVIRONMENT_HINT);
    if (m) environment = `(mentioned: ${m[0]})`;
  }

  const severity = joinOrNull(sections.severity);

  let evidence = joinOrNull(sections.evidence);
  if (!evidence && opts.attachmentName) evidence = `Attached file: ${opts.attachmentName}`;
  if (!evidence) {
    const m = body.match(EVIDENCE_HINT);
    if (m) evidence = `(mentioned: ${m[0]})`;
  }

  const testData = joinOrNull(sections.testData);

  const found = {
    title: isMeaningfulTitle(title) ? 1 : 0,
    steps: Math.min(steps.length, 2),
    expected: expected ? 1.5 : 0,
    actual: actual ? 1.5 : 0,
    environment: environment ? 1 : 0,
    severity: severity ? 1 : 0,
    evidence: evidence ? 1 : 0,
    testData: testData ? 1 : 0,
  };

  const criteria = CRITERIA.map((c) => ({ ...c, points: found[c.key], met: found[c.key] >= c.max }));
  const baseScore = criteria.reduce((s, c) => s + c.points, 0);
  const penalties = computePenalties(body, opts.strictness);
  const score = Math.max(0, round1(baseScore - penalties.total));
  const allCriteriaMet = criteria.every((c) => c.met);

  const verdict = decideVerdict(score, court, allCriteriaMet);

  const charges = [
    ...criteria.filter((c) => !c.met).map((c) => (c.points > 0 ? `${CHARGE_TEXT[c.key]} (partial: ${c.points}/${c.max})` : CHARGE_TEXT[c.key])),
    ...penalties.items.map((p) => `${p.label} (-${p.points})`),
  ];
  if (court === 'supreme' && !allCriteriaMet && score >= 8) {
    charges.push('Supreme Court requires all 8 criteria for acquittal.');
  }

  const template = buildTemplate({ title: isMeaningfulTitle(title) ? title : null, testData, steps, expected, actual, environment, severity, evidence });

  return {
    score,
    maxScore: 10,
    baseScore: round1(baseScore),
    penalty: penalties.total,
    penaltyMultiplier: penalties.multiplier,
    court,
    courtLabel: COURTS[court].label,
    verdict,
    criteria,
    penalties: penalties.items,
    charges,
    allCriteriaMet,
    template,
  };
}

function decideVerdict(score, court, allCriteriaMet) {
  const o = COURTS[court] ? COURTS[court].offset : 0;
  let idx;
  if (score < 4 + o) idx = 0;
  else if (score < 7 + o) idx = 1;
  else if (score < 9 + o) idx = 2;
  else idx = 3;
  if (court === 'supreme' && !allCriteriaMet && idx > 1) idx = 1;
  return { ...LEVELS[idx] };
}

function buildTemplate(f) {
  const M = '<missing>';
  const stepLines = f.steps.length ? f.steps.map((s, i) => `${i + 1}. ${s}`) : [`1. ${M}`, `2. ${M}`];
  if (f.steps.length === 1) stepLines.push(`2. ${M}`);
  return [
    `Title: ${f.title || M}`,
    `Preconditions / Test data: ${f.testData || M}`,
    'Steps to reproduce:',
    ...stepLines,
    `Expected result: ${f.expected || M}`,
    `Actual result: ${f.actual || M}`,
    `Environment: ${f.environment || M}`,
    `Severity: ${f.severity || M}`,
    `Evidence: ${f.evidence || M}`,
  ].join('\n');
}

/** Map sarcasm slider (0.0-1.0) to a tone bucket. */
function sarcasmTone(sarcasm) {
  const s = Math.round(clamp01(sarcasm) * 10);
  if (s <= 3) return 'polite';
  if (s <= 7) return 'dry';
  return 'savage';
}

/** Pick a random sentence line; lines are {verdict, tone, line}. */
function pickSentence(lines, verdictKey, tone, random = Math.random) {
  let pool = lines.filter((l) => l.verdict === verdictKey && l.tone === tone);
  if (!pool.length) pool = lines.filter((l) => l.verdict === verdictKey);
  if (!pool.length) return 'The court has spoken.';
  return pool[Math.floor(random() * pool.length)].line;
}

module.exports = {
  judgeReport,
  parseSections,
  sarcasmTone,
  pickSentence,
  decideVerdict,
  isMeaningfulTitle,
  COURTS,
  LEVELS,
};
