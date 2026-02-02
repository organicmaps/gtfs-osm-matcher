
import type { OSMElementTags } from '../../services/OSMData.types';
import { cls } from '../cls';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

import "./osm-tags.css";

type TagEntry = {
    id: string;
    k: string;
    v: string;
    deleted?: boolean;
    tmp?: boolean;
};

export type TagEditorProps = {
    tags: OSMElementTags;
    tagsOriginal?: OSMElementTags;
    onChange?: (newTags: OSMElementTags) => void;
    protectedKeys?: string[];
    importantTagKeysRegex?: RegExp;
    importantTagValuesRegex?: RegExp;
    children?: ComponentChildren
};

export function TagEditor({ tags, tagsOriginal, onChange, children, protectedKeys, importantTagKeysRegex, importantTagValuesRegex }: TagEditorProps) {

    // Initial state setup
    // We need to handle the case where props.tags change externally (reset)
    // But since optimization uses key=hash(tags), the component remounts on change.
    // So initialization run only once per instance.
    const [entries, setEntries] = useState<TagEntry[]>(() => {
        const initialEntries: TagEntry[] = [];
        let counter = 0;

        if (tagsOriginal) {
            Object.entries(tagsOriginal).forEach(([k, v]) => {
                const currentVal = tags[k] !== undefined ? tags[k] : v;
                initialEntries.push({ id: `item_${counter++}`, k, v: currentVal, deleted: tags[k] === undefined, tmp: false });
            });
        }

        Object.entries(tags).forEach(([k, v]) => {
            if (tagsOriginal?.[k] === undefined) {
                initialEntries.push({ id: `item_${counter++}`, k, v, tmp: false });
            }
        });

        return initialEntries;
    });

    const nextIdRef = useRef(entries.length + Object.keys(tagsOriginal || {}).length + 1);

    const updateEntries = useCallback((newEntries: TagEntry[]) => {

        setEntries(newEntries);

        const activeEntries = newEntries.filter(e => !e.tmp && !e.deleted);

        if (activeEntries.some(e => !e.k || !e.v)) {
            return;
        }

        const keys = activeEntries.map(e => e.k);
        const uniqueKeys = new Set(keys);
        const hasDuplicates = uniqueKeys.size !== keys.length;

        if (hasDuplicates) {
            return;
        }

        const newTags = Object.fromEntries(activeEntries.map(e => [e.k, e.v]));
        onChange?.(newTags);

    }, [setEntries, onChange]);

    const handleKeyEdit = (id: string, evnt: Event) => {
        const newKey = (evnt.target as HTMLInputElement).value;
        updateEntries(entries.map(e => e.id === id ? { ...e, k: newKey, tmp: false } : e));
    };

    const handleValueEdit = (id: string, evnt: Event) => {
        const newValue = (evnt.target as HTMLInputElement).value;
        updateEntries(entries.map(e => e.id === id ? { ...e, v: newValue, tmp: false } : e));
    };

    const handleAddTag = () => {
        updateEntries([...entries, {
            id: `new_${nextIdRef.current++}`,
            k: 'key',
            v: 'value',
            tmp: true
        }]);
    };

    const handleDelete = (id: string) => {
        const entry = entries.find(e => e.id === id);
        if (entry?.tmp) {
            updateEntries(entries.filter(e => e.id !== id));
            return;
        }

        updateEntries(entries.map(e => e.id === id ? { ...e, deleted: true } : e));
    };

    const handleRestore = (id: string, originalKey: string) => {
        updateEntries(entries.map(e => {
            if (e.id === id) {
                if (e.deleted) {
                    return { ...e, deleted: false, v: tagsOriginal?.[originalKey] || tags[originalKey] };
                }
                return { ...e, v: tagsOriginal?.[e.k] || tags[e.k] };
            }
            return e;
        }));
    };

    const rows = entries.map((entry) => {
        const { id, k, v, tmp, deleted } = entry;
        const readonly = protectedKeys?.includes(k);
        const isInvalid = !k || !v;
        const important = importantTagKeysRegex?.test(k) || importantTagValuesRegex?.test(v);

        const isDeleted = deleted;
        const originalValue = tagsOriginal?.[k];
        const isModified = !isDeleted && originalValue !== undefined && originalValue !== v;

        if (isDeleted) {
            return (
                <tr key={id}>
                    <td className={'tag-actions'}>
                        <span className={'osm-tag-restore'} onClick={() => handleRestore(id, k)}>
                            &#x27F3;
                        </span>
                    </td>
                    <td className={cls('osm-tag-key', 'deleted')}>
                        <input value={k} readOnly={true} />
                    </td>
                    <td className={cls('osm-tag-value', 'deleted')}>
                        <input value={v} readOnly={true} />
                    </td>
                </tr>
            );
        }

        return (
            <tr key={id}>
                <td className={'tag-actions'}>
                    {!readonly && <span
                        onClick={() => handleDelete(id)}
                        className={'osm-tag-delete'}
                    >
                        &#x2718;
                    </span>}
                    {isModified &&
                        <span className={'osm-tag-restore'} onClick={() => handleRestore(id, k)}>
                            &#x27F3;
                        </span>}
                </td>

                <td className={cls('osm-tag-key', important && 'important', isInvalid && 'invalid', readonly && 'protected')}>
                    <input
                        value={tmp ? '' : k}
                        placeholder={tmp ? 'key' : ''}
                        readOnly={readonly}
                        onInput={(e) => handleKeyEdit(id, e)} />
                </td>

                <td className={cls('osm-tag-value', important && 'important', isInvalid && 'invalid', readonly && 'protected')}>
                    <input
                        value={tmp ? '' : v}
                        placeholder={tmp ? 'value' : ''}
                        readOnly={readonly}
                        onInput={(e) => handleValueEdit(id, e)} />
                </td>
            </tr>
        );
    });

    return (<>{
        tags && <table className={'osm-tags-table'}>
            <tbody>
                {rows}
                <tr key={'tag-actions'}>
                    <td className={'tag-actions'}>
                        <span onClick={handleAddTag}>&#x271A;</span>
                    </td>
                    <td></td>
                    <td></td>
                </tr>
            </tbody>
        </table>}
        {children}
    </>);

}
