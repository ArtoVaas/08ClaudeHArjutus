const test = require('node:test');
const assert = require('node:assert/strict');
const { judgeReport, sarcasmTone, pickSentence, decideVerdict, isMeaningfulTitle } = require('../src/judge/engine');

const COMPLETE_EN = `Title: Login button stays disabled after entering valid credentials
Preconditions: User account test.user@example.com exists and is active
Steps to reproduce:
1. Open https://staging.example.com/login
2. Enter email test.user@example.com and password Test1234
3. Click outside the password field
Expected result: The Login button becomes enabled
Actual result: The Login button stays greyed out and cannot be clicked
Environment: Staging, build 2.4.1, Chrome 120 on Windows 11
Severity: High
Evidence: screenshot login-disabled.png and browser console log attached`;

const COMPLETE_ET = `Pealkiri: Login button stays disabled after entering valid credentials
Eeltingimused: User account test.user@example.com exists and is active
Sammud:
1. Open https://staging.example.com/login
2. Enter email test.user@example.com and password Test1234
3. Click outside the password field
Oodatud tulemus: The Login button becomes enabled
Tegelik tulemus: The Login button stays greyed out and cannot be clicked
Keskkond: Staging, build 2.4.1, Chrome 120 on Windows 11
Tõsidus: High
Kuvatõmmis: screenshot login-disabled.png and browser console log attached`;

test('"Login doesn\'t work!!! fix ASAP" scores below 2', () => {
  const r = judgeReport("Login doesn't work!!! fix ASAP");
  assert.ok(r.score < 2, `score was ${r.score}`);
  assert.equal(r.verdict.key, 'GUILTY');
});

test('a complete report scores 9 or more', () => {
  const r = judgeReport(COMPLETE_EN);
  assert.ok(r.score >= 9, `score was ${r.score}, charges: ${r.charges.join('; ')}`);
  assert.equal(r.allCriteriaMet, true);
  assert.equal(r.verdict.key, 'HALL_OF_FAME');
});

test('the same report in Estonian scores the same as in English', () => {
  const en = judgeReport(COMPLETE_EN);
  const et = judgeReport(COMPLETE_ET);
  assert.equal(et.score, en.score);
  assert.deepEqual(
    et.criteria.map((c) => c.points),
    en.criteria.map((c) => c.points)
  );
});

test('fully Estonian incomplete report matches its English twin', () => {
  const en = `Payment page error
Steps:
1. Open the cart
2. Press Pay
Expected: Order is confirmed
Actual: Error 500 is shown
Priority: P1`;
  const et = `Makselehe viga
Sammud:
1. Ava ostukorv
2. Vajuta Maksa
Oodatud: Tellimus kinnitatakse
Tegelik: Kuvatakse viga 500
Prioriteet: P1`;
  assert.equal(judgeReport(et).score, judgeReport(en).score);
});

test('Estonian vague phrases are penalised', () => {
  const r = judgeReport('Sisselogimine ei tööta, kõik on katki', { strictness: 0.5 });
  const vague = r.penalties.find((p) => p.key === 'vague');
  assert.ok(vague);
  assert.equal(vague.points, 1);
});

test('one step gives 1 point, two or more give 2', () => {
  const one = judgeReport('Search returns nothing\nSteps:\n1. Search for "shoes"');
  const two = judgeReport('Search returns nothing\nSteps:\n1. Open home page\n2. Search for "shoes"');
  assert.equal(one.criteria.find((c) => c.key === 'steps').points, 1);
  assert.equal(two.criteria.find((c) => c.key === 'steps').points, 2);
});

test('an attached file counts as evidence', () => {
  const without = judgeReport('Search returns nothing for valid term');
  const withFile = judgeReport('Search returns nothing for valid term', { attachmentName: 'search.png' });
  assert.equal(without.criteria.find((c) => c.key === 'evidence').points, 0);
  assert.equal(withFile.criteria.find((c) => c.key === 'evidence').points, 1);
});

test('"log" is not detected inside "login"', () => {
  const r = judgeReport('Login page has a typo in the footer');
  assert.equal(r.criteria.find((c) => c.key === 'evidence').points, 0);
});

test('vague title is not accepted', () => {
  assert.equal(isMeaningfulTitle('Bug'), false);
  assert.equal(isMeaningfulTitle("It doesn't work"), false);
  assert.equal(isMeaningfulTitle('Checkout total ignores discount code'), true);
  assert.equal(isMeaningfulTitle('x'.repeat(101)), false);
});

test('vague phrase penalty is capped at -2 before strictness', () => {
  const r = judgeReport('Broken broken broken broken broken broken page', { strictness: 0.5 });
  assert.equal(r.penalties.find((p) => p.key === 'vague').points, 2);
});

test('shouting, "!!!" and multiple defects are penalised', () => {
  const r = judgeReport('THE CHECKOUT PAGE CRASHES!!! also another issue with cart', { strictness: 0.5 });
  const keys = r.penalties.map((p) => p.key).sort();
  assert.deepEqual(keys, ['exclamation', 'multiple', 'shouting']);
});

test('strictness multiplies penalties (0.0 = x0.5, 1.0 = x1.5) and total is capped at 3', () => {
  const text = 'Profile page shows wrong avatar!!!';
  assert.equal(judgeReport(text, { strictness: 0 }).penalty, 0.3); // 0.5 * 0.5 = 0.25 -> 0.3
  assert.equal(judgeReport(text, { strictness: 0.5 }).penalty, 0.5);
  assert.equal(judgeReport(text, { strictness: 1 }).penalty, 0.8); // 0.75 -> 0.8

  const awful = "BROKEN!!! DOESN'T WORK, NOT WORKING, URGENT ASAP etc also";
  assert.equal(judgeReport(awful, { strictness: 1 }).penalty, 3);
});

test('score never goes below 0', () => {
  assert.equal(judgeReport("BROKEN!!! DOESN'T WORK ASAP also").score, 0);
});

test('verdict thresholds per court', () => {
  assert.equal(decideVerdict(3.9, 'district', true).key, 'GUILTY');
  assert.equal(decideVerdict(4, 'district', true).key, 'PROBATION');
  assert.equal(decideVerdict(7, 'district', true).key, 'ACQUITTED');
  assert.equal(decideVerdict(9, 'district', true).key, 'HALL_OF_FAME');

  assert.equal(decideVerdict(3, 'junior', false).key, 'PROBATION');
  assert.equal(decideVerdict(6, 'junior', false).key, 'ACQUITTED');
  assert.equal(decideVerdict(8, 'junior', false).key, 'HALL_OF_FAME');

  assert.equal(decideVerdict(4.9, 'supreme', true).key, 'GUILTY');
  assert.equal(decideVerdict(8, 'supreme', true).key, 'ACQUITTED');
  assert.equal(decideVerdict(9.5, 'supreme', true).key, 'ACQUITTED');
  assert.equal(decideVerdict(10, 'supreme', true).key, 'HALL_OF_FAME');
  // Supreme Court: acquittal or better requires all 8 criteria
  assert.equal(decideVerdict(9.5, 'supreme', false).key, 'PROBATION');
});

test('how-to-fix template marks missing parts', () => {
  const r = judgeReport('Checkout total ignores discount code\nExpected: 10% discount applied');
  assert.match(r.template, /^Title: Checkout total ignores discount code/m);
  assert.match(r.template, /^Expected result: 10% discount applied/m);
  assert.match(r.template, /^Actual result: <missing>/m);
  assert.match(r.template, /^Severity: <missing>/m);
});

test('sarcasm tone buckets', () => {
  assert.equal(sarcasmTone(0), 'polite');
  assert.equal(sarcasmTone(0.3), 'polite');
  assert.equal(sarcasmTone(0.4), 'dry');
  assert.equal(sarcasmTone(0.7), 'dry');
  assert.equal(sarcasmTone(0.8), 'savage');
  assert.equal(sarcasmTone(1), 'savage');
});

test('pickSentence chooses by verdict and tone', () => {
  const lines = [
    { verdict: 'GUILTY', tone: 'polite', line: 'a' },
    { verdict: 'GUILTY', tone: 'savage', line: 'b' },
  ];
  assert.equal(pickSentence(lines, 'GUILTY', 'savage', () => 0), 'b');
  assert.equal(pickSentence(lines, 'GUILTY', 'dry', () => 0), 'a'); // fallback to verdict
});
