import { useEffect, useState } from "preact/hooks";
import { parseUrlReportRegion, useHashRoute } from "./routing";
import { MatchReport, type Report } from "./report";
import { RegionTree, type RegionTreeData, type FeedRegionsData } from "./region-tree";
import { cls } from "./cls";
import { DATA_BASE_URL } from "../config";
import "./report-selector.css";

type MatchReportSelectorProps = {
    onSelectReport?: (reportRegion: string | null) => void;
};
export function MatchReportSelector({ onSelectReport }: MatchReportSelectorProps) {
    
    const [matchReports, setMatchReports] = useState<Report[]>([]);
    const [regionTree, setRegionTree] = useState<RegionTreeData>();
    const [feedRegions, setFeedRegions] = useState<FeedRegionsData>();
    const [reportUpdated, setReportUpdated] = useState<number>();
    const [matcherVersion, setMatcherVersion] = useState<number>();

    const reportRegion = useHashRoute(parseUrlReportRegion);

    useEffect(() => {
        const regionData = Promise.all([
            fetch(`${DATA_BASE_URL}/region-tree.json`),
            fetch(`${DATA_BASE_URL}/feed-regions.json?t=${Date.now()}`),
        ]).then(async ([treeResponse, feedsResponse]) => {
            if (!treeResponse.ok || !feedsResponse.ok) throw new Error('Region data unavailable');
            return Promise.all([treeResponse.json(), feedsResponse.json()]);
        }).catch(() => null);
        fetch(`${DATA_BASE_URL}/match-report.json?t=${Date.now()}`)
            .then(r => r.json())
            .then(data => {
                setMatchReports(data.matchedRegions);
                setReportUpdated(data.matchRunTs);
                setMatcherVersion(data.matcherVersion);
                if (data.regionTreeFile === 'region-tree.json'
                        && data.feedRegionsFile === 'feed-regions.json') {
                    regionData.then(files => {
                        if (!files) return;
                        setRegionTree(files[0]);
                        setFeedRegions(files[1]);
                    });
                }
            });
    }, []);

    const reports = matchReports.map((report) => {
        const {region, source, credit, license, liveUpdates, gtfsTimeStamp} = report;

        const gtfsDate = gtfsTimeStamp ?
                new Date(gtfsTimeStamp) :
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
                    feedRegions={feedRegions}
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
