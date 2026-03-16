import { useEffect, useState } from "preact/hooks";
import type { SelectionT } from "../app";
import { LocateMe } from "./locate-me";
import type { FeedMetaT } from "../types";
import type { RouteStopTimes, Schedule, StopTimetable } from "../services/schedule.types";
import { decodeIntArray, decodeTripIds, servicePeriodIndexes } from "../services/ScheduleEncoding";

const SchedulesAPIBase = import.meta.env.DEV ?
    "http://localhost:4567/v1/schedule" :
    "https://pt.organicmaps.app/api/v1/schedule";
const RTUpdatesAPIBase = import.meta.env.DEV ?
    "http://localhost:4567/v1/updates" :
    "https://pt.organicmaps.app/api/v1/updates";


type ScheduleApiResponseV2 = {
    formatVersion: string,
    
    schedules: Schedule[];

    feedMeta: { 
        [region: string]: FeedMetaT 
    };
}

var moreThanOneScheduleReported = 0;

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

            if (data.formatVersion === '2') {
                setSchedules((data as ScheduleApiResponseV2).schedules);
            }
            else {
                console.error('Old timetable format is not supported');
                // setSchedule((data as ScheduleApiResponseT).timetables);
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
    const i_time = today.getHours() * 3600 + today.getMinutes() * 60;

    const stopIdCmp = (a: StopTimetable, b: StopTimetable) => {
        const cmpPlatformCode = (a.stop.platformCode || '').localeCompare(b.stop.platformCode || '');
        
        if (cmpPlatformCode !== 0) {
            return cmpPlatformCode;
        }

        return a.stop.id.localeCompare(b.stop.id);
    }

    const regionStops = schedules.map(schedule => {
        const {routes, periods, timetables} = schedule as Schedule;

        const activeServices = servicePeriodIndexes(periods, today);

        const scheduleElements = timetables.sort(stopIdCmp).map(tt => {
            const stop = tt.stop;

            const routesWithTimesToday: {[rid: string]: RouteStopTimes[]} = {};

            tt.periods
                .filter(p => !!activeServices.includes(p.period))
                .forEach(p => p.routeStopTimes.forEach(rTimetable => {
                    const rtts = routesWithTimesToday[rTimetable.route] || [];
                    rtts.push(rTimetable);
                    routesWithTimesToday[rTimetable.route] = rtts;
                }));
            
            const routeElements = Object.entries(routesWithTimesToday).flatMap(([rid, stopTimes]) => {
                const route = routes.find(r => r.routeId === rid);
                
                if (import.meta.env.DEV && stopTimes.length > 1 && moreThanOneScheduleReported++ < 10) {
                    console.warn('More than one route schedule applicable for today', stopTimes);
                }

                return stopTimes.map(routeSchedule => {
                    return {
                        route,
                        routeSchedule
                    }
                });
                
            })
            .filter(({route}) => !!route)
            .sort((a, b) => a.route!.shortName.localeCompare(b.route!.shortName));
            
            const routeAndTrips = routeElements.map(({route, routeSchedule}, rInx) => {
                const arrivalTimes = decodeIntArray(routeSchedule.arrivalTimes);
                const departureTimes = decodeIntArray(routeSchedule.departureTimes);
                const tripIds = decodeTripIds(routeSchedule.tripIds);

                const trips = [];
                for (var i in tripIds) {
                    trips.push({
                        arrivalTime: arrivalTimes[i],
                        departureTimes: departureTimes[i],
                        tripId: tripIds[i]
                    });
                }

                const visibleTrips = !showTheWholeDay ? trips.filter(t => t.arrivalTime > i_time).slice(0, 5) : trips;
                
                const stopTripUpdates = tripUpdates?.[stop.id]?.tripUpdates;
                const updates = stopTripUpdates?.filter((tu: any) => tu.trip.routeId === route?.routeId);

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

                const lastStopName = routeSchedule.stopOnRoutePosition.lastStopName;
                var destSrcLabel = (lastStopName && <div> to {lastStopName}</div>);

                // We are the last stop
                if (routeSchedule.stopOnRoutePosition.lastStopId === stop.id) {
                    const firstStopName = routeSchedule.stopOnRoutePosition.firstStopName;
                    destSrcLabel = (firstStopName && <div> from {firstStopName}</div>);
                }

                return <div key={route!.routeId + '-' + rInx}><div><b>{route!.routeType} {route!.shortName} </b>: {ts}</div>{destSrcLabel}</div>

            });

            return <div>
                <h5>Platform {stop.platformCode}</h5>
                <div>
                    {routeAndTrips}
                </div>
            </div>
        });

        return (
            <div id={schedule.feed}>
                <div>Region: {schedule.feed}</div>
                {scheduleElements}
            </div>
        );
    });

    return (<div id={"selection-info"}>
        {schedules.length === 0 && <div>loading {id}</div>}
        {schedules.length > 0 && <h4>{schedules[0].timetables[0].stop.stop_name}</h4>} {lonlat && <LocateMe zoom={18} lonlatFeature={{ lon: lonlat[0], lat: lonlat[1] }} />}
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
