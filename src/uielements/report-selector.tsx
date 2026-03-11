import { useEffect, useState } from "preact/hooks";
import { parseUrlReportRegion, useHashRoute } from "./routing";
import { MatchReport, type Report } from "./report";
import { ReportTable } from "./report-table";
import { RegionMarkersLayer } from "./region-markers";
import { cls } from "./cls";
import { DATA_BASE_URL } from "../config";
import "./report-selector.css";

type MatchReportSelectorProps = {
    onSelectReport?: (reportRegion: string | null) => void;
};
export function MatchReportSelector({ onSelectReport }: MatchReportSelectorProps) {
    
    const [matchReports, setMatchReports] = useState<Report[]>([]);
    const [foldByName, setFoldByName] = useState<string[]>([]);
    const [minimized, setMinimized] = useState(false);

    const reportRegion = useHashRoute(parseUrlReportRegion);

    useEffect(() => {
        fetch(`${DATA_BASE_URL}/match-report.json`)
            .then(r => r.json())
            .then(data => {
                setMatchReports(data.matchedRegions);
                setFoldByName(data.foldByName || []);
            });
    }, [setMatchReports, setFoldByName]);

    const reports = matchReports.map((report) => {
        const {region, source, liveUpdates} = report;
        
        const gtfsDate = report.matchMeta?.gtfsTimeStamp ? 
                new Date(report.matchMeta.gtfsTimeStamp) : 
                null;

        const matchStats = report?.matchStats;
        const matched = matchStats && (matchStats.total - matchStats.noMatch - matchStats.empty);
        const matchPercent = matched && matched / matchStats.total * 100;

        return {
            region,
            source,
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
                <div className={'report-nav'}>
                    <a className={'no-decoration'} 
                        onClick={() => onSelectReport?.(null)} href="#/">← Back to reports</a>
                    <span>&nbsp;|&nbsp;</span>
                    <span className={'minimize-toggle'}
                        title={minimized ? 'maximize' : 'minimize'}
                        onClick={() => setMinimized(!minimized)}
                    >
                        {minimized ? <span>Restore</span> : <span>Minimize</span>}
                    </span>
                </div>
                {
                    !minimized && 
                    <MatchReport
                        key={reportRegion}
                        reportRegion={reportRegion}
                        reportData={reportData}/>
                }
            </div>
        );
    }

    return (
        <div className={"report-list-panel"}>
            <RegionMarkersLayer reports={matchReports} onSelectReport={onSelectReport} />
            <h2>Available match reports</h2>
            <div className={'reports'}>
                <ReportTable
                    reports={reports}
                    onSelectReport={onSelectReport}
                    foldByName={foldByName}
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
