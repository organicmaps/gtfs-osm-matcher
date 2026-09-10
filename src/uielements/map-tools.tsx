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
                <button id="map-style-button" title="Switch the base map between the cartographic and the satellite style">Sat/Geo</button>
                {/* The stop-structure layer: each stop's bay, the road beside it and which way
                    that road runs. Served from the same data root as the reports. */}
                <button id="pt-structure-button" title="Show the stop-structure layer: bays, and what the nearest road says about each stop. Drawn from zoom 8 in; from the world view there is nothing to draw.">PT structure</button>
                <div id="map-location">
                    <input/>
                    <a target={'_blank'} className={'goto-button'}><button>Goto OSM</button></a>
                </div>
            </div>}
            {showHelp && <ReportHelpOverlay onClose={() => setShowHelp(false)} />}
        </div>
    );
}
