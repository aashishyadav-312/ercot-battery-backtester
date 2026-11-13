// Home with V5 on: the original Home (map, key numbers, what a schedule keeps, duration, hub table, live prices, four ways in)
// with the site search added to the hero. Choosing a place opens the site report. With V5 off, App uses pages/Home.tsx alone.
import { useEffect, useState } from 'react';
import { loadCountyIndex, loadPlaces } from '../v4/geo/load';
import { buildSearchIndex, type SearchHit, type SearchIndex } from '../v4/geo/search';
import { SiteSearch } from '../v4/map/SiteSearch';
import { siteHash } from '../v5/siteTarget';
import Home from './Home';

/** Counties and cities for the search box, loaded when Home opens. A failed load leaves the box saying it is loading. */
function usePlaceIndex(): SearchIndex | null {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadCountyIndex(), loadPlaces()]).then(([counties, places]) => live && setIndex(buildSearchIndex(counties, places))).catch(() => {});
    return () => { live = false; };
  }, []);
  return index;
}

export const onSitePick = (hit: SearchHit) => { window.location.hash = siteHash(hit.lat, hit.lon); window.scrollTo({ top: 0 }); };

export function HomeSearch({ places }: { places: SearchIndex | null }) {
  return <SiteSearch index={places} onPick={onSitePick} onClear={() => {}} label="Screen a site" />;
}

export default function HomeV5() {
  const places = usePlaceIndex();
  return <Home search={<HomeSearch places={places} />} />;
}
