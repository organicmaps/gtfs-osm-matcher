# The OSM side of the report: `osm-index.tsv`

Everything the report says today is indexed by GTFS stop: one row per stop, one detail body
per stop, one set of counts per region. The OSM side is only ever seen through a stop that
reached it, so two questions have no answer anywhere in the data:

* **How much of what the matcher looked at did it fail to use?** Every stop's candidates were
  found, filtered by mode and ordered by distance; some of them lost. Nobody counts them.
* **What does one OSM feature carry?** Exactly one anchored GTFS stop, several, or none.

The second is a map question and the first is a quality metric, but they are the same join
read in the same direction, so one artifact answers both.

## The pool

The denominator is **the candidates the matcher actually saw**: the union, over the feed's
stops, of what `OsmIndex.queryCandidates(timetable)` returned — type-filtered by the stop's
GTFS modes, inside the first search radius or the widened second, railway radii for railway
stops, and past the mode filter entirely where `allowTypeMismatch` let it fall through.

That is deliberately not "every OSM PT feature in the feed's coverage tiles", which the index
could also give for free. A feature no stop was ever near is an OSM coverage question; a
feature the matcher held in its hand and did not use is a matcher question. This metric is
the second one, and mixing the first into it would bury the signal under rural bus stops no
feed serves.

**The pool is not retained today.** `OsmMatchResults.osmFeaturesIndex` holds the features that
appear in some stop's verdict — `addNoMatch` even says "We don't need not matched
OsmFeatures" — and a losing candidate of a *matched* stop is dropped entirely. So recording it
is the one new thing the matcher has to do: a `Set<OsmPTFeature>` filled where
`queryCandidates` is called, per matcher instance. Matching within a feed is sequential (only
`App` parallelises, one matcher per feed), so a plain `HashSet` is enough.

## `osm-index.tsv`, one row per pooled feature

Written per region beside `index.tsv`:

| column | |
| :--- | :--- |
| `osm:id` | `n878129078` — the join key everything else in the app already uses |
| `lon`, `lat` | 7 decimals, as everywhere else |
| `flavour` | stop / station / position / platform, from `PTTagsTypeParser` |
| `modes` | the OSM PT modes read off the tags |
| `gtfs_matched` | how many GTFS stops matched it |
| `gtfs_anchored` | how many the anchoring actually put there |
| `gtfs_ids` | the stop ids, `;`-joined |
| `name` | the OSM `name` tag, for search |

`gtfs_anchored` is the column the map colours by: 0, 1, or several. `gtfs_matched` is what
the metric counts, and the two differing on one feature is itself worth seeing — it is a
feature several stops reached that the anchoring then refused to place any of them at.

Size is the pool, not the planet: a large region is in the same order as its `index.tsv`,
which the app already loads eagerly.

## The metric

`OsmMatchStats` gains the pool size and the unmatched count; `MatchReport` carries it to
`match-report.json` unchanged, and the report table derives the percentage where it shows it
(`calcPercent` is already there). Counts rather than a stored percentage: the ratio is one
division and the numerator is the thing that moves.

What it measures, stated so nobody reads more into it: **the share of OSM features the matcher
considered and left unused**. It is not an error rate. A candidate that lost to a better one
at the same place is a correct rejection, and a healthy feed still has a large pool of near
misses — two poles of one stop, a station and its platforms. The number is worth watching
because it *moves*: a tier that stops firing, a radius change, a mode filter that got
stricter, all show up here before they show up as anchors.

## What the map does with it

Preview mode (`feat/preview-and-dissolution`) already re-projects stops onto their anchors.
Colouring the OSM features by `gtfs_anchored` needs nothing else: the file is per region, it
holds coordinates, and it is loaded the way `index.tsv` is. Three colours — none, one,
several — a legend with exact counts, and no join.

This drops both halves of the earlier plan: no `anchor_osm` column on the stop rows (the
inverse index *is* the file), and no `feature-state` colouring of `pt-structure.pmtiles`
against a client-side map. The structure archive stays what it is — the geometry layer behind
the report — and the "none" bucket becomes an honest region-scoped count rather than
"whatever the planet-wide archive happens to hold at `--modes bus,trolleybus,tram`".

## The dissolution wrinkle

A dissolved stop's parts (`<id>#n<osm>`) anchor to real OSM features while no derived stop
appears in the report. Written from the OSM side, that fixes itself: `gtfs_anchored` counts
the parts anchored at the feature and `gtfs_ids` names them, because the row is keyed by the
feature rather than by a stop the feed contains. Nothing special is needed as long as the
writer reads the mint plans alongside the anchors — which only matters once
`feat/virtual-stop-dissolution` lands.

## Branches

* matcher: `feat/osm-index` off `master` — the pool, the stats field, the writer.
* webui: `feat/osm-index` (this branch, off `feat/preview-and-dissolution`) — the reader, the
  colouring, the legend. It rebases onto `main` once the preview PR merges.

## Order

1. Record the pool and add the two counts to `match-report.json`. That alone is the metric,
   and it can be measured on several feeds before any file format is agreed.
2. Write `osm-index.tsv`, then a scoped run to get one to build against.
3. The map colouring and the legend.
4. Later, if it earns it: clicking a feature opens a panel listing its stops. The selection
   panel is GTFS-stop-centric, so that is a new selection kind, not a tweak.
