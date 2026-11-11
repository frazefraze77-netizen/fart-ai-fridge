import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/vision.js', import.meta.url), 'utf8')
  .replace('return { readLabel,', 'return { combineProducePredictions, produceViews, readLabel,');
function vision(value = 100) {
  const context = {
    window: { FartCore: { catalogFor: key => ['apple', 'pear', 'banana', 'broccoli'].includes(key) } },
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({
      fillRect() {}, drawImage() {}, putImageData() {},
      getImageData: () => ({ data: new Uint8ClampedArray(Array.from({ length: 100 }, () => [value, value, value, 255]).flat()) })
    }) }) }
  };
  vm.runInNewContext(source, context);
  return context.window.FartVision;
}
const rank = (key, score, other = 'pear') => [{ key, score }, { key: other, score: 1 - score }];
test('consistent views produce a clear suggestion', () => {
  const result = vision().combineProducePredictions([rank('apple', .9), rank('apple', .85), rank('apple', .88)], null);
  assert.equal(result.matches[0].key, 'apple');
  assert.equal(result.uncertain, false);
});
test('lighting and crop disagreement stays uncertain', () => {
  const result = vision().combineProducePredictions([rank('apple', .95), rank('pear', .8, 'apple'), rank('apple', .8)], null);
  assert.equal(result.uncertain, true);
});
test('a strong detector cannot hide classifier disagreement', () => {
  const result = vision().combineProducePredictions([rank('apple', .98), rank('apple', .95)], { key: 'banana', score: .99 });
  assert.equal(result.uncertain, true);
  assert.match(result.message, /disagree/);
  assert.ok(result.matches.some(match => match.key === 'apple'));
});
test('weak guesses are withheld', () => {
  const result = vision().combineProducePredictions([[{ key: 'apple', score: .2 }, { key: 'pear', score: .19 }]], null);
  assert.equal(result.matches.length, 0);
});
test('single-model fallback remains uncertain', () => {
  assert.equal(vision().combineProducePredictions([rank('apple', .99)], null).uncertain, true);
  const result = vision().combineProducePredictions([], { key: 'broccoli', score: .99 });
  assert.equal(result.matches[0].key, 'broccoli');
  assert.equal(result.uncertain, true);
});
for (const [value, reason] of [[2, /dark/], [250, /washed out/], [100, /detail/]]) {
  test(`unusable luminance ${value} receives retake guidance`, () => {
    const result = vision(value).produceViews({ width: 10, height: 10 }, null);
    assert.equal(result.views.length, 0);
    assert.match(result.problem, reason);
  });
}
