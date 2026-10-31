import { useMemo, useState } from "preact/hooks";

export type ReportRow = {
    region: string;
    info?: {
        source?: string;
        credit?: string;
        license?: string;
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
};

export type FeedRegionsData = {
    feeds?: { slug: string; home: string; coverageRegions?: string[] }[];
};

type Props = {
    tree?: RegionTreeData;
    feedRegions?: FeedRegionsData;
    reports: ReportRow[];
    onSelectReport?: (reportRegion: string | null) => void;
};

const UNASSIGNED = '__unassigned';
const NETWORKS = '__networks';
const dateFormatter = new Intl.DateTimeFormat(navigator.language,
    { year: 'numeric', month: 'short', day: 'numeric' });

export function RegionTree({ tree, feedRegions, reports, onSelectReport }: Props) {
    const [selected, setSelected] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [showEmpty, setShowEmpty] = useState(false);
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
        const placement = new Map((feedRegions?.feeds || []).map(feed => [feed.slug, feed.home]));
        return { nodes, children, label, placement };
    }, [tree, feedRegions]);

    const query = search.trim().toLocaleLowerCase();
    const matchingReports = reports.filter(report => !query || report.region.toLocaleLowerCase().includes(query));
    const directFeeds = new Map<string, ReportRow[]>();
    for (const report of matchingReports) {
        const home = model.placement.get(report.region);
        const id = home && model.nodes.has(home) ? home
            : home?.startsWith('network-') ? NETWORKS : UNASSIGNED;
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
    const visibleTreeChildren = (id: string | null) => childRegions(id)
        .filter(child => showEmpty || query || counts.get(child));
    const activeId = !tree ? UNASSIGNED
        : selected && (selected === UNASSIGNED || selected === NETWORKS || model.nodes.has(selected)) ? selected : null;
    const activeFeeds = query ? matchingReports : activeId ? directFeeds.get(activeId) || [] : [];
    const activeChildren = !query && activeId && activeFeeds.length ? childRegions(activeId)
        .filter(child => directFeeds.get(child)?.length) : [];
    const sortedFeeds = [...activeFeeds].sort((a, b) =>
        Number(!!b.liveUpdates) - Number(!!a.liveUpdates)
        || (b.matchStats?.total || 0) - (a.matchStats?.total || 0)
        || a.region.localeCompare(b.region));

    const toggle = (id: string) => {
        if (expanded.has(id)) {
            setSelected(id);
            setExpanded(previous => {
                const next = new Set(previous);
                next.delete(id);
                return next;
            });
            return;
        }

        let target = id;
        const path = [id];
        while (!directFeeds.get(target)?.length) {
            const populatedChildren = (model.children.get(target) || [])
                .filter(child => counts.get(child));
            if (populatedChildren.length !== 1) break;
            target = populatedChildren[0];
            path.push(target);
        }
        setSelected(target);
        setExpanded(previous => {
            const next = new Set(previous);
            for (const region of path) next.add(region);
            return next;
        });
    };
    const treeNode = (id: string) => {
        const children = visibleTreeChildren(id);
        const count = counts.get(id) || 0;
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

    return <div className={tree ? 'region-browser' : 'region-browser region-browser-flat'}>
        <div className="region-browser-tools">
            <input type="search" value={search} onInput={event => setSearch(event.currentTarget.value)}
                placeholder="Search feeds" aria-label="Search feeds" />
            <label className="region-browser-show-empty">
                <input type="checkbox" checked={showEmpty} onChange={event => setShowEmpty(event.currentTarget.checked)} />
                Show empty regions
            </label>
        </div>
        <div className="region-browser-body">
            {tree && <nav className="region-browser-tree" aria-label="Organic Maps regions">
                {visibleTreeChildren(null).map(treeNode)}
                {(directFeeds.get(NETWORKS)?.length || 0) > 0 &&
                    <button type="button" className={activeId === NETWORKS ? 'region-tree-choice selected' : 'region-tree-choice'}
                        onClick={() => setSelected(NETWORKS)}>
                        <span className="region-tree-name">Networks</span>
                        <span className="region-tree-count">{directFeeds.get(NETWORKS)!.length}</span>
                    </button>}
                {(directFeeds.get(UNASSIGNED)?.length || 0) > 0 &&
                    <button type="button" className={activeId === UNASSIGNED ? 'region-tree-choice selected' : 'region-tree-choice'}
                        onClick={() => setSelected(UNASSIGNED)}>
                        <span className="region-tree-name">Unassigned</span>
                        <span className="region-tree-count">{directFeeds.get(UNASSIGNED)!.length}</span>
                    </button>}
            </nav>}
            <section className="region-browser-detail" aria-live="polite">
                <div className="region-browser-detail-header">
                    <h3>{query ? 'Search results' : !tree ? 'Feeds' : activeId === UNASSIGNED ? 'Unassigned feeds' : activeId === NETWORKS ? 'Networks' : activeId ? model.label(activeId) : 'Feeds'}</h3>
                    <div className="region-browser-summary">
                        <span>{query || activeId ? activeFeeds.length : matchingReports.length} GTFS feeds{!query && activeId && activeId !== UNASSIGNED && (counts.get(activeId) || 0) > activeFeeds.length
                            ? ` directly · ${counts.get(activeId)} including subregions` : ''}</span>
                        {activeChildren.length > 0 && <span>{activeChildren.length} subregions with feeds</span>}
                    </div>
                </div>
                <div className="region-browser-detail-scroll">
                    {sortedFeeds.length > 0 && <div className="region-browser-feeds">
                        {sortedFeeds.map(report => <FeedCard key={report.region} report={report} onSelectReport={onSelectReport} />)}
                    </div>}
                    {activeChildren.length > 0 && <div className="region-browser-subregions">
                        {activeChildren.map(id => <button type="button" key={id} onClick={() => toggle(id)}>
                            <span>{model.label(id)}</span><span className="region-tree-count">{directFeeds.get(id)!.length} feeds</span>
                        </button>)}
                    </div>}
                    {query && !activeFeeds.length && <p>No matching feeds.</p>}
                    {!query && !activeId && <p>Select a region in the tree to see its feeds.</p>}
                    {!query && activeId && !activeFeeds.length && (counts.get(activeId) || 0) > 0 &&
                        <p>Select a subregion in the tree to see its feeds.</p>}
                    {!query && activeId && !activeFeeds.length && !counts.get(activeId) &&
                        <p>No feeds assigned to this region.</p>}
                </div>
            </section>
        </div>
    </div>;
}

function FeedCard({ report, onSelectReport }: { report: ReportRow; onSelectReport?: Props['onSelectReport'] }) {
    const { region, info, liveUpdates, gtfsDate, matchStats, matchPercent } = report;
    const daysSinceGtfs = gtfsDate ? Math.ceil((Date.now() - gtfsDate.getTime()) / 86400000) : null;
    const dateHighlight = daysSinceGtfs === null ? '' : daysSinceGtfs <= 14 ? 'hl-green' : daysSinceGtfs <= 45 ? 'hl-yellow' : 'hl-red';
    const matchHighlight = matchPercent === undefined ? '' : matchPercent >= 85 ? 'hl-green' : matchPercent >= 75 ? 'hl-yellow' : 'hl-red';
    return <article className="region-feed">
        <div className="region-feed-heading">
            <a onClick={() => onSelectReport?.(region)} href={`#/match-report/${region}`}>{region}</a>
            {matchStats && <span className="region-feed-stops">{matchStats.total.toLocaleString()} stops</span>}
            {liveUpdates && <span className="region-feed-live">Live updates</span>}
        </div>
        <div className="region-feed-meta">
            <span className={`region-feed-highlight ${dateHighlight}`}>
                GTFS {gtfsDate ? dateFormatter.format(gtfsDate) : 'date unavailable'}
                {daysSinceGtfs !== null && daysSinceGtfs > 0 && ` (${daysSinceGtfs} days)`}
            </span>
            <span className={`region-feed-highlight ${matchHighlight}`}>
                {matchPercent !== undefined ? `${matchPercent.toFixed(0)}% matched` : 'Match unavailable'}
            </span>
        </div>
        {(info?.source || info?.credit || info?.license) && <details className="region-feed-details">
            <summary>Details</summary>
            {info.source && <div>Source: <a href={info.source} target="_blank" rel="noopener noreferrer">{info.source}</a></div>}
            {info.credit && <div>Credit: {info.credit}</div>}
            {info.license && <div>License: {info.license}</div>}
        </details>}
    </article>;
}
