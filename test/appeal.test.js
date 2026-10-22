const test = require('node:test');
const assert = require('node:assert/strict');
const { compareAppeal, TIRED_MESSAGE } = require('../src/judge/appeal');

test('appeal granted when score rises by 1 point or more', () => {
  const r = compareAppeal(3.5, 6, 1, 'PROBATION');
  assert.equal(r.outcome, 'GRANTED');
  assert.equal(r.diff, 2.5);
  assert.equal(r.label, 'APPEAL GRANTED (+2.5)');

  const exactlyOne = compareAppeal(4, 5, 1, 'PROBATION');
  assert.equal(exactlyOne.outcome, 'GRANTED');
  assert.equal(exactlyOne.label, 'APPEAL GRANTED (+1.0)');
});

test('appeal denied when score changes by less than 1 point', () => {
  for (const [prev, next] of [[5, 5], [5, 5.5], [5, 5.9], [5, 4.5], [5, 4.1]]) {
    const r = compareAppeal(prev, next, 1, 'PROBATION');
    assert.equal(r.outcome, 'DENIED', `${prev} -> ${next}`);
    assert.equal(r.label, 'APPEAL DENIED – the court sees no real improvement');
  }
});

test('contempt of court when score drops by 1 point or more', () => {
  const r = compareAppeal(6, 4.5, 1, 'PROBATION');
  assert.equal(r.outcome, 'CONTEMPT');
  assert.equal(r.diff, -1.5);
  assert.equal(r.label, 'CONTEMPT OF COURT (-1.5) – you made it worse');
  assert.equal(compareAppeal(6, 5, 1, 'PROBATION').outcome, 'CONTEMPT');
});

test('floating point differences are rounded to one decimal', () => {
  const r = compareAppeal(0.3, 1.3, 1, 'GUILTY');
  assert.equal(r.diff, 1);
  assert.equal(r.outcome, 'GRANTED');
});

test('3rd appeal without reaching ACQUITTED adds the tired message', () => {
  assert.equal(compareAppeal(2, 2.5, 1, 'GUILTY').tiredMessage, null);
  assert.equal(compareAppeal(2, 2.5, 2, 'GUILTY').tiredMessage, null);
  assert.equal(compareAppeal(2, 2.5, 3, 'GUILTY').tiredMessage, TIRED_MESSAGE);
  assert.equal(compareAppeal(4, 6, 4, 'PROBATION').tiredMessage, TIRED_MESSAGE);
  assert.equal(TIRED_MESSAGE, 'The court is tired of you. Request a training session.');
});

test('no tired message once the appeal reaches ACQUITTED or better', () => {
  assert.equal(compareAppeal(5, 7.5, 3, 'ACQUITTED').tiredMessage, null);
  assert.equal(compareAppeal(5, 9.5, 5, 'HALL_OF_FAME').tiredMessage, null);
});
