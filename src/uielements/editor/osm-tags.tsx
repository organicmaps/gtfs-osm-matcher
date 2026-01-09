
import type { OSMElementTags } from '../../services/OSMData.types';
import { cls } from '../cls';
import { useCallback, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

import "./osm-tags.css";

type TagEntry = {
    id: string;
    k: string;
    v: string;
    isDeleted?: boolean;
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

        // Add all current tags
        Object.entries(tags).forEach(([k, v]) => {
            initialEntries.push({ id: `item_${counter++}`, k, v, isDeleted: false });
        });

        // Add deleted tags (present in original but not in current)
        Object.keys(tagsOriginal || {}).forEach(k => {
            if (!(k in tags)) {
                initialEntries.push({ id: `item_${counter++}`, k, v: tagsOriginal![k], isDeleted: true });
            }
        });

        return initialEntries;
    });

    const nextIdRef = useRef(entries.length + Object.keys(tagsOriginal || {}).length + 1);

    const updateEntries = useCallback((newEntries: TagEntry[]) => {

        setEntries(newEntries);

        const activeEntries = newEntries.filter(e => !e.isDeleted);

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

    const updateEntriesDebounce = useDebounce<TagEntry[]>(updateEntries, 1000);

    const handleKeyEdit = (id: string, evnt: Event) => {
        const newKey = (evnt.target as HTMLInputElement).value;
        updateEntriesDebounce(entries.map(e => e.id === id ? { ...e, k: newKey } : e));
    };

    const handleValueEdit = (id: string, evnt: Event) => {
        const newValue = (evnt.target as HTMLInputElement).value;
        updateEntriesDebounce(entries.map(e => e.id === id ? { ...e, v: newValue } : e));
    };

    const handleAddTag = () => {
        updateEntries([...entries, {
            id: `new_${nextIdRef.current++}`,
            k: 'key',
            v: 'value',
            isDeleted: false
        }]);
    };

    const handleDelete = (id: string) => {
        updateEntries(entries.filter(e => e.id !== id));
    };

    const handleRestore = (id: string, originalKey: string) => {
        updateEntries(entries.map(e => {
            if (e.id === id) {
                if (e.isDeleted) {
                    return { ...e, isDeleted: false, v: tagsOriginal![originalKey] };
                }
                return { ...e, v: tagsOriginal![e.k] };
            }
            return e;
        }));
    };

    const rows = entries.map((entry) => {
        const { id, k, v, isDeleted } = entry;
        const readonly = protectedKeys?.includes(k);
        const isInvalid = !k || !v;
        const important = importantTagKeysRegex?.test(k) || importantTagValuesRegex?.test(v);

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
                        value={k}
                        readOnly={readonly}
                        onInput={(e) => handleKeyEdit(id, e)} />
                </td>

                <td className={cls('osm-tag-value', important && 'important', isInvalid && 'invalid', readonly && 'protected')}>
                    <input
                        value={v}
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

function useDebounce<T>(cb?: (val: T) => void, delay?: number) {
    const timerRef = useRef<any>();
    const valueRef = useRef<T>();

    return useCallback((val: T) => {
        clearTimeout(timerRef.current);

        timerRef.current = setTimeout(
            () => cb?.(valueRef.current!),
            delay || 500
        );

        valueRef.current = val;
    }, [cb, timerRef, delay]);
}
