# Web ui for gtfs osm matcher

## Purpose of this project

In order to display GTFS stops on the map without duplicates and visual clutter
we need to match GTFS stops to OSM stops.

This UI displays matching results in a more convenient way.

There are several sets of matched (not matched) stops,
with different level of confidence and different ways of improving matching.

## Getting Started with Development

### Install Dependencies
```bash
npm install -g corepack
yarn install
```

### Development
```bash
yarn dev              # Start development server
yarn serve-data       # Serve match data (requires ../gtfs-parser/data/match)
```

### Build & Deploy
```bash
yarn build            # Build for production
yarn preview          # Preview production build
yarn deploy           # Deploy (runs scripts/deploy.sh)
```

## My city or country is not on the list

We are looking for new sources of data and going to add them,
but please be explicit providing source for a gtfs feed.

Best way if you can give us a direct link to gtfs data and `trip updates` data.

If possible also provide a link to credentials or license to access data.

You can submit all this information to
<a href="mailto:publictransport@organicmaps.app">publictransport@organicmaps.app</a>
or <a href="https://github.com/organicmaps/gtfs-osm-matcher/issues?q=label%3Anew-gtfs-source">add an issue</a>
to this repository.


## Types of matches

To help with data matching you can add GTFS `id` or `code` to osm stops.
Different regions use different tags to store GTFS stop IDs.

Please take a look what tag is considered appropriate by the local community.

Typical tags are `<agency>_ref`, `gtfs:id`, `gtfs:stop_id`, `gtfs:stop_code`, etc.

One way to do so is to use the `Goto OSM` button to open the
current view on OSM and use the `Id` or `JOSM` editor via the `Edit` button
to add above mentioned data to OSM stops or create them.

Alternatively, use the built-in editor: enable `Edit` on an OSM element in the
selection panel to change its tags (with `Set Name` / `Set Id` / `Set Code`
shortcuts), `Move` it, or use `Add OSM Stop` to create a missing one. Collected
edits are listed in the `OSM Changes` tab and can be downloaded as a
JOSM-compatible `.osm` file for review and upload.


### match-id
These stops were matched by GTFS stop ID or Code.
That means that one of the OSM element tags has an exact match with the GTFS stop ID or Code.
Usually this is some kind of a ref tag.

### match-routes
These stops were matched by the routes going through them.

### match-name
These stops were matched by name and type and didn't get into a cluster of matches.
Names are normalised: special characters and diacritics are removed, names are lowercased,
ß is converted to ss, etc. Names are checked against *name* element tags.
Cluster of matches in this context means that more than one GTFS stop matched to the same OSM element.

### name-id-conflict
These stops were matched by name, but the GTFS ID or Code did not match.

### match-generic
These stops were matched to a nearby OSM stop that has no name or code to compare against.

### separated-cluster
This sub-category contains matches that were successfully separated from clusters.
At this moment cluster separation is done by distance.

In general these features are considered matched. It's possible that stop matches were separated from the cluster incorrectly.
To fix this type of an error add GTFS `id` or `code` to the OSM stop.

### transit-hub
These are clusters which contain one and only one OSM element
representing a transport hub, such as `amenity=bus_station`, `railway=station`, etc.
and any number of stops or platforms.

### many-to-one
These are clusters where multiple GTFS stops were matched to exactly one OSM element.

### cluster
These are clusters which the tool was unable to separate.

### no-match and no-osm

These two categories are similar in that they both contain stops
that were not matched to any OSM element. But `no-osm`
means that no OSM element of the appropriate type
was found at all within 750m (1000m for rail transport) radius.

## License

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
