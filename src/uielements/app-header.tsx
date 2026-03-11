import { useState } from "preact/hooks";
import { ReportHelpOverlay } from "./report-help-overlay";
import { OSM_DATA } from "../services/OSMData";
import { Changes } from "./editor/changes";

export function AppHeader() {
    const [showHelp, setShowHelp] = useState(false);
    const [showChanges, setShowChanges] = useState(false);

    return (
        <div id="app-header">
            <div id="header-left">
                <span className={'link-like'} onClick={() => setShowHelp(!showHelp)}>Help</span>
                <span className={'header-sep'}>|</span>
                <span className={'link-like'} onClick={() => setShowChanges(!showChanges)}>OSM Changes</span>
            </div>
            <div id="header-right">
                <button id="map-style-button">Map Style</button>
                <div id="map-location">
                    <input/>
                    <a target={'_blank'} className={'goto-button'}><button>Goto OSM</button></a>
                </div>
            </div>
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