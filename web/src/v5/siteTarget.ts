// Where a visitor goes after choosing a place on Home. One function, so the target page is changed in one line.

/** Hash for a chosen site: the site report (`#/site`), which picks the battery size and year itself. */
export function siteHash(lat: number, lon: number): string {
  return `#/site?${new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) })}`;
}
