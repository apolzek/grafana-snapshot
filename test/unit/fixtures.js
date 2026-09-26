// Normalized panels, as produced by src/data/collect.js.

const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const MIN = 60_000;

export const timeSeriesPanel = {
  id: 1,
  title: 'CPU by host',
  timeZone: 'utc',
  timeRange: { from: T0, to: T0 + 3 * MIN },
  frames: [
    {
      name: 'web-1',
      refId: 'A',
      fields: [
        { name: 'Time', type: 'time', values: [T0, T0 + MIN, T0 + 2 * MIN] },
        { name: 'web-1', type: 'number', unit: 'percent', values: [10, 20, 30] },
      ],
    },
    {
      name: 'web-2',
      refId: 'B',
      fields: [
        { name: 'Time', type: 'time', values: [T0 + MIN, T0 + 2 * MIN, T0 + 3 * MIN] },
        { name: 'web-2', type: 'number', unit: 'percent', values: [1.5, null, 3.5] },
      ],
    },
  ],
};

export const tablePanel = {
  id: 4,
  title: 'Services',
  timeZone: 'browser',
  timeRange: null,
  frames: [
    {
      name: '',
      refId: 'A',
      fields: [
        { name: 'service', type: 'string', values: ['api', 'auth & <sso>'] },
        { name: 'healthy', type: 'boolean', values: [true, false] },
        { name: 'errors', type: 'number', values: [3, 17] },
      ],
    },
  ],
};

export { T0, MIN };
