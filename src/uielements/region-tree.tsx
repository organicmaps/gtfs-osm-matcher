import { useMemo, useState } from "preact/hooks";

export type ReportRow = {
    region: string;
    info?: {
        source?: string;
        version?: string;
        matcherVersion: string;
        gtfsTimeStamp: number;
        generationTimeStamp: number;
    };
    gtfsDate: Date | null;
    matched: number | undefined;
    matchPercent: number | undefined;
    liveUpdates?: boolean;
    matchStats?: {
        total: number;
        matchId: number;
        noMatch: number;
        empty: number;
    };
};

export type RegionTreeData = {
    nodes: { id: string; parent?: string; leaf: boolean }[];
    feeds: { slug: string; home: string; coverageRegions?: string[] }[];
};

type Props = {
    tree?: RegionTreeData;
    reports: ReportRow[];
    onSelectReport?: (reportRegion: string | null) => void;
};

const UNASSIGNED = '__unassigned';
const dateFormatter = new Intl.DateTimeFormat(navigator.language,
    { year: 'numeric', month: 'short', day: 'numeric' });

export function RegionTree({ tree, reports, onSelectReport }: Props) {
    const [selected, setSelected] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const model = useMemo(() => {
        const nodes = new Map((tree?.nodes || []).map(node => [node.id, node]));
        const children = new Map<string, string[]>();
        for (const node of nodes.values()) {
            const parent = node.parent && nodes.has(node.parent) ? node.parent : '';
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent)!.push(node.id);
        }
        const label = (id: string) => {
            const parent = nodes.get(id)?.parent;
            return (parent && id.startsWith(parent + '_') ? id.slice(parent.length + 1) : id)
                .replaceAll('_', ' · ');
        };
        for (const ids of children.values()) ids.sort((a, b) => label(a).localeCompare(label(b)));
        const placement = new Map((tree?.feeds || []).map(feed => [feed.slug, feed.home]));
        return { nodes, children, label, placement };
    }, [tree]);

    const query = search.trim().toLocaleLowerCase();
    const matchingReports = reports.filter(report => !query || report.region.toLocaleLowerCase().includes(query));
    const directFeeds = new Map<string, ReportRow[]>();
    for (const report of matchingReports) {
        const home = model.placement.get(report.region);
        const id = home && model.nodes.has(home) ? home : UNASSIGNED;
        if (!directFeeds.has(id)) directFeeds.set(id, []);
        directFeeds.get(id)!.push(report);
    }

    const counts = new Map<string, number>();
    const countFeeds = (id: string): number => {
        const count = (directFeeds.get(id)?.length || 0)
            + (model.children.get(id) || []).reduce((total, child) => total + countFeeds(child), 0);
        counts.set(id, count);
        return count;
    };
    for (const root of model.children.get('') || []) countFeeds(root);

    const childRegions = (id: string | null) => (model.children.get(id || '') || [])
        .filter(child => !query || counts.get(child) || model.label(child).toLocaleLowerCase().includes(query));
    const activeId = selected && (selected === UNASSIGNED || model.nodes.has(selected)) ? selected : null;
    const activeChildren = activeId === UNASSIGNED ? [] : childRegions(activeId);
    const activeFeeds = activeId ? directFeeds.get(activeId) || [] : [];
    const sortedFeeds = [...activeFeeds].sort((a, b) =>
        Number(!!b.liveUpdates) - Number(!!a.liveUpdates)
        || (b.matchStats?.total || 0) - (a.matchStats?.total || 0)
        || a.region.localeCompare(b.region));

    const toggle = (id: string) => {
        setSelected(id);
        setExpanded(previous => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const treeNode = (id: string) => {
        const children = childRegions(id);
        const count = counts.get(id) || 0;
        if (query && !count && !model.label(id).toLocaleLowerCase().includes(query)) return null;
        return <div className="region-tree-node" key={id}>
            <button type="button" className={activeId === id ? 'region-tree-choice selected' : 'region-tree-choice'}
                aria-expanded={children.length ? expanded.has(id) : undefined}
                onClick={() => toggle(id)}>
                <span className="region-tree-name"><span className="region-tree-chevron">{children.length ? (expanded.has(id) ? '▾' : '▸') : ''}</span>{model.label(id)}</span>
                <span className="region-tree-count">{count}</span>
            </button>
            {(expanded.has(id) || query) && children.length > 0 &&
                <div className="region-tree-children">{children.map(treeNode)}</div>}
        </div>;
    };

    return <div className="region-browser">
        <div className="region-browser-tools">
            <input type="search" value={search} onInput={event => setSearch(event.currentTarget.value)}
                placeholder="Search feeds" aria-label="Search feeds" />
        </div>
        <div className="region-browser-body">
            <nav className="region-browser-tree" aria-label="Organic Maps regions">
                {(model.children.get('') || []).map(treeNode)}
                {(directFeeds.get(UNASSIGNED)?.length || 0) > 0 &&
                    <button type="button" className={activeId === UNASSIGNED ? 'region-tree-choice selected' : 'region-tree-choice'}
                        onClick={() => setSelected(UNASSIGNED)}>
                        <span className="region-tree-name">Unassigned</span>
                        <span className="region-tree-count">{directFeeds.get(UNASSIGNED)!.length}</span>
                    </button>}
            </nav>
            <section className="region-browser-detail" aria-live="polite">
                <h3>{activeId === UNASSIGNED ? 'Unassigned feeds' : activeId ? model.label(activeId) : 'Regions'}</h3>
                <div className="region-browser-summary">
                    <span>{activeChildren.length} subregions</span>
                    <span>{activeId ? activeFeeds.length : matchingReports.length} GTFS feeds{activeId && activeId !== UNASSIGNED && (counts.get(activeId) || 0) > activeFeeds.length
                        ? ` directly · ${counts.get(activeId)} including subregions` : ''}</span>
                </div>
                {activeChildren.length > 0 && <div className="region-browser-subregions">
                    {activeChildren.map(id => <button type="button" key={id} onClick={() => toggle(id)}>
                        <span>{model.label(id)}</span><span className="region-tree-count">{counts.get(id) || 0} feeds</span>
                    </button>)}
                </div>}
                {sortedFeeds.length > 0 && <div className="region-browser-feeds">
                    {sortedFeeds.map(report => <FeedCard key={report.region} report={report} onSelectReport={onSelectReport} />)}
                </div>}
                {activeId && !activeChildren.length && !activeFeeds.length && <p>No feeds in this region.</p>}
            </section>
        </div>
    </div>;
}

function FeedCard({ report, onSelectReport }: { report: ReportRow; onSelectReport?: Props['onSelectReport'] }) {
    const { region, info, liveUpdates, gtfsDate, matchStats, matched, matchPercent } = report;
    const reportDate = info?.generationTimeStamp ? new Date(info.generationTimeStamp) : null;
    return <article className="region-feed">
        <div className="region-feed-heading">
            <a onClick={() => onSelectReport?.(region)} href={`#/match-report/${region}`}>{region}</a>
            {liveUpdates && <span className="region-feed-live">Live updates</span>}
        </div>
        <div className="region-feed-meta">
            <span>{(matchStats?.total || 0).toLocaleString()} stops</span>
            <span>GTFS {gtfsDate ? dateFormatter.format(gtfsDate) : 'date unavailable'}</span>
            {reportDate && <span>Report updated {dateFormatter.format(reportDate)}</span>}
            <span>{matchPercent !== undefined ? `${matchPercent.toFixed(0)}% matched (${matched} of ${matchStats?.total})` : 'Match unavailable'}</span>
            {matchStats && <span>{matchStats.empty} empty · {matchStats.noMatch} unmatched</span>}
        </div>
        {(info?.source || info?.version || info?.matcherVersion) && <details className="region-feed-details">
            <summary>Details</summary>
            {info.source && <div>Source: <a href={info.source} target="_blank" rel="noopener noreferrer">{info.source}</a></div>}
            {info.version && <div>Report version: {info.version}</div>}
            {info.matcherVersion && <div>Matcher version: {info.matcherVersion}</div>}
        </details>}
    </article>;
}
