import type { ForecastPointDTO, GridForecastDTO, SolarForecastDTO } from "../../helman-api";

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

interface LocalDateTimeParts {
    dayKey: string;
    hour: number;
}

export function buildForecastDetailModel({
    solarForecast,
    gridForecast,
    timeZone,
    remainingTodayKwhOverride,
    now = new Date(),
}: BuildForecastDetailModelParams): ForecastDetailDayModel[] {
    const currentLocalParts = _getLocalDateTimeParts(now, timeZone);
    if (currentLocalParts === null) {
        return [];
    }

    const solarDayMap = _groupPointsByDay(
        solarForecast?.points ?? [],
        timeZone,
        currentLocalParts,
    );
    const solarTotalDayMap = _groupPointsByDay(
        solarForecast?.points ?? [],
        timeZone,
    );
    const priceDayMap = _groupPointsByDay(
        gridForecast?.points ?? [],
        timeZone,
        currentLocalParts,
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

function _groupPointsByDay(
    points: ForecastPointDTO[],
    timeZone: string,
    currentLocalParts?: LocalDateTimeParts,
): Map<string, ForecastPointDTO[]> {
    const dayMap = new Map<string, ForecastPointDTO[]>();

    for (const point of points) {
        const pointDate = new Date(point.timestamp);
        if (Number.isNaN(pointDate.getTime())) {
            continue;
        }

        const pointLocalParts = _getLocalDateTimeParts(pointDate, timeZone);
        if (pointLocalParts === null) {
            continue;
        }

        if (currentLocalParts !== undefined && pointLocalParts.dayKey < currentLocalParts.dayKey) {
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

function _sumPointValuesKwh(points: ForecastPointDTO[]): number | null {
    if (points.length === 0) {
        return null;
    }

    return points.reduce((sum, point) => sum + point.value, 0) / 1000;
}
function _getLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts | null {
    const formattedParts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    const year = formattedParts.find((part) => part.type === "year")?.value;
    const month = formattedParts.find((part) => part.type === "month")?.value;
    const day = formattedParts.find((part) => part.type === "day")?.value;
    const hour = formattedParts.find((part) => part.type === "hour")?.value;
    if (!year || !month || !day || !hour) {
        return null;
    }

    return {
        dayKey: `${year}-${month}-${day}`,
        hour: Number(hour),
    };
}

function _addDaysToDayKey(dayKey: string, days: number): string {
    const date = new Date(`${dayKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function _comparePointsByTimestamp(a: ForecastPointDTO, b: ForecastPointDTO): number {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}
