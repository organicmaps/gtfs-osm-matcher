
// import { useCallback, useState } from 'react';

// import OSMData from '../services/OSMData';

import type { OSMElementTags } from '../services/OSMData.types';
import "./osm-tags.css";
import { cls } from './cls';
import { useCallback } from 'preact/hooks';

/*
export type tagsEditCB = (tags: OSMElementTags) => void;

export type OSMElementTagsProps = {
    osmElement: OSMElement
    osmData: OSMData
};
export default function OSMElementTagsEditor({ osmElement, osmData }: OSMElementTagsProps) {
    const tags = osmElement?.tags;

    // @ts-ignore ignore redraw is never read
    const [redraw, setRedraw] = useState({});

    const handleEdit: tagsEditCB = useCallback(newTags => {
        osmData.setElementTags(newTags, osmElement);
        setRedraw({});
    }, [tags, osmElement, setRedraw]);

    return <TagEditor tags={tags} onChange={handleEdit} ></TagEditor>
}
*/


/* TODO:
 * replace TagEditorProps tags with TagEditorElement[]
 * save them to a local state,
 * compose and decompose osmElement.element tags
 */

// @ts-ignore
type TagEditorElement = {
    key: string
    value: string
    error?: string
}

type handleInputCB = (key: string, evnt: Event) => void;
type stringCB = (key: string) => void;

export type TagEditorProps = {
    tags: OSMElementTags
    onChange?: (newTags: OSMElementTags) => void
    protectedKeys?: string[]
    invalidKeys?: string[]
};
export function TagEditor({ tags, onChange, protectedKeys, invalidKeys }: TagEditorProps) {

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

        onChange && onChange(Object.fromEntries(entries));
    };

    // There is no reason to use useCallback
    // this function will be changed on every
    // re-render anyways
    const handleValueEdit: handleInputCB = (key, evnt) => {
        const value = (evnt.target as HTMLInputElement).value;

        onChange && onChange({
            ...tags,
            [key]: value
        });
    };

    const handleAddTag = () => {
        const newKey = 'key'
        onChange && onChange({
            ...tags,
            [newKey]: 'value'
        });
    };

    const handleDelete: stringCB = useCallback(tagKey => {
        const { [tagKey]: oldValue, ...newTags } = tags;
        onChange && onChange(newTags);
    }, [tags, onChange]);

    const rows = Object.entries(tags || {}).map(([key, value], i) => {
        const readonly = protectedKeys?.includes(key);
        const invalid = invalidKeys?.includes(key);
        return (
            <tr key={i}>
                <td className={'tag-actions'}>
                    {!readonly && <span
                        onClick={handleDelete.bind(undefined, key)}
                        className={'osm-tag-delete'}
                    >
                        &#x2718;
                    </span>}
                </td>

                <td className={cls('osm-tag-key', invalid && 'invalid', readonly && 'protected')}>
                    <input
                        value={key}
                        readOnly={readonly}
                        onChange={handleKeyEdit.bind(undefined, key)} />
                </td>

                <td className={cls('osm-tag-value', invalid && 'invalid', readonly && 'protected')}>
                    <input
                        value={value}
                        readOnly={readonly}
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
        </table>
    }</>);

}
