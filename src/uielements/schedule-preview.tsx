import { useEffect, useState } from "preact/hooks";
import type { SelectionT } from "../app";
import { LocateMe } from "./locate-me";
import type { FeedMetaT } from "../types";

const SchedulesAPIBase = import.meta.env.DEV ?
    "http://localhost:4567/v1/schedule" :
    "https://pt.organicmaps.app/api/v1/schedule";
const RTUpdatesAPIBase = import.meta.env.DEV ?
    "http://localhost:4567/v1/updates" :
    "https://pt.organicmaps.app/api/v1/updates";

type ScheduleT = {
    stop: {
        id: string
        stop_name: string
        lat_lon: [number, number]
    },
    routes: {
        [k: string]: RouteT;
    },
    sections: ScheduleSectionT[]
}

type ScheduleSectionT = {
    calendar: CalendarT
    routeStopTimes: RouteStopTimesT[]
}

type RouteStopTimesT = {
    route: string
    arrivalTimes: number[]
    departureTimes: number[]
    tripIds: string[]
    timezone: string
    stopOnRoutePosition: StopOnRouteT
}

type RouteT = {
    agency: string
    longName: string
    routeId: string
    routeType: string
    shortName: string
    typeRaw: string
}

type CalendarT = {
    serviceId: string
    datesExcluded?: number[]
    datesIncluded?: number[]
    periodEnd: number
    periodStart: number
    week?: string
}

type StopOnRouteT = {
    firstStopId?: string
    firstStopName?: string
    lastStopId?: string
    lastStopName?: string
    prevStopId?: string
    prevStopName?: string
    sequence: number
}

type ScheduleApiResponseT = {
    timetables: ScheduleT[]
    feedMeta: { [region: string]: FeedMetaT }
}

export type SchedulePreviewProps = {
    selection: SelectionT | null
}
export function SchedulePreview({ selection }: SchedulePreviewProps) {
    const id = selection?.feature.properties.id;
    const lonlat = (selection?.feature.geometry as { coordinates: number[] } & any)?.coordinates;
    // Response type is {timetables: ScheduleT[], feedMeta: {['feedId': string]: FeedMeta}}
    const [schedule, setSchedule] = useState<ScheduleT[]>([]);
    const [tripUpdates, setTripUpdates] = useState<any>();

    const [showTheWholeDay, setShowTheWholeDay] = useState<boolean>(false);

    useEffect(() => {
        setSchedule([]);

        fetch(`${SchedulesAPIBase}/${id}`).then(r => r.json()).then((data: ScheduleApiResponseT) => {
            console.log('Schedule response', data);
            setSchedule(data.timetables);
        });

        const getUpdates = () => {
            fetch(`${RTUpdatesAPIBase}/${id}`).then(r => r.json()).then(tripUpdates => {
                console.log('Trip updates', tripUpdates);
                setTripUpdates(tripUpdates);
            });
        }

        // TODO: Would be nice to have more sophisticated subscriber
        const rt = setInterval(getUpdates, 5000);
        getUpdates();

        return () => clearInterval(rt);

    }, [id]);

    const dateObj = new Date();
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const year = dateObj.getFullYear();

    const dow = ["Su", "Mo", "Tu", "Wd", "Th", "Fr", "Sa"][dateObj.getDay()];

    const i_date = year * 10000 + month * 100 + day;
    const i_time = dateObj.getHours() * 3600 + dateObj.getMinutes() * 60;

    const stopIdCmp = (a: ScheduleT, b: ScheduleT) => {
        return a.stop.id.localeCompare(b.stop.id);
    }

    const scheduleElements = schedule.sort(stopIdCmp).map(s => {

        const filteredByPeriod = s.sections.filter(section => matchPeriod(section, i_date));

        const sections = (filteredByPeriod.length > 0 ? filteredByPeriod : s.sections).filter(section => matchDate(section, i_date, dow));

        const routeToMathedSections: { [k: string]: { section: ScheduleSectionT, routeStopTimes: RouteStopTimesT }[] } = {};
        for (const section of sections) {
            for (const routeStopTimes of section.routeStopTimes) {
                if (routeToMathedSections[routeStopTimes.route]) {
                    routeToMathedSections[routeStopTimes.route].push({ section, routeStopTimes });
                }
                else {
                    routeToMathedSections[routeStopTimes.route] = [{ section, routeStopTimes }];
                }
            }
        }

        const routes = Object.entries(routeToMathedSections).map(([rid, calendarAndStopTimes]) => {
            const route = s.routes[rid];

            const routeTripsCalendarSections = calendarAndStopTimes.map(({ section, routeStopTimes }) => {
                const trips = routeStopTimes.tripIds.map((tripId, inx) => {
                    return {
                        tripId,
                        arrivalTime: routeStopTimes.arrivalTimes[inx],
                        departureTime: routeStopTimes.departureTimes[inx],
                    }
                });

                const { route, timezone, stopOnRoutePosition } = routeStopTimes;

                return {
                    calendar: section.calendar,
                    trips,
                    route,
                    timezone,
                    stopOnRoutePosition,
                }
            });

            const trips = routeTripsCalendarSections.find(s => s.trips.length > 0)?.trips || [];
            if (routeTripsCalendarSections.length > 1) {
                // TODO: Merge sections, but it really should be just one
                console.warn("More than one calendar section matched for the day and route: ", routeTripsCalendarSections);
            }

            const lastStopName = routeTripsCalendarSections[0].stopOnRoutePosition.lastStopName;

            const uids = new Set();
            const uniqueTrips: typeof trips = [];
            trips.forEach(t => {
                if (uids.has(t.tripId)) {
                    console.warn('Duplicated trip id');
                    return;
                }
                uids.add(t.tripId);
                uniqueTrips.push(t);
            });

            const visibleTrips = !showTheWholeDay ? uniqueTrips.filter(t => t.arrivalTime > i_time).slice(0, 5) : uniqueTrips;

            const stopTripUpdates = tripUpdates?.[s.stop.id]?.tripUpdates;
            const updates = stopTripUpdates?.filter((tu: any) => tu.trip.routeId === rid);

            const ts = visibleTrips.map(t => {
                const update = updates?.find((u: any) => u.trip.tripId === t.tripId);
                return <span key={t.tripId}>
                    {`${formatTime(Math.floor(t.arrivalTime / 3600) % 24, Math.floor(t.arrivalTime % 3600 / 60))} `}
                    {update && <span style={{ color: 'red' }}>{update.stopTimeUpdates?.[0].arrivalDelay} sec</span>}
                </span>
            });

            const lastStopEl = (lastStopName && <div> to {lastStopName}</div>);

            return <div key={rid}><div><b>{route.routeType} {route.shortName} </b>: {ts}</div>{lastStopEl}</div>
        });

        return <div>
            <h5>{s.stop.id}</h5>
            <div>
                {routes}
            </div>
        </div>
    });

    return (<div id={"selection-info"}>
        {schedule.length === 0 && <div>loading {id}</div>}
        {schedule.length > 0 && <h4>{schedule[0].stop.stop_name}</h4>} {lonlat && <LocateMe zoom={18} lonlatFeature={{ lon: lonlat[0], lat: lonlat[1] }} />}
        <div>Today: {i_date} {dow}</div>
        <div>
            <span>{formatTime(dateObj.getHours(), dateObj.getMinutes())} </span>
            <label> Show schedule for the whole day </label>
            <input type="checkbox" checked={showTheWholeDay} onChange={() => setShowTheWholeDay(!showTheWholeDay)}></input>
        </div>
        {scheduleElements}
    </div>)
}

function formatTime(hours: number, minutes: number) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function matchPeriod(section: ScheduleSectionT, i_date: number) {
    const { periodStart, periodEnd } = section.calendar;

    if (periodStart > i_date || periodEnd < i_date) {
        return false;
    }
}

function matchDate(section: ScheduleSectionT, i_date: number, dow: string) {
    const { datesExcluded, datesIncluded, week } = section.calendar;

    if (datesExcluded?.includes(i_date)) {
        return false;
    }

    if (datesIncluded?.includes(i_date)) {
        return true;
    }

    return week?.includes(dow);
}