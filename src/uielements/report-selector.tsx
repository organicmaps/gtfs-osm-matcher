import { useEffect, useState } from "preact/hooks";
import { parseUrlReportRegion, useHashRoute } from "./routing";
import { MatchReport, type Report } from "./report";
import { RegionTree, type RegionTreeData } from "./region-tree";
import { cls } from "./cls";
import { DATA_BASE_URL } from "../config";
import "./report-selector.css";

type MatchReportSelectorProps = {
    onSelectReport?: (reportRegion: string | null) => void;
};
export function MatchReportSelector({ onSelectReport }: MatchReportSelectorProps) {
    
    const [matchReports, setMatchReports] = useState<Report[]>([]);
    const [regionTree, setRegionTree] = useState<RegionTreeData>();
    const [reportUpdated, setReportUpdated] = useState<number>();
    const [matcherVersion, setMatcherVersion] = useState<number>();

    const reportRegion = useHashRoute(parseUrlReportRegion);

    useEffect(() => {
        fetch(`${DATA_BASE_URL}/match-report.json?t=${Date.now()}`)
            .then(r => r.json())
            .then(data => {
                setMatchReports(data.matchedRegions);
                setReportUpdated(data.matchRunTs);
                setMatcherVersion(data.matcherVersion);
                if (data.regionTreeAvailable) {
                    fetch(`${DATA_BASE_URL}/region-tree.json`)
                        .then(r => {
                            if (!r.ok) throw new Error(`Region tree unavailable: ${r.status}`);
                            return r.json();
                        })
                        .then(setRegionTree)
                        .catch(() => setRegionTree(undefined));
                }
            });
    }, []);

    const reports = matchReports.map((report) => {
        const {region, source, credit, license, liveUpdates, matchMeta} = report;

        const gtfsDate = matchMeta?.gtfsTimeStamp ? 
                new Date(matchMeta.gtfsTimeStamp) : 
                null;

        const matchStats = report?.matchStats;
        const matched = matchStats && (matchStats.total - matchStats.noMatch - matchStats.empty);
        const matchPercent = matchStats?.total ? (matched ?? 0) / matchStats.total * 100 : undefined;

        return {
            region,
            info: { 
                source,
                credit,
                license,
            },
            gtfsDate,
            matched,
            matchPercent,
            matchStats,
            liveUpdates
        }
    });

    const reportData = reportRegion && matchReports.find(r => r.region === reportRegion);

    if (reportData) {
        return (
            <div className={cls('report-datasets')}>
                <MatchReport
                    key={reportRegion}
                    reportRegion={reportRegion}
                    reportData={reportData}/>
            </div>
        );
    }

    return (
        <div className={"report-list-panel"}>
            <h2>Feeds by Organic Maps region</h2>
            <div className="report-list-meta">
                {reportUpdated && <span>Report updated {new Date(reportUpdated).toLocaleDateString()}</span>}
                {matcherVersion !== undefined && <span>Matcher version: {matcherVersion}</span>}
            </div>
            <div className={'reports'}>
                <RegionTree
                    tree={regionTree}
                    reports={reports}
                    onSelectReport={onSelectReport}
                />
            </div>
            <div className={"report-list-footer"}>
                To add your city or country, or for any other inquiries, please write us at
                <span> <a href="mailto:publictransport@organicmaps.app">
                    publictransport@organicmaps.app
                </a></span> or create an issue on
                <span> <a href="https://github.com/organicmaps/gtfs-osm-matcher/issues?q=label%3Anew-gtfs-source">
                    GitHub
                </a></span>
            </div>
        </div>
    )
}
