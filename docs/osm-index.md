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

## What the map does with it: it takes over the preview

Preview today re-projects the report's own stop markers onto their anchors, from
`anchor_lon`/`anchor_lat` on every index row. `osm-index.tsv` makes that the long way round.
The anchored position *is* the OSM feature's position, so drawing the features themselves
shows the same geometry and, in the same layer, the thing the re-projection cannot say: how
many GTFS stops each feature carries. Three colours — none, one, several — a legend with
exact counts, and no join.

So the switch stops meaning "move the stops" and starts meaning "show what the matcher was
matching against". What that buys, beyond the new bucket:

* **The stop rows lose two columns.** `anchor_lon`/`anchor_lat` are 962 KB on swiss-opendata
  and 3.6 MB on germany-local — 7% of that index — carried on every row whether or not it has
  an anchor, and downloaded by every visitor on every load for a switch that defaults to off.
  With the features drawn from their own file, nothing reads them.
* **The new file is lazy.** It is fetched on the first toggle, not with the index, which is
  the shape the repo asks for and the one the preview's own deleted predecessor had.
* **A refused stop stops being ambiguous.** Under the re-projection a stop that did not move
  means either "anchored exactly here" or "the anchoring refused it", and telling them apart
  needed a faded icon plus a panel line. With the features on the map the question answers
  itself: the stop sits beside a feature that carries no anchored stop.

What it costs, and it is a real cost: the re-projection shows *displacement* — this stop moved
174 m — at a glance, for every stop at once. Drawing features shows what is there, and the
displacement is only visible per selected stop, through the match arrow the panel already
draws. If the displacement view turns out to be the one people use, it is worth keeping both,
and then the anchor columns stay.

**Sequencing.** `feat/preview-anchors` works today against data that exists, and is reviewed;
this needs a matcher change that has not been written. So that lands first, and `osm-index`
supersedes it in one change that also drops the anchor columns and the preview's own
machinery — the two-projection cache, the availability gate, the faded refusals. There is
never a window with two half-features, and never one with neither.

The structure archive stays what it is — the geometry layer behind the report. The "none"
bucket is a region-scoped count rather than "whatever the planet-wide archive happens to hold
at `--modes bus,trolleybus,tram`", and no `anchor_osm` column on stop rows is needed either:
the inverse index *is* the file.

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

## Measured, before any of it is built

The matcher side is implemented (`gtfs-server` `feat/osm-index`). Two feeds, current planet:

| | swiss-opendata | italy-milano |
| :--- | ---: | ---: |
| GTFS stops | 68,571 | 4,855 |
| pool (features offered to some stop) | **123,530** | **13,540** |
| of those, in nobody's verdict | 67,925 (55%) | 8,293 (61%) |
| `osm-index.tsv` raw / gzip | 10.8 MB / 2.9 MB | 1.1 MB / — |
| `index.tsv` for comparison | 9.3 MB | 0.59 MB |

Anchored stops per feature:

| | 0 | 1 | 2 | 3 | 4+ |
| :--- | ---: | ---: | ---: | ---: | ---: |
| swiss-opendata | 84,777 | 29,971 | 6,748 | 1,861 | 106 |
| italy-milano | 9,074 | 4,447 | 18 | 1 | 0 |

Three things follow, and they shape the frontend rather than decorate it.

**The pool is 1.8–2.8× the stop count, and the file is bigger than `index.tsv`.** Extrapolating
germany-local's 433,086 stops gives roughly 800k rows and 60–70 MB raw. Fetching that eagerly
is out of the question, and fetching it at all needs a reason.

**69% of features carry no anchored stop.** Drawing the whole pool is drawing mostly grey — the
bucket that is least interesting per feature and most numerous.

**Two columns are a quarter of the bytes** and neither is needed to draw a dot: `gtfs_ids`
2.52 MB (23%) and `name` 1.72 MB (16%).

## The frontend, then

### 1. A slim file for the map, the full one for a click

The map needs `osm:id`, `lon`, `lat`, `gtfs_anchored` — 26% of the bytes. `gtfs_ids`, `name`,
`modes`, `flavour` and `gtfs_matched` answer questions about *one* feature, which is a click.

So the server writes `osm-index.tsv` sorted by id, and the reader fetches it once per region
**on the first toggle** — never with `index.tsv` — parsing only the four columns it draws with
and keeping the rest as offsets into the fetched text. Nothing is re-fetched per click; the
text is already in memory, and a `byte_start`/`byte_end` scheme like the stop details would be
a second mechanism for something a `Map<osmId, line>` already does.

If germany-local's 60 MB proves too much even lazily, the fallback is a server-side split: a
`osm-index.slim.tsv` of the four map columns, with the full file range-requested per feature.
Not built until a feed needs it — the numbers above do not yet demand it.

### 2. One layer, three colours, drawn under the stops

`OsmIndexLayer`, a render-less overlay following `StopsLayer`'s idiom exactly — build the spec,
`mapLoaded.then` behind a `subscription` guard, `addOverlayImmediate`, clean up on unmount. A
`circle` layer, not symbols: 123k circles cost far less than 123k icons, and a circle reads as
"a thing OSM has" rather than as another stop pin.

```
circle-color: ['case',
    ['==', ['get', 'anchored'], 0], grey,      // 69% — nothing is written here
    ['==', ['get', 'anchored'], 1], green,     // the healthy case
    amber]                                     // several stops at one feature
```

Below the stop symbols in the layer order, so a stop pin is never obscured by the feature it
is anchored to.

### 3. The switch takes the preview's place

`ViewOptionsContext` keeps its shape — a flag, an availability, both published by the report —
and only the meaning changes: `previewOn` becomes `osmIndexOn`, `previewAvailable` becomes
"this region has an `osm-index.tsv`" (a 404 on first fetch turns it off and says so once).
`PreviewSwitch` becomes `OsmIndexSwitch`, still one component rendered in both the report tab
and the selection panel, still hidden where the region cannot honour it.

The legend goes beside it: three swatches with region-wide counts, which the parsed rows give
for free — 84,777 / 29,971 / 8,715 for swiss-opendata.

### 4. Clicking a feature, without a new selection kind

A click on a circle shows what the row holds: the feature's flavour and modes, its `name`, and
its stops as links. The links are ordinary `#/match-report/{region}/selection/{gtfsId}` hashes,
so each one lands in the panel that already exists — no second panel shape, no second detail
fetch path, and the "several stops at one feature" case becomes navigable rather than merely
coloured.

A feature with no stops has nothing to link, and that is the point of the bucket: the panel
says so, and the OSM link is the action.

### 5. What comes out when it lands

In one change, so there is never a window with two half-features:

* `anchor_lon` / `anchor_lat` from `index.tsv` (962 KB swiss, 3.6 MB germany-local, on every
  row whether or not it has an anchor) and their parsing in `matchIndex.ts`;
* the two-projection cache, `previewing`, `anchoredTotal` / `anchoredCounts`, the `unanchored`
  fade and the anchor-aware `flyTo` in `report.tsx`;
* the preview's entry in the data contract and the component tree.

What stays is the panel's anchoring verdict — `osmAnchor` / `notAnchored` in words — which
answers "why is this stop not on a feature" and has no equivalent on the OSM side.

### Order

Slim reader and layer first, against swiss-opendata, where 8,715 multi-stop features make the
amber bucket worth looking at. Then the legend and the switch swap. Then the removals, which
are the change that needs the server column drop landing with it. The click panel last: it is
the only part that can be dropped without leaving a half-feature behind.
