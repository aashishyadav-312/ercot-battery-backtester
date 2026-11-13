// Where a visitor goes after choosing a place on Home. One function, so the step that adds the site report page changes one line.

/** Hash for a chosen site. Today it opens the Atlas on that site; the site report (`#/site`) replaces it later. */
export function siteHash(lat: number, lon: number): string {
  return `#/atlas?${new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) })}`;
}
