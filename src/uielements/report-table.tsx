import { useState } from "preact/hooks";

const dateFormatter = new Intl.DateTimeFormat(navigator.language, { year: 'numeric', month: 'short', day: 'numeric' });
function formatDate(date: Date | null | undefined) {
    return date ? dateFormatter.format(date) : 'N/A';
}

export type ReportRow = {
    region: string;
    gtfsDate: Date | null;
    matched: number | undefined;
    matchPercent: number | undefined;
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

type ReportTableProps = {
    reports: ReportRow[];
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

export function ReportTable({ reports }: ReportTableProps) {
    const sortingColumns = ['region', 'gtfsDate', 'matchPercent', 'total', 'matched', 'empty', 'noMatch'] as const;
    const [sortColumn, setSortColumn] = useState<typeof sortingColumns[number]>('region');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
                    <SortableHeader column={'gtfsDate'} label={'GTFS Date'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'matchPercent'} label={'Match percent'}
                        currentSortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleHeaderClick} />
                    <SortableHeader column={'total'} label={'Total'}
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
                {sortedReports.map(report => {
                    const { region, gtfsDate, matched, matchPercent, matchStats } = report;

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
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}
