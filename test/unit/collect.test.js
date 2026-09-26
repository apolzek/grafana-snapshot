import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fieldDisplayName, isPanelProps, normalizePanel, toArray } from '../../src/data/collect.js';

describe('toArray', () => {
  it('supports arrays, legacy Vectors and iterables', () => {
    const arr = [1, 2];
    assert.equal(toArray(arr), arr);
    assert.deepEqual(toArray({ toArray: () => [3, 4] }), [3, 4]);
    assert.deepEqual(toArray(new Set([5])), [5]);
    assert.deepEqual(toArray(undefined), []);
  });
});

describe('fieldDisplayName', () => {
  it('prefers the computed display name', () => {
    assert.equal(fieldDisplayName({ name: 'Value', state: { displayName: 'web-1' }, config: { displayName: 'x' } }), 'web-1');
    assert.equal(fieldDisplayName({ name: 'Value', config: { displayName: 'Configured' } }), 'Configured');
    assert.equal(fieldDisplayName({ name: 'Value', config: { displayNameFromDS: 'From DS' } }), 'From DS');
  });

  it('falls back to name plus labels', () => {
    assert.equal(
      fieldDisplayName({ name: 'Value', config: {}, labels: { host: 'a', job: 'node' } }),
      'Value {host="a", job="node"}'
    );
    assert.equal(fieldDisplayName({ name: 'Value', config: {}, labels: {} }), 'Value');
  });
});

describe('isPanelProps', () => {
  it('recognizes panel plugin props only', () => {
    assert.equal(isPanelProps({ data: { series: [] }, fieldConfig: {} }), true);
    assert.equal(isPanelProps({ data: { series: [] } }), false);
    assert.equal(isPanelProps({ data: {} , fieldConfig: {} }), false);
    assert.equal(isPanelProps(null), false);
  });
});

describe('normalizePanel', () => {
  const moment = (ms) => ({ valueOf: () => ms }); // Grafana passes moment/dayjs objects

  it('produces plain serializable panels', () => {
    const panel = normalizePanel({
      id: 7,
      title: 'Latency',
      timeZone: 'utc',
      timeRange: { from: moment(1000), to: moment(2000) },
      fieldConfig: {},
      data: {
        series: [
          {
            name: 'A-series',
            refId: 'A',
            fields: [
              { name: 'time', type: 'time', config: {}, values: { toArray: () => [1000, 2000] } },
              { name: 'Value', type: 'number', config: { unit: 'ms' }, labels: { le: '0.95' }, values: [5, 6] },
            ],
          },
        ],
      },
    });
    assert.deepEqual(panel, {
      id: 7,
      title: 'Latency',
      timeZone: 'utc',
      timeRange: { from: 1000, to: 2000 },
      frames: [
        {
          name: 'A-series',
          refId: 'A',
          fields: [
            { name: 'time', type: 'time', unit: undefined, labels: undefined, values: [1000, 2000] },
            { name: 'Value {le="0.95"}', type: 'number', unit: 'ms', labels: { le: '0.95' }, values: [5, 6] },
          ],
        },
      ],
    });
    assert.doesNotThrow(() => structuredClone(panel));
  });

  it('uses fallbacks for missing title, zone and range', () => {
    const panel = normalizePanel({ id: 3, fieldConfig: {}, data: { series: [] } }, 'From header');
    assert.equal(panel.title, 'From header');
    assert.equal(panel.timeZone, 'browser');
    assert.equal(panel.timeRange, null);
    assert.equal(normalizePanel({ id: 3, fieldConfig: {}, data: { series: [] } }).title, 'Panel 3');
  });
});
