// JSON export of normalized panels. Pure: no DOM access.

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : ms);

export function buildJson(panels, { dashboard, url, exportedAt = new Date() }) {
  return {
    dashboard,
    url,
    exportedAt: exportedAt.toISOString(),
    panels: panels.map((panel) => ({
      id: panel.id,
      title: panel.title,
      timeRange: panel.timeRange && { from: iso(panel.timeRange.from), to: iso(panel.timeRange.to) },
      frames: panel.frames.map((frame) => ({
        name: frame.name || undefined,
        refId: frame.refId || undefined,
        fields: frame.fields.map((field) => ({
          name: field.name,
          type: field.type,
          unit: field.unit,
          labels: field.labels,
          values: field.type === 'time' ? field.values.map(iso) : field.values,
        })),
      })),
    })),
  };
}
