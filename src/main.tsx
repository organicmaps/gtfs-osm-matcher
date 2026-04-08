import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { Preview } from './preview/preview.tsx'
import { useHashRoute, parseUrlPreviewRegion } from './uielements/routing.ts'

function Router() {
    const previewRegion = useHashRoute(parseUrlPreviewRegion)
    if (previewRegion) {
        return <Preview region={previewRegion} />
    }
    return <App />
}

render(<Router />, document.getElementById('app')!)
