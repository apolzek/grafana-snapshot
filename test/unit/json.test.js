import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildJson } from '../../src/data/json.js';
import { T0, tablePanel, timeSeriesPanel } from './fixtures.js';

describe('buildJson', () => {
  const out = buildJson([timeSeriesPanel, tablePanel], {
    dashboard: 'Demo',
    url: 'https://g/d/demo',
    exportedAt: new Date(T0),
  });

  it('includes dashboard metadata', () => {
    assert.equal(out.dashboard, 'Demo');
    assert.equal(out.url, 'https://g/d/demo');
    assert.equal(out.exportedAt, '2026-01-15T12:00:00.000Z');
    assert.equal(out.panels.length, 2);
  });

  it('converts time fields and ranges to ISO-8601', () => {
    const [time, value] = out.panels[0].frames[0].fields;
    assert.deepEqual(time.values, ['2026-01-15T12:00:00.000Z', '2026-01-15T12:01:00.000Z', '2026-01-15T12:02:00.000Z']);
    assert.deepEqual(value, { name: 'web-1', type: 'number', unit: 'percent', labels: undefined, values: [10, 20, 30] });
    assert.deepEqual(out.panels[0].timeRange, { from: '2026-01-15T12:00:00.000Z', to: '2026-01-15T12:03:00.000Z' });
  });

  it('keeps non-time values untouched and survives serialization', () => {
    const round = JSON.parse(JSON.stringify(out));
    assert.deepEqual(round.panels[1].frames[0].fields[0].values, ['api', 'auth & <sso>']);
    assert.equal(round.panels[1].timeRange, null);
    assert.equal('name' in round.panels[1].frames[0], false);
  });
});
