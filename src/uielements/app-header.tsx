import { useState } from "preact/hooks";
import { ReportHelpOverlay } from "./report-help-overlay";

export function AppHeader() {
    const [showHelp, setShowHelp] = useState(false);

    return (
        <div id="app-header">
            <div id="header-left">
                <span className={'link-like'} onClick={() => setShowHelp(!showHelp)}>Help</span>
            </div>
            <div id="header-right">
                <button id="map-style-button">Map Style</button>
                <div id="map-location">
                    <input/>
                    <a target={'_blank'} className={'goto-button'}><button>Goto OSM</button></a>
                </div>
            </div>
            {showHelp && <ReportHelpOverlay onClose={() => setShowHelp(false)} />}
        </div>
    );

}