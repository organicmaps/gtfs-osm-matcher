
// import { useCallback, useState } from 'react';

// import OSMData from '../services/OSMData';
import "./osm-tags.css";

import type { OSMElementTags } from '../services/OSMData.types';
import { cls } from './cls';
import { useCallback, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

type handleInputCB = (key: string, evnt: Event) => void;
type stringCB = (key: string) => void;

export type TagEditorProps = {
    tags: OSMElementTags;
    tagsOriginal?: OSMElementTags;
    onChange?: (newTags: OSMElementTags) => void;
    protectedKeys?: string[];
    invalidKeys?: string[];
    children?: ComponentChildren
};
export function TagEditor({ tags, tagsOriginal, onChange, children, protectedKeys, invalidKeys }: TagEditorProps) {

    const onChangeDebounce = useDebounce<OSMElementTags>(onChange, 1000);

    const handleKeyEdit: handleInputCB = (key, evnt) => {
        const entries = Object.entries(tags);

        let newKey = (evnt.target as HTMLInputElement).value;
        const value = tags[key];

        // TODO: allow for transient "wrong" tags
        if (tags[newKey]) {
            newKey += ':';
        }

        const index = entries.findIndex(([k, _v]) => k === key);
        entries.splice(index, 1, [newKey, value]);

        onChangeDebounce(Object.fromEntries(entries));
    };

    // There is no reason to use useCallback
    // this function will be changed on every
    // re-render anyways
    const handleValueEdit: handleInputCB = (key, evnt) => {
        const value = (evnt.target as HTMLInputElement).value;

        onChangeDebounce({
            ...tags,
            [key]: value
        });
    };

    const handleAddTag = () => {
        const newKey = 'key'
        onChange?.({
            ...tags,
            [newKey]: 'value'
        });
    };

    const handleDelete: stringCB = useCallback(tagKey => {
        const { [tagKey]: oldValue, ...newTags } = tags;
        onChange?.(newTags);
    }, [tags, onChange]);

    const handleRestore: stringCB = useCallback(tagKey => {
        const newTags = {
            ...tags,
            [tagKey]: tagsOriginal![tagKey]
        };
        onChange?.(newTags);
    }, [tags, tagsOriginal, onChange]);

    var tagEntries = Object.entries(tagsOriginal || {});

    // Update default values with current values
    Object.entries(tags || {}).forEach(([key, value]) => {
        if (!Object.keys(tagsOriginal || {}).includes(key)) {
            tagEntries.push([key, value]);
        } else {
            tagEntries = tagEntries.map(([exkey, exvalue]) => {
                return [exkey, exkey === key ? value : exvalue];
            });
        }
    });

    if (import.meta.env.DEV) {
        console.log('tagEntries', tagEntries);
    }

    const rows = tagEntries.map(([key, value], i) => {
        const readonly = protectedKeys?.includes(key);
        const invalid = invalidKeys?.includes(key);

        const current = tags[key];
        const original = tagsOriginal?.[key];

        return (
            <tr key={i}>
                <td className={'tag-actions'}>
                    {!readonly && current !== undefined && <span
                        onClick={handleDelete.bind(undefined, key)}
                        className={'osm-tag-delete'}
                    >
                        &#x2718;
                    </span>}
                    {current !== original && original !== undefined &&
                        <span className={'osm-tag-restore'} onClick={handleRestore.bind(undefined, key)}>
                            &#x27F3;
                        </span>}
                </td>

                <td className={cls('osm-tag-key', invalid && 'invalid', readonly && 'protected', current === undefined && 'deleted')}>
                    <input
                        value={key}
                        readOnly={readonly || current === undefined}
                        onChange={handleKeyEdit.bind(undefined, key)} />
                </td>

                <td className={cls('osm-tag-value', invalid && 'invalid', readonly && 'protected', current === undefined && 'deleted')}>
                    <input
                        value={value}
                        readOnly={readonly || current === undefined}
                        onChange={handleValueEdit.bind(undefined, key)} />
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
