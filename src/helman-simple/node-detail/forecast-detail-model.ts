import type { ForecastPointDTO, GridForecastDTO, SolarForecastDTO } from "../../helman-api";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export interface ForecastDetailDayModel {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    solarSummaryKwh: number | null;
    solarTotalKwh: number | null;
    solarHours: ForecastPointDTO[];
    hasSolarData: boolean;
    currentPrice: number | null;
    priceMin: number | null;
    priceMax: number | null;
    priceHours: ForecastPointDTO[];
    hasPriceData: boolean;
}

interface BuildForecastDetailModelParams {
    solarForecast: SolarForecastDTO | null;
    gridForecast: GridForecastDTO | null;
    timeZone: string;
    remainingTodayKwhOverride?: number | null;
    now?: Date;
}

interface GroupedSolarPointsByDay {
    visibleDayMap: Map<string, ForecastPointDTO[]>;
    totalDayMap: Map<string, ForecastPointDTO[]>;
}

export function buildForecastDetailModel({
    solarForecast,
    gridForecast,
    timeZone,
    remainingTodayKwhOverride,
    now = new Date(),
}: BuildForecastDetailModelParams): ForecastDetailDayModel[] {
    const currentLocalParts = getCachedLocalDateTimeParts(now, timeZone);
    if (currentLocalParts === null) {
        return [];
    }

    const { visibleDayMap: solarDayMap, totalDayMap: solarTotalDayMap } = _groupSolarPointsByDay(
        solarForecast?.points ?? [],
        timeZone,
        currentLocalParts.dayKey,
    );
    const priceDayMap = _groupPointsByDay(
        gridForecast?.points ?? [],
        timeZone,
        currentLocalParts.dayKey,
    );

    const todayKey = currentLocalParts.dayKey;
    const tomorrowKey = _addDaysToDayKey(todayKey, 1);
    const allDayKeys = Array.from(
        new Set([...solarDayMap.keys(), ...priceDayMap.keys()]),
    ).sort();

    return allDayKeys.map((dayKey) => {
        const solarHours = solarDayMap.get(dayKey) ?? [];
        const solarTotalHours = solarTotalDayMap.get(dayKey) ?? [];
        const priceHours = priceDayMap.get(dayKey) ?? [];
        const solarSummaryKwh = dayKey === todayKey
            ? remainingTodayKwhOverride
                ?? solarForecast?.remainingTodayKwh
                ?? _sumPointValuesKwh(solarHours)
            : _sumPointValuesKwh(solarHours);

        return {
            dayKey,
            isToday: dayKey === todayKey,
            isTomorrow: dayKey === tomorrowKey,
            solarSummaryKwh,
            solarTotalKwh: _sumPointValuesKwh(solarTotalHours),
            solarHours,
            hasSolarData: solarHours.length > 0 || solarSummaryKwh !== null,
            currentPrice: dayKey === todayKey ? gridForecast?.currentSellPrice ?? null : null,
            priceMin: priceHours.length > 0
                ? Math.min(...priceHours.map((point) => point.value))
                : null,
            priceMax: priceHours.length > 0
                ? Math.max(...priceHours.map((point) => point.value))
                : null,
            priceHours,
            hasPriceData: priceHours.length > 0,
        };
    });
}

function _groupSolarPointsByDay(
    points: ForecastPointDTO[],
    timeZone: string,
    currentLocalDayKey?: string,
): GroupedSolarPointsByDay {
    const visibleDayMap = new Map<string, ForecastPointDTO[]>();
    const totalDayMap = new Map<string, ForecastPointDTO[]>();

    for (const point of points) {
        const pointLocalParts = getCachedLocalDateTimeParts(point.timestamp, timeZone);
        if (pointLocalParts === null) {
            continue;
        }

        _addPointToDayMap(totalDayMap, pointLocalParts.dayKey, point);

        if (currentLocalDayKey !== undefined && pointLocalParts.dayKey < currentLocalDayKey) {
            continue;
        }

        _addPointToDayMap(visibleDayMap, pointLocalParts.dayKey, point);
    }

    _sortDayMap(visibleDayMap);
    _sortDayMap(totalDayMap);

    return {
        visibleDayMap,
        totalDayMap,
    };
}

function _groupPointsByDay(
    points: ForecastPointDTO[],
    timeZone: string,
    currentLocalDayKey?: string,
): Map<string, ForecastPointDTO[]> {
    const dayMap = new Map<string, ForecastPointDTO[]>();

    for (const point of points) {
        const pointLocalParts = getCachedLocalDateTimeParts(point.timestamp, timeZone);
        if (pointLocalParts === null) {
            continue;
        }

        if (currentLocalDayKey !== undefined && pointLocalParts.dayKey < currentLocalDayKey) {
            continue;
        }

        _addPointToDayMap(dayMap, pointLocalParts.dayKey, point);
    }

    _sortDayMap(dayMap);

    return dayMap;
}

function _addPointToDayMap(
    dayMap: Map<string, ForecastPointDTO[]>,
    dayKey: string,
    point: ForecastPointDTO,
): void {
    const dayPoints = dayMap.get(dayKey) ?? [];
    dayPoints.push(point);
    dayMap.set(dayKey, dayPoints);
}

function _sortDayMap(dayMap: Map<string, ForecastPointDTO[]>): void {
    for (const [dayKey, dayPoints] of dayMap.entries()) {
        dayMap.set(dayKey, [...dayPoints].sort(_comparePointsByTimestamp));
    }
}

function _sumPointValuesKwh(points: ForecastPointDTO[]): number | null {
    if (points.length === 0) {
        return null;
    }

    return points.reduce((sum, point) => sum + point.value, 0) / 1000;
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function _comparePointsByTimestamp(a: ForecastPointDTO, b: ForecastPointDTO): number {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}
