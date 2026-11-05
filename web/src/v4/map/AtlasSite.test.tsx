// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import type { Topology } from 'topojson-specification';
import { mapDots, outlinePath, project } from '../../data/atlas';
import type { NodesFile } from '../../data/types';
import { nearestNodes } from '../geo/nearest';
import type { CountyInput } from '../geo/search';
import type { NodeIndex, Place } from '../geo/types';
import AtlasSite, { type GeoSource } from './AtlasSite';

afterEach(cleanup);
beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as never;
});

const geo = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), '../results/v4/geo', f), 'utf8'));
const NODES: NodesFile = JSON.parse(readFileSync(resolve(process.cwd(), '../results/nodes_2025_2h.json'), 'utf8'));
const NODE_INDEX = geo('node_index.json') as NodeIndex;
const source: GeoSource = {
  places: async () => geo('places.json') as Place[],
  counties: async () => geo('county_index.json') as (CountyInput & { fips: string })[],
  topo: async () => geo('tx_counties.topo.json') as Topology,
  nodeIndex: async () => NODE_INDEX,
};
const GEO_OUTLINE = outlinePath({
  source: 'test',
  state: { type: 'Feature', properties: { name: 'Texas' }, geometry: { type: 'Polygon', coordinates: [[[-106, 36], [-94, 36], [-94, 26], [-106, 26], [-106, 36]]] } },
  counties: { type: 'FeatureCollection', features: [] },
});

function setup() {
  const onSelect = vi.fn();
  const zoneOf = new Map(NODES.nodes.map((n) => [n.code, n.lz]));
  render(
    <MantineProvider>
      <AtlasSite
        source={source} outline={GEO_OUTLINE} dots={mapDots(NODES.nodes, 'rev')} metric="rev" zoneOf={zoneOf} zone={null} selected={null}
        onSelect={onSelect} label="Map of Texas"
      ><p>legend</p></AtlasSite>
    </MantineProvider>,
  );
  const svg = screen.getByRole('img', { name: 'Map of Texas' });
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 560, height: 540, right: 560, bottom: 540, x: 0, y: 0, toJSON() {} });
  return { onSelect, zoneOf, svg, box: () => screen.getByRole('combobox') as HTMLInputElement };
}
const ready = async (box: () => HTMLInputElement) => { await waitFor(() => expect(screen.queryByText('Loading places')).toBeNull()); box(); };

describe('place search', () => {
  it('"Jack County" drops a pin, zooms in, and lists the 3 nearest nodes with distances', async () => {
    const { box, zoneOf, svg } = setup();
    await ready(box);
    fireEvent.change(box(), { target: { value: 'Jack County' } });
    const options = await screen.findAllByRole('option');
    expect(options[0].textContent).toContain('Jack County');
    fireEvent.keyDown(box(), { key: 'Enter' });

    expect(screen.getByTestId('pin')).toBeTruthy();
    expect(svg.getAttribute('viewBox')).not.toBe('0.00 0.00 560.00 540.00');
    const panel = await screen.findByTestId('site-panel');
    expect(within(panel).getByRole('heading', { level: 3 }).textContent).toBe('Jack County');
    const list = await screen.findByTestId('near-list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    // Same answer as the helper, restricted to nodes that have prices in this run.
    const jack = (geo('county_index.json') as (CountyInput & { fips: string })[]).find((c) => c.name === 'Jack')!;
    const inRun = Object.fromEntries(Object.entries(NODE_INDEX).filter(([c, n]) => n.kind === 'hub' || zoneOf.has(c)));
    const want = nearestNodes(inRun, jack.lat, jack.lon, 3).nodes;
    want.forEach((n, i) => {
      expect(rows[i].textContent).toContain(n.code);
      expect(rows[i].textContent).toContain(`${n.km < 10 ? n.km.toFixed(1) : Math.round(n.km)} km`);
    });
    expect(screen.getByTestId('near-hub').textContent).toMatch(/Nearest hub marker: HB_/);
  });

  it('clicking a nearest node selects it on the Atlas', async () => {
    const { box, onSelect, zoneOf } = setup();
    await ready(box);
    fireEvent.change(box(), { target: { value: 'austin' } });
    fireEvent.click((await screen.findAllByRole('option'))[0]);
    const first = within(await screen.findByTestId('near-list')).getAllByRole('button')[0];
    fireEvent.click(first);
    const code = onSelect.mock.calls[0][0] as string;
    expect(first.textContent).toContain(code);
    expect(zoneOf.has(code)).toBe(true); // a node that has prices in this run
  });

  it('reads "lat, long", and refuses a point outside Texas', async () => {
    const { box } = setup();
    await ready(box);
    fireEvent.change(box(), { target: { value: '33.2, -98.2' } });
    expect((await screen.findAllByRole('option'))[0].textContent).toContain('Point');
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect((await screen.findByTestId('site-panel')).textContent).toContain('33.200, -98.200');

    cleanup();
    const again = setup();
    await ready(again.box);
    fireEvent.change(again.box(), { target: { value: '45, -98' } });
    const out = await screen.findByRole('option');
    expect(out.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(again.box(), { key: 'Enter' });
    expect(screen.queryByTestId('pin')).toBeNull();
  });

  it('arrows move the choice, Esc clears the box, a second Esc clears the site', async () => {
    const { box } = setup();
    await ready(box);
    fireEvent.change(box(), { target: { value: 'j' } });
    await screen.findAllByRole('option');
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    expect(box().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(await screen.findByTestId('site-panel')).toBeTruthy();
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(box().value).toBe('');
    expect(screen.getByTestId('site-panel')).toBeTruthy();
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(screen.queryByTestId('site-panel')).toBeNull();
  });

  it('"/" focuses the box, but not while typing in another field', async () => {
    const { box } = setup();
    await ready(box);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(box());
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

describe('pick a site', () => {
  it('a click drops a pin at the clicked place, and node clicks are paused meanwhile', async () => {
    const { svg, onSelect, box } = setup();
    await ready(box);
    const dot = svg.querySelector('g[aria-hidden] g') as SVGGElement;
    fireEvent.click(dot);
    expect(onSelect).toHaveBeenCalledTimes(1);

    const toggle = screen.getByRole('button', { name: 'Pick a site' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dot);
    expect(onSelect).toHaveBeenCalledTimes(1); // paused
    const [x, y] = project(-98.2, 33.2);
    fireEvent.click(svg, { clientX: x, clientY: y });
    const panel = await screen.findByTestId('site-panel');
    expect(panel.textContent).toContain('33.200, -98.200');
    expect(panel.textContent).toContain('Picked on the map');
    await within(panel).findByTestId('near-list');

    fireEvent.click(toggle);
    fireEvent.click(dot);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('ignores a click outside Texas', async () => {
    const { svg, box } = setup();
    await ready(box);
    fireEvent.click(screen.getByRole('button', { name: 'Pick a site' }));
    const [x, y] = project(-110, 40); // off the drawing
    fireEvent.click(svg, { clientX: x, clientY: y });
    expect(screen.queryByTestId('pin')).toBeNull();
  });
});

describe('zoom buttons and layers', () => {
  it('zoom in shows county lines and more city labels; reset returns to the full view', async () => {
    const { svg, box } = setup();
    await ready(box);
    const labels = () => svg.querySelectorAll('text').length;
    const atStart = labels();
    expect(svg.querySelector('path[d^="M"][style*="opacity"]')).toBeNull();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect((screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(zoomIn); fireEvent.click(zoomIn); fireEvent.click(zoomIn);
    await waitFor(() => expect(svg.querySelector('path[style*="opacity"]')).not.toBeNull());
    expect(svg.getAttribute('data-zoomed')).toBe('true');
    expect(labels()).toBeGreaterThan(0);
    expect(atStart).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(svg.getAttribute('viewBox')).toBe('0.00 0.00 560.00 540.00');
  });

  it('loads nothing heavy until needed: the county outlines wait for zoom or a county pick', async () => {
    const topo = vi.fn(source.topo);
    const idx = vi.fn(source.nodeIndex);
    render(
      <MantineProvider>
        <AtlasSite source={{ ...source, topo, nodeIndex: idx }} outline="" dots={[]} metric="rev" zoneOf={new Map()} zone={null} selected={null} onSelect={() => {}} label="m" />
      </MantineProvider>,
    );
    await screen.findByRole('combobox');
    expect(topo).not.toHaveBeenCalled();
    expect(idx).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(topo).toHaveBeenCalledTimes(1));
  });
});
