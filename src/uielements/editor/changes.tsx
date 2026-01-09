import { useCallback } from "preact/hooks";

import OSMData, { type OSMDataChange } from "../../services/OSMData";
import "./changes.css";

type ChangesProps = {
    osmData?: OSMData
};
export function Changes({ osmData }: ChangesProps) {
    const downloadHandler = useCallback(() => {
        const changes = osmData?.listChanges();
        if (changes) {
            const data = encodeChanges(changes);

            const blob = new Blob([data], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);

            download(url, 'gtfs-changes.osm');

            URL.revokeObjectURL(url);
        }
    }, [osmData]);

    const changes = osmData?.listChanges().map(ch =>
        <div className={'osm-change'}>
            <span className={'change-element-type'}>{ch.element.type}</span>
            <span className={'change-element-id'}>{ch.element.id + (ch.element.id < 0 ? ' (new)' : '')}</span>
            <span className={'change-action'}>{asArray(ch.action).join(', ')}</span>
        </div>
    )

    return <>
        <h4>Changes</h4>
        <div className={'osm-changes-list'}>
            {changes}
        </div>
        <button onClick={downloadHandler}>Download as OSM file</button>
    </>
}

function encodeChanges(changes: OSMDataChange[]) {
    const xmlNodes = changes.map(({ element }) => {
        const tagElements = Object.entries(element.tags || {})
            .map(([k, v]) => ({ tag: { _attr: { k, v } } }));

        const { type, tags, ...attr } = element;

        // @ts-ignore
        attr['action'] = 'modify';
        // @ts-ignore
        attr['version'] = '1';

        return {
            [element.type]: [{ _attr: attr }, ...tagElements]
        }
    });

    return xml({ osm: [{ _attr: { version: "0.6", generator: "osm-gtfs" } }, ...xmlNodes] }, { declaration: true });
}

function xml(root: any, options?: { declaration?: boolean }) {
    let output = '';
    if (options?.declaration) {
        output += '<?xml version="1.0" encoding="UTF-8"?>\n';
    }

    function escape(str: string) {
        return String(str).replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
            return c;
        });
    }

    function renderAttributes(attributes: any) {
        if (!attributes) return '';
        return Object.entries(attributes)
            .map(([k, v]) => ` ${k}="${escape(String(v))}"`)
            .join('');
    }

    function render(obj: any): string {
        if (Array.isArray(obj)) {
            return obj.map(render).join('');
        }
        if (typeof obj !== 'object' || obj === null) {
            return escape(String(obj));
        }

        return Object.entries(obj).map(([key, value]) => {
            let attrs = '';
            let children: any[] = [];

            if (Array.isArray(value)) {
                let list = value;
                // Check for _attr in the first element
                if (list.length > 0 && list[0] && typeof list[0] === 'object' && (list[0] as any)._attr) {
                    attrs = renderAttributes((list[0] as any)._attr);
                    list = list.slice(1);
                }
                children = list;
            } else if (typeof value === 'object' && value !== null) {
                if ((value as any)._attr) {
                    attrs = renderAttributes((value as any)._attr);
                    // Use remaining properties as children
                    const { _attr, ...rest } = value as any;
                    if (Object.keys(rest).length > 0) {
                        children = [rest];
                    }
                } else {
                    children = [value];
                }
            } else {
                children = [value];
            }

            const content = children.map((c) => {
                if (typeof c === 'object' && c !== null) {
                    return render(c);
                }
                return escape(String(c));
            }).join('');

            return `<${key}${attrs}>${content}</${key}>`;
        }).join('');
    }

    output += render(root);
    return output;
}

function asArray(arg: any) {
    return Array.isArray(arg) ? arg : [arg];
}

function download(path: string, filename: string) {
    const anchor = document.createElement('a');
    anchor.href = path;
    anchor.download = filename;

    document.body.appendChild(anchor);

    anchor.click();

    document.body.removeChild(anchor);
}
