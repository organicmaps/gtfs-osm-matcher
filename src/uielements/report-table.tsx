import { useState } from "preact/hooks";

const dateFormatter = new Intl.DateTimeFormat(navigator.language, { year: 'numeric', month: 'short', day: 'numeric' });

function formatDate(date: Date | null | undefined) {
    return date ? dateFormatter.format(date) : 'N/A';
}

function daysSince(date: Date) {
    const diff = Date.now() - date.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export type ReportRow = {
    region: string;
    gtfsDate: Date | null;
    matched: number | undefined;
    matchPercent: number | undefined;
    liveUpdates?: boolean;
    matchStats: {
        total: number;
        matchId: number;
        nameMatch: number;
        manyToOne: number;
        transitHubs: number;
        noMatch: number;
        empty: number;
    } | undefined;
}

type SortableHeaderProps<T> = {
    column: T;
    currentSortColumn: T;
    sortDirection: 'asc' | 'desc';
    onSort: (column: T) => void;
    label: string;
}

function SortableHeader<T extends string>({ column, currentSortColumn, sortDirection, onSort, label }: SortableHeaderProps<T>) {
    return (
        <th onClick={() => onSort(column)}>
            <span>{label}</span>{currentSortColumn === column && <span>{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>}
        </th>
    )
}

type ReportTableProps = {
    reports: ReportRow[];
    onSelectReport?: (reportRegion: string | null) => void;
    foldByName?: string[];
}
export function ReportTable({ reports, onSelectReport, foldByName = [] }: ReportTableProps) {
    const sortingColumns = ['region', 'gtfsDate', 'matchPercent', 'liveUpdates', 'total', 'matched', 'empty', 'noMatch'] as const;
    const [sortColumn, setSortColumn] = useState<typeof sortingColumns[number]>('region');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [unfoldedPrefix, setUnfoldedPrefix] = useState<string | null>(null);

    const handleHeaderClick = (column: typeof sortingColumns[number]) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            // Default sort direction: ASC for text (region), DESC for numbers/dates
            if (column === 'region') {
                setSortDirection('asc');
            } else {
                setSortDirection('desc');
            }
        }
    };

    const sortedReports = [...reports].sort((a, b) => {
        let result = 0;
        switch (sortColumn) {
            case 'region':
                result = a.region.localeCompare(b.region);
                break;
            case 'liveUpdates':
                result = (a.liveUpdates ? 1 : 0) - (b.liveUpdates ? 1 : 0);
                break;
            case 'gtfsDate':
                result = (a.gtfsDate?.getTime() || 0) - (b.gtfsDate?.getTime() || 0);
                break;
            case 'matchPercent':
                result = (a.matchPercent || 0) - (b.matchPercent || 0);
                break;
            case 'total':
                result = (a.matchStats?.total || 0) - (b.matchStats?.total || 0);
                break;
            case 'matched':
                result = (a.matched || 0) - (b.matched || 0);
                break;
            case 'empty':
                result = (a.matchStats?.empty || 0) - (b.matchStats?.empty || 0);
                break;
            case 'noMatch':
                result = (a.matchStats?.noMatch || 0) - (b.matchStats?.noMatch || 0);
                break;
        }
        return sortDirection === 'asc' ? result : -result;
    });

    return (
        <table className="report-table">
            <thead>
                <tr>
                    <SortableHeader column={'region'} label={'Region'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'liveUpdates'} label={'Live Updates'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'gtfsDate'} label={'GTFS Date'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'matched'} label={'Matched'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'empty'} label={'Empty'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'noMatch'} label={'No Match'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                </tr>
            </thead>
            <tbody>
                {(() => {
                    const rows: any[] = [];
                    const groups: Record<string, ReportRow[]> = {};
                    const normalReports: ReportRow[] = [];

                    sortedReports.forEach(report => {
                        const prefix = foldByName.find(p => report.region.startsWith(p));
                        if (prefix) {
                            if (!groups[prefix]) groups[prefix] = [];
                            groups[prefix].push(report);
                        } else {
                            normalReports.push(report);
                        }
                    });

                    // Add normal reports and prefix groups to rows in the order they appear.
                    
                    const processedPrefixes = new Set<string>();
                    
                    sortedReports.forEach(report => {
                        const prefix = foldByName.find(p => report.region.startsWith(p));
                        if (!prefix) {
                            rows.push(renderReportRow(report, onSelectReport));
                        } else if (!processedPrefixes.has(prefix)) {
                            processedPrefixes.add(prefix);
                            const group = groups[prefix];
                            const isUnfolded = unfoldedPrefix === prefix;
                            
                            rows.push(
                                <tr key={prefix} className="fold-header" onClick={() => setUnfoldedPrefix(isUnfolded ? null : prefix)}>
                                    <td colSpan={6} style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                                        {prefix} <span className="feed-count">{group.length} feeds</span> {isUnfolded ? '▼' : '▶'}
                                    </td>
                                </tr>
                            );
                            
                            if (isUnfolded) {
                                group.forEach(groupedReport => {
                                    rows.push(renderReportRow(groupedReport, onSelectReport, "grouped-row"));
                                });
                            }
                        }
                    });

                    return rows;
                })()}
            </tbody>
        </table>
    );
}

type ReportSelectCb = ((reportRegion: string | null) => void) | undefined;
function renderReportRow(report: ReportRow, onSelectReport: ReportSelectCb, className = "") {
    const { region, gtfsDate, matched, matchPercent, matchStats, liveUpdates } = report;

    let matchClass = '';
    if (matchPercent) {
        if (matchPercent >= 85) {
            matchClass = 'hl-green';
        } else if (matchPercent >= 75) {
            matchClass = 'hl-yellow';
        } else {
            matchClass = 'hl-red';
        }
    }

    const days = gtfsDate && daysSince(gtfsDate);
    let daysSinceClass = "";
    if (days) {
        if (days <= 14) {
            daysSinceClass = 'hl-green';
        } else if (days <= 45) {
            daysSinceClass = 'hl-yellow';
        } else {
            matchClass = 'hl-red';
        }
    }

    return (
        <tr key={region} className={className}>
            <td><a onClick={() => onSelectReport?.(region)} href={`#/match-report/${region}`}>{region}</a></td>
            <td>
                {liveUpdates ? 'Yes' : 'No'}
            </td>
            <td className={daysSinceClass}>
                {formatDate(gtfsDate)} {days && days > 0 && <span>({days} days)</span>}
            </td>
            <td className={matchClass}>
                {matchPercent ? `${matchPercent.toFixed(0)}% (${matched} of ${matchStats?.total})` : '-'}
            </td>
            <td>{matchStats?.empty || '-'}</td>
            <td>{matchStats?.noMatch || '-'}</td>
        </tr>
    );
}
