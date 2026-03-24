import { useEffect, useMemo, useState } from "preact/hooks";
import type { SelectionT } from "../app";
import { LocateMe } from "./locate-me";
import type { FeedMetaT } from "../types";
import type { Schedule, Stop } from "../services/schedule.types";
import { dateAsNumber, decodeScheduleOnDate } from "../services/ScheduleEncoding";

const SchedulesAPIBase = import.meta.env.DEV ?
    "http://localhost:4567/v1/schedule" :
    "https://pt.organicmaps.app/api/v1/schedule";
const RTUpdatesAPIBase = import.meta.env.DEV ?
    "http://localhost:4567/v1/updates" :
    "https://pt.organicmaps.app/api/v1/updates";


type ScheduleApiResponseV3 = {
    formatVersion: string,
    
    schedules: Schedule[];

    feedMeta: { 
        [region: string]: FeedMetaT 
    };
}

export type SchedulePreviewProps = {
    selection: SelectionT | null
}
export function SchedulePreview({ selection }: SchedulePreviewProps) {
    const id = selection?.feature.properties.id;
    const lonlat = (selection?.feature.geometry as { coordinates: number[] } & any)?.coordinates;

    const [schedules, setSchedules] = useState<Schedule[]>([]);
    
    const [liveUpdates, setLiveUpdates] = useState<boolean>(false);
    const [tripUpdates, setTripUpdates] = useState<any>();

    const [showTheWholeDay, setShowTheWholeDay] = useState<boolean>(false);

    useEffect(() => {
        setSchedules([]);

        fetch(`${SchedulesAPIBase}/${id}`).then(r => r.json()).then((data: any) => {
            
            import.meta.env.DEV && 
                console.log('Schedule response', data);

            if (data.formatVersion === '4') {
                setSchedules((data as ScheduleApiResponseV3).schedules);
            }
            else {
                console.error('Old timetable format is not supported');
                console.error('Old timetable format is not supported');
            }

            const liveUpdates = Object.values(data.feedMeta)
                    .some((meta) => (meta as FeedMetaT).liveUpdates);

            setLiveUpdates(liveUpdates);
        });

    }, [id]);

    useEffect(() => {
        if (!liveUpdates) {
            return;
        }

        const getUpdates = () => {
            fetch(`${RTUpdatesAPIBase}/${id}`).then(r => r.json()).then(tripUpdates => {
                setTripUpdates(tripUpdates);
            });
        }

        const rt = setInterval(getUpdates, 5000);
        getUpdates();

        return () => clearInterval(rt);

    }, [id, liveUpdates]);

    const today = new Date();
    const i_today = dateAsNumber(today);
    const i_time = today.getHours() * 3600 + today.getMinutes() * 60;

    const stopPlatformCodeCmp = (a: {stop: Stop}, b: {stop: Stop}) => {
        const padCode = (pc: string) => pc.replace(/(\d+)/, (m) => m.padStart(4, '0'));
        const codeA = padCode(a.stop.platformCode || '');
        const codeB = padCode(b.stop.platformCode || '');
        const cmpPlatformCode = codeA.localeCompare(codeB);
        
        if (cmpPlatformCode !== 0) {
            return cmpPlatformCode;
        }

        return a.stop.id.localeCompare(b.stop.id);
    }

    const schedulesPerRegion = useMemo(() => {
        return schedules.map(s => decodeScheduleOnDate(s as Schedule, i_today));
    }, [id, schedules, i_today]);

    const regionStops = schedulesPerRegion.map(schedule => {

        schedule.sort(stopPlatformCodeCmp);

        return schedule.filter(({routes}) => routes?.length).map(({stop, routes}) => {

            const routeAndTrips = routes.sort((a, b) => {
                const astr = a.route.shortName || '';
                const bstr = b.route.shortName || '';

                return astr.localeCompare(bstr);
            })
            .map(rSchedule => {
                const {route, direction, positions, tripTimes } = rSchedule;

                const pos = positions[0];

                const stopTripUpdates = tripUpdates?.[stop.id]?.tripUpdates;
                const updates = stopTripUpdates?.filter((tu: any) => tu.trip.routeId === route?.routeId);

                const trips = tripTimes.arrivalTime.map((t, i) => {
                    return {
                        tripId: tripTimes.tripId[i],
                        arrivalTime: t
                    }
                });

                const visibleTrips = showTheWholeDay ? trips : trips.filter(({arrivalTime}) => arrivalTime > i_time).slice(0, 5);

                if (visibleTrips.length === 0) {
                    return null;
                }

                const ts = visibleTrips.map(t => {
                    const update = updates?.find((u: any) => u.trip.tripId === t.tripId);

                    const delaySec = update?.stopTimeUpdates?.[0].arrivalDelay || 0;
                    
                    const h = Math.abs(Math.floor(delaySec / 3600));
                    const m = Math.abs(Math.floor((delaySec % 3600) / 60));
                    const s = Math.abs(delaySec % 60);

                    const delayString = [
                        h !== 0 ? `${h}h` : null,
                        m !== 0 ? `${m}m` : null,
                        s !== 0 ? `${s}s` : null,
                    ]
                    .filter(t => !!t)
                    .join(' ');

                    return <span key={t.tripId}>
                        {`${formatTime(Math.floor(t.arrivalTime / 3600) % 24, Math.floor(t.arrivalTime % 3600 / 60))} `}
                        {(Math.abs(delaySec) > 15) && <span style={{ color: delaySec > 0 ? 'red' : 'blue' }}>{delayString} {delaySec > 0 ? 'late' : 'early'} </span>}
                    </span>
                });

                const lastStopName = pos.lastStopName;
                let destSrcLabel = (lastStopName && <div> to {lastStopName}</div>);

                // We are the last stop
                if (pos.lastStopId === stop.id) {
                    const firstStopName = pos.firstStopName;
                    destSrcLabel = (firstStopName && <div> from {firstStopName}</div>);
                }

                return <div key={route!.routeId + "=" + direction}><div><b>{route!.routeType} {route!.shortName} </b>: {ts}</div>{destSrcLabel}</div>

            });

            return <div key={stop.id}>
                <h5>Platform {stop.platformCode}</h5>
                <div>
                    {routeAndTrips}
                </div>
            </div>
        });

    });

    const name = schedules[0] && schedules[0].stops[0].stop_name;

    return (<div id={"selection-info"}>
        {schedules.length === 0 && <div>loading {id}</div>}
        {schedules.length > 0 && <h4>{name}</h4>} {lonlat && <LocateMe zoom={18} lonlatFeature={{ lon: lonlat[0], lat: lonlat[1] }} />}
        <div>
            <label> Show schedule for the whole day </label>
            <input type="checkbox" checked={showTheWholeDay} onChange={() => setShowTheWholeDay(!showTheWholeDay)}></input>
        </div>
        {regionStops}
    </div>)
}

function formatTime(hours: number, minutes: number) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
