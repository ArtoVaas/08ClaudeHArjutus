// Appeal comparison logic. Pure functions only: no database, no I/O.

const MIN_IMPROVEMENT = 1;
const TIRED_AFTER_APPEALS = 3;
const TIRED_MESSAGE = 'The court is tired of you. Request a training session.';
const ACQUITTED_OR_BETTER = new Set(['ACQUITTED', 'HALL_OF_FAME']);

function round1(n) {
  return Math.round(n * 10) / 10;
}

function signed(n) {
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}`;
}

/**
 * Compare an appeal with the verdict it appeals.
 * @param {number} previousScore score of the appealed verdict
 * @param {number} newScore score of the appeal
 * @param {number} appealNumber 1 for the first appeal of the original report, 2 for the second, ...
 * @param {string} newVerdictKey verdict level of the appeal (GUILTY, PROBATION, ACQUITTED, HALL_OF_FAME)
 */
function compareAppeal(previousScore, newScore, appealNumber, newVerdictKey) {
  const diff = round1(Number(newScore) - Number(previousScore));

  let outcome;
  let label;
  if (diff >= MIN_IMPROVEMENT) {
    outcome = 'GRANTED';
    label = `APPEAL GRANTED (${signed(diff)})`;
  } else if (diff <= -MIN_IMPROVEMENT) {
    outcome = 'CONTEMPT';
    label = `CONTEMPT OF COURT (${signed(diff)}) – you made it worse`;
  } else {
    outcome = 'DENIED';
    label = 'APPEAL DENIED – the court sees no real improvement';
  }

  const tired = appealNumber >= TIRED_AFTER_APPEALS && !ACQUITTED_OR_BETTER.has(newVerdictKey);

  return {
    outcome,
    label,
    previousScore: Number(previousScore),
    newScore: Number(newScore),
    diff,
    appealNumber,
    tiredMessage: tired ? TIRED_MESSAGE : null,
  };
}

module.exports = { compareAppeal, TIRED_MESSAGE };
