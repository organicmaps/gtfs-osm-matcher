import { useEffect, useState } from "preact/hooks";
import type { SelectionT } from "../app";
import { LocateMe } from "./locate-me";

const SchedulesAPIBase = "http://localhost:4567/v1/schedule";
const RTUpdatesAPIBase = "http://localhost:4567/v1/updates";

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

        fetch(`${SchedulesAPIBase}/${id}`).then(r => r.json()).then(data => {
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

        const routeToMathedSections: { [k: string]: RouteStopTimesT[] } = {};
        for (const section of sections) {
            for (const routeStopTimes of section.routeStopTimes) {
                if (routeToMathedSections[routeStopTimes.route]) {
                    routeToMathedSections[routeStopTimes.route].push(routeStopTimes);
                }
                else {
                    routeToMathedSections[routeStopTimes.route] = [routeStopTimes];
                }
            }
        }

        const routes = Object.entries(routeToMathedSections).map(([rid, stopTimes]) => {
            const route = s.routes[rid];

            let sectionTimes = [];
            for (const times of stopTimes) {
                showTheWholeDay ?
                    sectionTimes.push(...times.arrivalTimes) :
                    sectionTimes.push(...times.arrivalTimes.filter(t => t > i_time).slice(0, 3));
            }

            const lastStopName = stopTimes.find(st => st.stopOnRoutePosition.lastStopName)?.stopOnRoutePosition?.lastStopName;

            sectionTimes.sort();
            if (!showTheWholeDay) {
                sectionTimes = sectionTimes.slice(0, 3);
            }

            const ts = sectionTimes.map(t => <span key={t}>{`${Math.floor(t / 3600)}:${Math.floor(t % 3600 / 60)} `}</span>)

            return <div key={rid}><b>{route.routeType} {route.shortName} </b>{lastStopName && <span> (to {lastStopName})</span>}: {ts}</div>
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
            <span>{dateObj.getHours()}:{dateObj.getMinutes()} </span>
            <label> Show schedule for the whole day </label>
            <input type="checkbox" checked={showTheWholeDay} onChange={() => setShowTheWholeDay(!showTheWholeDay)}></input>
        </div>
        {scheduleElements}
    </div>)
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