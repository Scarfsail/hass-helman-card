import type { ForecastPointDTO, GridForecastDTO, SolarForecastDTO } from "../../helman-api";
import {
    buildLocalDayHourTimestamps,
    indexEntriesByLocalHour,
} from "./actual-vs-forecast-day-axis";
import { getCachedLocalDateTimeParts } from "./local-date-time-parts-cache";

export type SolarHourSource = "actual" | "forecast" | "gap";

export interface ForecastSolarHourPoint {
    timestamp: string;
    value: number | null;
    source: SolarHourSource;
}

export interface ForecastDetailDayModel {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    solarSummaryKwh: number | null;
    solarTotalKwh: number | null;
    solarHours: ForecastSolarHourPoint[];
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

    const solarDayMap = _groupSolarHoursByDay(
        solarForecast,
        timeZone,
        currentLocalParts.dayKey,
        currentLocalParts.hour,
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
        const priceHours = priceDayMap.get(dayKey) ?? [];
        const solarSummaryKwh = dayKey === todayKey
            ? remainingTodayKwhOverride
                ?? solarForecast?.remainingTodayKwh
                ?? _sumRemainingSolarKwh(solarHours, timeZone, currentLocalParts.hour)
            : _sumSolarHourValuesKwh(solarHours);

        return {
            dayKey,
            isToday: dayKey === todayKey,
            isTomorrow: dayKey === tomorrowKey,
            solarSummaryKwh,
            solarTotalKwh: _sumSolarHourValuesKwh(solarHours),
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

function _groupSolarHoursByDay(
    solarForecast: SolarForecastDTO | null,
    timeZone: string,
    currentLocalDayKey: string,
    currentHour: number,
): Map<string, ForecastSolarHourPoint[]> {
    const dayMap = new Map<string, ForecastSolarHourPoint[]>();
    const actualHistory = solarForecast?.actualHistory ?? [];
    const forecastPoints = solarForecast?.points ?? [];
    const todayHours = _buildTodaySolarHours({
        actualHistory,
        forecastPoints,
        timeZone,
        dayKey: currentLocalDayKey,
        currentHour,
    });

    if (todayHours.length > 0) {
        dayMap.set(currentLocalDayKey, todayHours);
    }

    for (const point of forecastPoints) {
        const pointLocalParts = getCachedLocalDateTimeParts(point.timestamp, timeZone);
        if (pointLocalParts === null || pointLocalParts.dayKey <= currentLocalDayKey) {
            continue;
        }

        const dayPoints = dayMap.get(pointLocalParts.dayKey) ?? [];
        dayPoints.push({
            timestamp: point.timestamp,
            value: point.value,
            source: "forecast",
        });
        dayMap.set(pointLocalParts.dayKey, dayPoints);
    }

    for (const [dayKey, dayPoints] of dayMap.entries()) {
        dayMap.set(dayKey, [...dayPoints].sort(_compareSolarHoursByTimestamp));
    }

    return dayMap;
}

function _buildTodaySolarHours({
    actualHistory,
    forecastPoints,
    timeZone,
    dayKey,
    currentHour,
}: {
    actualHistory: ForecastPointDTO[];
    forecastPoints: ForecastPointDTO[];
    timeZone: string;
    dayKey: string;
    currentHour: number;
}): ForecastSolarHourPoint[] {
    const referenceTimestamps = [
        ...actualHistory.map((entry) => entry.timestamp),
        ...forecastPoints.map((point) => point.timestamp),
    ];
    if (referenceTimestamps.length === 0) {
        return [];
    }

    const actualByHour = indexEntriesByLocalHour(actualHistory, timeZone, dayKey);
    const forecastByHour = indexEntriesByLocalHour(forecastPoints, timeZone, dayKey);

    return buildLocalDayHourTimestamps(dayKey, timeZone, referenceTimestamps).map(({ hour, timestamp }) => {
        if (hour < currentHour) {
            const actualPoint = actualByHour.get(hour);
            return actualPoint !== undefined
                ? {
                    timestamp: actualPoint.timestamp,
                    value: actualPoint.value,
                    source: "actual",
                }
                : {
                    timestamp,
                    value: null,
                    source: "gap",
                };
        }

        const forecastPoint = forecastByHour.get(hour);
        return forecastPoint !== undefined
            ? {
                timestamp: forecastPoint.timestamp,
                value: forecastPoint.value,
                source: "forecast",
            }
            : {
                timestamp,
                value: null,
                source: "gap",
            };
    });
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

        const dayPoints = dayMap.get(pointLocalParts.dayKey) ?? [];
        dayPoints.push(point);
        dayMap.set(pointLocalParts.dayKey, dayPoints);
    }

    for (const [dayKey, dayPoints] of dayMap.entries()) {
        dayMap.set(dayKey, [...dayPoints].sort(_comparePointsByTimestamp));
    }

    return dayMap;
}

function _sumSolarHourValuesKwh(points: ForecastSolarHourPoint[]): number | null {
    const values = points
        .map((point) => point.value)
        .filter((value): value is number => value !== null);

    if (values.length === 0) {
        return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / 1000;
}

function _sumRemainingSolarKwh(
    points: ForecastSolarHourPoint[],
    timeZone: string,
    currentHour: number,
): number | null {
    const remainingValues = points
        .filter((point) => {
            const parts = getCachedLocalDateTimeParts(point.timestamp, timeZone);
            return parts !== null && parts.hour >= currentHour && point.value !== null;
        })
        .map((point) => point.value as number);

    if (remainingValues.length === 0) {
        return null;
    }

    return remainingValues.reduce((sum, value) => sum + value, 0) / 1000;
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function _comparePointsByTimestamp(a: ForecastPointDTO, b: ForecastPointDTO): number {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

function _compareSolarHoursByTimestamp(a: ForecastSolarHourPoint, b: ForecastSolarHourPoint): number {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}
