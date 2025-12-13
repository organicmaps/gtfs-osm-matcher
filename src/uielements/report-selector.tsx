import { useEffect, useState } from "preact/hooks";
import { parseUrlReportRegion, useHash } from "./routing";
import { MatchReport, type Report } from "./report";
import "./report-selector.css";

type UpdateReportItem = {
    name: string;
    gtfsUpdate: string;
    gtfsParse: string;
    matchStats: {
        total: number;
        matchId: number;
        nameMatch: number;
        manyToOne: number;
        transitHubs: number;
        noMatch: number;
        empty: number;
    }
}

const dateFormatter = new Intl.DateTimeFormat(navigator.language, { year: 'numeric', month: 'short', day: 'numeric' });
function formatDate(date: Date | null | undefined) {
    return date ? dateFormatter.format(date) : 'N/A';
}

export function MatchReportSelector() {
    const [showHelp, setShowHelp] = useState(false);
    const [reports, setReports] = useState<Report[]>([]);
    const [updateReports, setUpdateReports] = useState<UpdateReportItem[]>([]);
    const reportRegion = parseUrlReportRegion(useHash());

    useEffect(() => {
        fetch('/data/match-report.json')
            .then(r => r.json())
            .then(data => { setReports(data.matchedRegions); });

        fetch('/data/update-report.json')
            .then(r => r.json())
            .then(data => { setUpdateReports(data); });
    }, [setReports, setUpdateReports]);

    const links = reports.map((report) => {
        const updateReport = updateReports.find(u => u.name === report.region);
        const region = report.region;
        const gtfsDate = report.matchMeta?.gtfsTimeStamp ? new Date(report.matchMeta.gtfsTimeStamp) : null;

        const matchStats = updateReport?.matchStats;
        const matched = matchStats && (matchStats.matchId + matchStats.nameMatch + matchStats.manyToOne + matchStats.transitHubs);
        const matchPercent = matched && matched / matchStats.total * 100;

        let matchClass = '';
        if (matchPercent) {
            if (matchPercent >= 85) {
                matchClass = 'match-high';
            } else if (matchPercent >= 75) {
                matchClass = 'match-medium';
            } else {
                matchClass = 'match-low';
            }
        }

        return (
            <div key={region} className="report-item">
                <div className="report-header">
                    <a href={`#/match-report/${region}`} >{region}</a>
                </div>
                <div className="report-stats">
                    <div>GTFS Date: {formatDate(gtfsDate)}</div>
                    {updateReport && (
                        <>
                            <div className={matchClass}>Matched: {matchPercent?.toFixed(0)}% ({matched} of {matchStats?.total})</div>

                            <div>Total: {matchStats?.total}</div>

                            <div>Empty: {matchStats?.empty}</div>
                            <div>No Match: {matchStats?.noMatch}</div>

                            <div>GTFS Update: {updateReport.gtfsUpdate}</div>
                            <div>GTFS Parse: {updateReport.gtfsParse}</div>
                        </>
                    )}
                </div>
            </div>
        );
    })

    const reportData = reportRegion && reports.find(r => r.region === reportRegion);
    if (reports.length > 0 && !reportData) {
        // Arm map bounds fly-to only when reposrts selector is open and links are loaded
        window.dispatchEvent(new CustomEvent('SelectingReports'));
    }

    if (reportData) {
        return (
            <>
                <div className={'right-top'}>
                    <div>
                        <a href="#/">Back to reports</a>
                        <span className={'float-right'}>
                            <span className={'link-like'} onClick={() => setShowHelp(!showHelp)}>Help</span>
                        </span>
                    </div>
                    <MatchReport
                        key={reportRegion}
                        reportRegion={reportRegion}
                        reportData={reportData} />
                </div>
                {showHelp && (
                    <div className={"overlay"}>
                        <div className={'overlay-content'}>
                            <span className={'link-like'} onClick={() => setShowHelp(false)}>Close</span>
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
                )}
            </>
        )
    }

    return (
        <div className={"overlay"}>
            <div className={'overlay-content'}>
                <h2>Available match reports</h2>
                <div className={'reports'}>
                    {links}
                </div>
                <div className={"report-list-footer"}>
                    To add a new GTFS feed, please write us a message to
                    <span> <a href="mailto:publictransport@organicmaps.app">
                        publictransport@organicmaps.app
                    </a></span>
                </div>
            </div>
        </div>
    )
}
