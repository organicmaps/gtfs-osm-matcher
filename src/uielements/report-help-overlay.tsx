import { createPortal } from 'preact/compat';

export function ReportHelpOverlay({ onClose }: { onClose: () => void }) {
    return createPortal(
        <div className={"overlay"}>
            <div className={'overlay-content'}>
                <span className={'link-like'} onClick={onClose}>Close</span>
                <p>
                    Main goal of this tool is to link GTFS stops to OSM stops.

                    Otherwise the map would be cluttered with stops from different sources.
                </p>
                <p>
                    There are different ways how to establish that match with different level of confidence.
                    Different sub-categories show different groups of matches or errors if the tool can't match
                    GTFS and OSM stop with enough confidence.
                </p>
                <p>
                    <ul>
                        <li>match-id -
                            These stops were matched by GTFS stop ID or Code.
                            That means that one of the OSM element tags has an exact match
                            with the GTFS stop ID or Code.

                            Usually this is some kind of a ref tag.
                        </li>
                        <li>match-routes -
                            These stops were matched by the routes going through them.
                        </li>
                        <li>match-name -
                            These stops were matched by name and type and didn't get into a cluster of matches.
                            Names are getting normalised: special characters removed,
                            lowercase, diacritics removed, ß converted to ss etc.

                            Names are checked against *name* element tags.

                            <p>
                                Cluster of matches in this context means that
                                more than one GTFS stop matched to the same OSM element.
                            </p>
                        </li>
                        <li>name-id-conflict -
                            These stops were matched by name, but the GTFS ID or Code did not match.
                        </li>
                        <li>match-generic -
                            These stops were matched to a nearby OSM stop that has no name or code to compare against.
                        </li>
                        <li>separated-cluster -
                            This sub-category contains matches that were successfully separated from clusters.

                            At this moment cluster separation is done by distance.
                        </li>
                        <li>cluster -
                            These are clusters which the tool was unable to separate.
                        </li>
                        <li>many-to-one -
                            These are clusters where multiple GTFS stops were matched to exactly one OSM element.
                        </li>
                        <li>transit-hub -
                            These are clusters which contain one and only one OSM element representing a transport hub,
                            such as amenity=bus_station, railway=station, etc. and any number of stops or platforms.
                        </li>
                        <li>no-match -
                            These are GTFS stops that were not matched to any OSM element.
                        </li>
                        <li>no-osm -
                            These are GTFS stops for which no OSM element of the appropriate type was found.
                        </li>
                    </ul>
                </p>
                <p>
                    If you found a bug or have a suggestion, please write us at
                    <span> <a href="mailto:publictransport@organicmaps.app">
                        publictransport@organicmaps.app
                    </a></span> or create an issue on
                    <span> <a href="https://github.com/organicmaps/gtfs-osm-matcher/issues">
                        GitHub
                    </a></span>
                </p>
            </div>
        </div>,
        document.body
    )
}