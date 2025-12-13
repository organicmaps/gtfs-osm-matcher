export function ReportHelpOverlay({ onClose }: { onClose: () => void }) {
    return (
        <div className={"overlay"}>
            <div className={'overlay-content'}>
                <span className={'link-like'} onClick={onClose}>Close</span>
                <p>
                    Main goal of this tool is to link GTFS stops to OSM stop.

                    Otherwise map would be cluttered with stps from different sources.
                </p>
                <p>
                    There are different ways how to establish that match with different level of confidence.
                    Different sets shows different groups of matches or errors if tool can't match
                    GTFS and OSM stop with enough confidence.
                </p>
                <p>
                    <ul>
                        <li>match-id -
                            This stops were matched by GTFS stop ID or Code.
                            That means that one of the osm element tags have exact match
                            with GTFS stop ID or Code.

                            Usually this is some kind of a ref tag.
                        </li>
                        <li>match-name -
                            This stops were matched by name and type and didn't get into a cluster of matches.
                            Names are getting normalised: Special characters removed,
                            lowercase, diacritics removed, ß converted to ss etc.

                            Names are checked against *name* elemnt tags.

                            <p>
                                Cluster of matches in this context means that
                                more than one GTFS stop matched to the same OSM element.
                            </p>
                        </li>
                        <li>separated-clusters -
                            This dataset contains matches that were successfuly separated from clusters.

                            At this moment cluster separation is done by distance.
                        </li>
                        <li>transit-hub-clusters -
                            This are clusters which contains one and only one OSM element representing trunsport hub,
                            such as amenity=bus_station, railway=station, etc. and any number of stops or platforms.
                        </li>
                        <li>many-to-one -
                            This are clusters where multiple GTFS stops were matched to excatly one OSM element.
                        </li>
                        <li>clusters -
                            This are clusters which the tool was unable to separate.
                        </li>
                        <li>no-match -
                            This are GTFS stops that were not matched to any OSM element.
                        </li>
                        <li>no-osm-stops -
                            This are GTFS stops for which no OSM element of the appropiate type was found.
                        </li>
                    </ul>
                </p>
                <p>
                    If you found a bug or have a suggestion, please write us a message to
                    <span> <a href="mailto:publictransport@organicmaps.app">
                        publictransport@organicmaps.app
                    </a></span>
                </p>
            </div>
        </div>
    )
}