import { useContext } from "preact/hooks";

import "./switch.css";
import { ViewOptionsContext } from "../app";
import { cls } from "./cls";

export type SwitchProps = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    title?: string;
};

/**
 * A slider switch.
 *
 * <p>A checkbox underneath, so it keeps the keyboard and the accessibility tree a checkbox
 * has; the slider is drawn from the label. Used where a control turns a view on rather than
 * selecting one of a set — a checkbox in a list of checkboxes reads as another filter, and
 * this is not one.
 */
export function Switch({ checked, onChange, label, title }: SwitchProps) {
    return (
        <label className={cls('switch', checked && 'on')} title={title}>
            <input type={'checkbox'} checked={checked}
                onChange={e => onChange((e.target as HTMLInputElement).checked)} />
            <span className={'switch-track'}><span className={'switch-knob'} /></span>
            <span className={'switch-label'}>{label}</span>
        </label>
    );
}

/**
 * The Preview switch. One component because it is rendered in two places — the report tab
 * and the selection panel — and two hand-written copies had already drifted: one of them
 * still described the routes the preview used to draw.
 */
export function PreviewSwitch() {
    const { previewOn, setPreviewOn, previewAvailable } = useContext(ViewOptionsContext);
    // Not offered where the report has no anchors to draw: the panel's copy used to be
    // ungated, so flipping it there set a state the report immediately cleared and the knob
    // snapped back with nothing said.
    if (!previewAvailable) {
        return null;
    }
    return (
        <Switch checked={previewOn} onChange={setPreviewOn} label={'Preview'}
            title={'Draw each stop where the matcher anchored it, instead of where its feed puts it'} />
    );
}
