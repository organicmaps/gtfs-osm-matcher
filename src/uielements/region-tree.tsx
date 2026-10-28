import { useMemo, useState } from "preact/hooks";
import { ReportTable, type ReportRow } from "./report-table";

export type RegionTreeData = {
    nodes: { id: string; parent?: string; leaf: boolean }[];
    feeds: { slug: string; home: string; coverageRegions?: string[] }[];
};

type Props = {
    tree?: RegionTreeData;
    reports: ReportRow[];
    onSelectReport?: (reportRegion: string | null) => void;
};

export function RegionTree({ tree, reports, onSelectReport }: Props) {
    const [mode, setMode] = useState<'home' | 'coverage'>('home');
    const [selected, setSelected] = useState('all');
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const model = useMemo(() => {
        const nodes = new Map((tree?.nodes || []).map(n => [n.id, n]));
        const children = new Map<string, string[]>();
        for (const node of nodes.values()) {
            const parent = node.parent || '';
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent)!.push(node.id);
        }
        const label = (id: string) => {
            const parent = nodes.get(id)?.parent;
            return (parent && id.startsWith(parent + '_') ? id.slice(parent.length + 1) : id)
                .replaceAll('_', ' · ');
        };
        for (const ids of children.values()) ids.sort((a, b) => label(a).localeCompare(label(b)));
        const chain = (id: string) => {
            const result: string[] = [];
            const seen = new Set<string>();
            while (nodes.has(id) && !seen.has(id)) {
                result.unshift(id);
                seen.add(id);
                id = nodes.get(id)!.parent || '';
            }
            return result;
        };
        const placement = new Map((tree?.feeds || []).map(f => [f.slug, f]));
        return { nodes, children, label, chain, placement };
    }, [tree]);

    const q = search.trim().toLocaleLowerCase();
    const filtered = reports.filter(report => {
        if (!q) return true;
        const feed = model.placement.get(report.region);
        const ids = [
            ...model.chain(feed?.home || ''),
            ...(feed?.coverageRegions || []).flatMap(id => model.chain(id)),
        ];
        return [report.region, feed?.home || '', ...(feed?.coverageRegions || []),
            ...ids, ...ids.map(model.label)]
            .some(value => value.toLocaleLowerCase().includes(q));
    });

    const counts = new Map<string, Set<string>>();
    let networks = 0;
    let unassigned = 0;
    for (const report of filtered) {
        const feed = model.placement.get(report.region);
        if (!feed) { unassigned++; continue; }
        if (!model.nodes.has(feed.home)) networks++;
        const ids = mode === 'home' ? [feed.home] : (feed.coverageRegions || []);
        for (const id of ids) for (const ancestor of model.chain(id)) {
            if (!counts.has(ancestor)) counts.set(ancestor, new Set());
            counts.get(ancestor)!.add(report.region);
        }
    }

    const visible = filtered.filter(report => {
        if (selected === 'all') return true;
        const feed = model.placement.get(report.region);
        if (selected === '__unassigned') return !feed;
        if (selected === '__networks') return !!feed && !model.nodes.has(feed.home);
        if (!feed) return false;
        const ids = mode === 'home' ? [feed.home] : (feed.coverageRegions || []);
        return ids.some(id => model.chain(id).includes(selected));
    });

    const toggle = (id: string) => {
        setExpanded(previous => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const treeNode = (id: string) => {
        const count = counts.get(id)?.size || 0;
        if (!count) return null;
        const childIds = (model.children.get(id) || []).filter(child => counts.has(child));
        return <div className="region-tree-node" key={id}>
            <div className="region-tree-line">
                {childIds.length > 0
                    ? <button type="button" className="region-tree-toggle" aria-label={`${expanded.has(id) ? 'Collapse' : 'Expand'} ${model.label(id)}`} aria-expanded={expanded.has(id)} onClick={() => toggle(id)}>{expanded.has(id) ? '▾' : '▸'}</button>
                    : <span className="region-tree-spacer" />}
                <button type="button" className={selected === id ? 'region-tree-choice selected' : 'region-tree-choice'} onClick={() => setSelected(id)}>
                    <span>{model.label(id)}</span><span className="region-tree-count">{count}</span>
                </button>
            </div>
            {expanded.has(id) && childIds.length > 0 && <div className="region-tree-children">{childIds.map(treeNode)}</div>}
        </div>;
    };

    const title = selected === 'all' ? 'All feeds' : selected === '__networks' ? 'Networks'
        : selected === '__unassigned' ? 'No published region' : model.label(selected);

    return <div className="region-browser">
        <div className="region-browser-tools">
            <input type="search" value={search} onInput={event => setSearch(event.currentTarget.value)} placeholder="Search feeds or regions" aria-label="Search feeds or regions" />
            {tree && <div className="region-browser-mode" aria-label="Region relationship">
                <button type="button" className={mode === 'home' ? 'active' : ''} onClick={() => setMode('home')}>Assigned homes</button>
                <button type="button" className={mode === 'coverage' ? 'active' : ''} onClick={() => setMode('coverage')}>Served coverage</button>
            </div>}
        </div>
        <div className="region-browser-body">
            {tree && <nav className="region-browser-tree" aria-label="Organic Maps regions">
                <button type="button" className={selected === 'all' ? 'region-tree-choice selected' : 'region-tree-choice'} onClick={() => setSelected('all')}><span>All feeds</span><span className="region-tree-count">{filtered.length}</span></button>
                <button type="button" className={selected === '__networks' ? 'region-tree-choice selected' : 'region-tree-choice'} onClick={() => setSelected('__networks')}><span>Networks</span><span className="region-tree-count">{networks}</span></button>
                <button type="button" className={selected === '__unassigned' ? 'region-tree-choice selected' : 'region-tree-choice'} onClick={() => setSelected('__unassigned')}><span>No published region</span><span className="region-tree-count">{unassigned}</span></button>
                <div className="region-tree-roots">{(model.children.get('') || []).map(treeNode)}</div>
            </nav>}
            <div className="region-browser-reports">
                <h3>{title} <span className="region-tree-count">{visible.length}</span></h3>
                {visible.length ? <ReportTable reports={visible} onSelectReport={onSelectReport} /> : <p>No feeds in this view.</p>}
            </div>
        </div>
    </div>;
}
