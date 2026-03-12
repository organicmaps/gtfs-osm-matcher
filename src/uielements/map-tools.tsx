import { useState } from "preact/hooks";
import { ReportHelpOverlay } from "./report-help-overlay";
import { cls } from "./cls";

export function MapTools() {
    const [showHelp, setShowHelp] = useState(false);
    const [folded, setFolded] = useState(false);

    return (
        <div id="map-tools">
            <span className="map-tools-toggle" onClick={() => setFolded(!folded)}>
                {folded ? '◀' : '▶'}
            </span>
            {<div id="map-tools-content" className={cls(folded && 'folded')}>
                <span className={'link-like'} onClick={() => setShowHelp(!showHelp)}>Help</span>
                <button id="map-style-button">Map Style</button>
                <div id="map-location">
                    <input/>
                    <a target={'_blank'} className={'goto-button'}><button>Goto OSM</button></a>
                </div>
            </div>}
            {showHelp && <ReportHelpOverlay onClose={() => setShowHelp(false)} />}
        </div>
    );
}
