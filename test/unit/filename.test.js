import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dashboardTitle, makeFilename, slugify, timestamp } from '../../src/shared/filename.js';

describe('dashboardTitle', () => {
  it('strips the Grafana suffix', () => {
    assert.equal(dashboardTitle('API Production - Dashboards - Grafana'), 'API Production');
    assert.equal(dashboardTitle('Home - Grafana'), 'Home');
  });

  it('keeps titles without a suffix and falls back when empty', () => {
    assert.equal(dashboardTitle('Service map'), 'Service map');
    assert.equal(dashboardTitle(''), 'dashboard');
    assert.equal(dashboardTitle(undefined), 'dashboard');
  });
});

describe('slugify', () => {
  it('removes accents and unsafe characters', () => {
    assert.equal(slugify('Produção / Latência: p95?'), 'Producao-Latencia-p95');
  });

  it('never returns an empty or dot-leading name', () => {
    assert.equal(slugify('...'), 'dashboard');
    assert.equal(slugify('///'), 'dashboard');
    assert.equal(slugify('.hidden'), 'hidden');
  });

  it('limits the length without a trailing separator', () => {
    const slug = slugify('a'.repeat(79) + ' b', 80);
    assert.ok(slug.length <= 80);
    assert.doesNotMatch(slug, /-$/);
  });
});

describe('makeFilename', () => {
  it('combines prefix, slug and local timestamp', () => {
    const date = new Date(2026, 8, 26, 7, 5, 3);
    assert.equal(timestamp(date), '2026-09-26_07-05-03');
    assert.equal(
      makeFilename('grafana', 'Minha API - Dashboards - Grafana', 'html', date),
      'grafana_Minha-API_2026-09-26_07-05-03.html'
    );
  });
});
