import { useState } from "preact/hooks";
import { ReportHelpOverlay } from "./report-help-overlay";
import { OSM_DATA } from "../services/OSMData";
import { Changes } from "./editor/changes";

export function AppHeader() {
    const [showHelp, setShowHelp] = useState(false);
    const [showChanges, setShowChanges] = useState(false);

    return (
        <div id="app-header">
            <button id="map-style-button">Map Style</button>

            <span className={'link-like'} onClick={() => setShowHelp(!showHelp)}>Help</span>
            <span>&nbsp;|&nbsp;</span>
            <span className={'link-like'} onClick={() => setShowChanges(!showChanges)}>OSM Changes</span>
            {showHelp && <ReportHelpOverlay onClose={() => setShowHelp(false)} />}
            {showChanges &&
                <div className={"overlay"}>
                    <div className={'overlay-content'}>
                        <span className={'link-like'} onClick={() => setShowChanges(false)}>Close</span>
                        <Changes osmData={OSM_DATA} />
                    </div>
                </div>
            }
        </div>
    );

}