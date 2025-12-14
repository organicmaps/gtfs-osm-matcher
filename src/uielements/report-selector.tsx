import { useEffect, useState } from "preact/hooks";
import { parseUrlReportRegion, useHash } from "./routing";
import { MatchReport, type Report } from "./report";
import "./report-selector.css";
import { ReportHelpOverlay } from "./report-help-overlay";
import { ReportTable } from "./report-table";

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

export function MatchReportSelector() {
    const [showHelp, setShowHelp] = useState(false);
    const [matchReports, setMatchReports] = useState<Report[]>([]);
    const [updateReports, setUpdateReports] = useState<UpdateReportItem[]>([]);
    const reportRegion = parseUrlReportRegion(useHash());

    useEffect(() => {
        fetch('/data/match-report.json')
            .then(r => r.json())
            .then(data => { setMatchReports(data.matchedRegions); });

        fetch('/data/update-report.json')
            .then(r => r.json())
            .then(data => { setUpdateReports(data); });
    }, [setMatchReports, setUpdateReports]);

    const reports = matchReports.map((report) => {
        const updateReport = updateReports.find(u => u.name === report.region);
        const region = report.region;
        const gtfsDate = report.matchMeta?.gtfsTimeStamp ? new Date(report.matchMeta.gtfsTimeStamp) : null;

        const matchStats = updateReport?.matchStats;
        const matched = matchStats && (matchStats.matchId + matchStats.nameMatch + matchStats.manyToOne + matchStats.transitHubs);
        const matchPercent = matched && matched / matchStats.total * 100;

        return {
            region,
            gtfsDate,
            matched,
            matchPercent,
            matchStats,
        }
    });

    const reportData = reportRegion && matchReports.find(r => r.region === reportRegion);
    if (matchReports.length > 0 && !reportData) {
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
                {showHelp && <ReportHelpOverlay onClose={() => setShowHelp(false)} />}
            </>
        )
    }

    return (
        <div className={"overlay"}>
            <div className={'overlay-content'}>
                <h2>Available match reports</h2>
                <div className={'reports'}>
                    <ReportTable reports={reports} />
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
        </div>
    )
}
