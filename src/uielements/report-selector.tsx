import { useEffect, useState } from "preact/hooks";
import { parseUrlReportRegion, useHash } from "./routing";
import { MatchReport, type Report } from "./report";
import "./report-selector.css";
import { ReportHelpOverlay } from "./report-help-overlay";

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
    const [matchReports, setMatchReports] = useState<Report[]>([]);
    const [updateReports, setUpdateReports] = useState<UpdateReportItem[]>([]);
    const reportRegion = parseUrlReportRegion(useHash());

    const sortingColumns = ['region', 'gtfsDate', 'matchPercent', 'total', 'matched', 'empty', 'noMatch'] as const;
    const [sortColumn, setSortColumn] = useState<typeof sortingColumns[number]>('region');

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
            updateReport,
        }
    });

    reports.sort((a, b) => {
        // TODO:Use generic comparator
        switch (sortColumn) {
            case 'region':
                return a.region.localeCompare(b.region);
            case 'gtfsDate':
                return (b.gtfsDate?.getTime() || 0) - (a.gtfsDate?.getTime() || 0);
            case 'matchPercent':
                return (b.matchPercent || 0) - (a.matchPercent || 0);
            case 'total':
                return (b.matchStats?.total || 0) - (a.matchStats?.total || 0);
            case 'matched':
                return (b.matched || 0) - (a.matched || 0);
            case 'empty':
                return (b.matchStats?.empty || 0) - (a.matchStats?.empty || 0);
            case 'noMatch':
                return (b.matchStats?.noMatch || 0) - (a.matchStats?.noMatch || 0);
        }
    });

    const reportRows = reports.map(report => {

        const { region, gtfsDate, matched, matchPercent, matchStats, updateReport } = report;

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
            <tr key={region}>
                <td><a href={`#/match-report/${region}`}>{region}</a></td>
                <td>{formatDate(gtfsDate)}</td>
                <td className={matchClass}>
                    {matchPercent ? `${matchPercent.toFixed(0)}% (${matched} of ${matchStats?.total})` : '-'}
                </td>
                <td>{matchStats?.total || '-'}</td>
                <td>{matched || '-'}</td>
                <td>{matchStats?.empty || '-'}</td>
                <td>{matchStats?.noMatch || '-'}</td>
                <td>{updateReport?.gtfsUpdate || '-'}</td>
                <td>{updateReport?.gtfsParse || '-'}</td>
            </tr>
        );
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
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th onClick={() => setSortColumn('region')}>Region</th>
                                <th onClick={() => setSortColumn('gtfsDate')}>GTFS Date</th>
                                <th onClick={() => setSortColumn('matchPercent')}>Match percent</th>
                                <th onClick={() => setSortColumn('total')}>Total</th>
                                <th onClick={() => setSortColumn('matched')}>Matched</th>
                                <th onClick={() => setSortColumn('empty')}>Empty</th>
                                <th onClick={() => setSortColumn('noMatch')}>No Match</th>
                                <th>GTFS Update</th>
                                <th>GTFS Parse</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportRows}
                        </tbody>
                    </table>
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
