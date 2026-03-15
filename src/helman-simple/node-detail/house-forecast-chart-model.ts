import type { HouseForecastDay, HouseForecastHour } from "./house-forecast-detail-model";
import {
    buildSparseHourLabelMap,
    isPastForecastTimestamp,
    normalizeForecastBarHeight,
    type ForecastChartBuildContext,
} from "./forecast-chart-shared";

export interface HouseMetricAccessors {
    getHourValue(hour: HouseForecastHour): number;
    getLowerValue(hour: HouseForecastHour): number;
    getUpperValue(hour: HouseForecastHour): number;
}

export type HouseChartBuildContext = ForecastChartBuildContext;

export interface HouseMiniChartBarModel {
    heightPercent: number;
    isPast: boolean;
}

export interface HouseDetailColumnModel {
    timestamp: string;
    valueKwh: number;
    heightPercent: number;
    bandLowerPercent: number;
    bandUpperPercent: number;
    hourLabel: string | null;
    isMax: boolean;
    isMin: boolean;
    isPast: boolean;
}

export interface HouseBreakdownRowModel {
    entityId: string;
    label: string;
    columns: HouseDetailColumnModel[];
}

interface BandedPoint {
    timestamp: string;
    valueKwh: number;
    lowerKwh: number;
    upperKwh: number;
    isPast: boolean;
}

const DETAIL_MAX_BAR_HEIGHT = 78;
const MINI_CHART_MAX_BAR_HEIGHT = 100;

export function computeHouseMetricMax(
    days: HouseForecastDay[],
    accessors: HouseMetricAccessors,
): number {
    return Math.max(
        ...days.flatMap((day) => day.hours.map((hour) => accessors.getHourValue(hour))),
        0,
    );
}

export function buildHouseMiniChartBars(
    day: HouseForecastDay,
    accessors: HouseMetricAccessors,
    maxValue: number,
    context: HouseChartBuildContext,
): HouseMiniChartBarModel[] {
    return day.hours.map((hour) => ({
        heightPercent: normalizeForecastBarHeight(
            Math.max(accessors.getHourValue(hour), 0),
            maxValue,
            MINI_CHART_MAX_BAR_HEIGHT,
        ),
        isPast: isPastForecastTimestamp(hour.timestamp, day.isToday, context),
    }));
}

export function buildHouseDetailColumns(
    day: HouseForecastDay,
    accessors: HouseMetricAccessors,
    context: HouseChartBuildContext,
): HouseDetailColumnModel[] {
    const points = day.hours.map((hour) => ({
        timestamp: hour.timestamp,
        valueKwh: accessors.getHourValue(hour),
        lowerKwh: accessors.getLowerValue(hour),
        upperKwh: accessors.getUpperValue(hour),
        isPast: isPastForecastTimestamp(hour.timestamp, day.isToday, context),
    }));
    const maxValue = Math.max(
        ...points.map((point) => Math.max(point.valueKwh, point.upperKwh, 0)),
        0,
    );

    return _buildBandedColumns(points, maxValue, context);
}

export function buildHouseDeferrableBreakdownRows(
    day: HouseForecastDay,
    context: HouseChartBuildContext,
): HouseBreakdownRowModel[] {
    if (day.hours.length === 0 || day.consumerDaySums.length === 0) {
        return [];
    }

    const maxValue = Math.max(
        ...day.hours.flatMap((hour) => day.consumerDaySums.map((consumer) => {
            const snapshot = hour.consumers.find((item) => item.entityId === consumer.entityId);
            return Math.max(snapshot?.valueKwh ?? 0, snapshot?.upperKwh ?? 0, 0);
        })),
        0,
    );

    return day.consumerDaySums.map((consumer) => {
        const points: BandedPoint[] = day.hours.map((hour) => {
            const snapshot = hour.consumers.find((item) => item.entityId === consumer.entityId);
            return {
                timestamp: hour.timestamp,
                valueKwh: snapshot?.valueKwh ?? 0,
                lowerKwh: snapshot?.lowerKwh ?? 0,
                upperKwh: snapshot?.upperKwh ?? 0,
                isPast: isPastForecastTimestamp(hour.timestamp, day.isToday, context),
            };
        });

        return {
            entityId: consumer.entityId,
            label: consumer.label,
            columns: _buildBandedColumns(points, maxValue, context),
        };
    });
}

function _buildBandedColumns(
    points: BandedPoint[],
    maxValue: number,
    context: HouseChartBuildContext,
): HouseDetailColumnModel[] {
    if (points.length === 0) {
        return [];
    }

    const sparseLabels = buildSparseHourLabelMap(
        points.map((point) => point.timestamp),
        context,
    );

    let maxIndex = 0;
    let maxKwh = 0;
    let minIndex = -1;
    let minKwh = Number.POSITIVE_INFINITY;
    for (let index = 0; index < points.length; index++) {
        const valueKwh = points[index].valueKwh;
        if (valueKwh > maxKwh) {
            maxKwh = valueKwh;
            maxIndex = index;
        }
        if (valueKwh > 0 && valueKwh < minKwh) {
            minKwh = valueKwh;
            minIndex = index;
        }
    }

    return points.map((point, index) => ({
        timestamp: point.timestamp,
        valueKwh: point.valueKwh,
        heightPercent: normalizeForecastBarHeight(
            Math.max(point.valueKwh, 0),
            maxValue,
            DETAIL_MAX_BAR_HEIGHT,
        ),
        bandLowerPercent: maxValue > 0
            ? Math.min((Math.max(point.lowerKwh, 0) / maxValue) * DETAIL_MAX_BAR_HEIGHT, DETAIL_MAX_BAR_HEIGHT)
            : 0,
        bandUpperPercent: maxValue > 0
            ? Math.min((Math.max(point.upperKwh, 0) / maxValue) * DETAIL_MAX_BAR_HEIGHT, DETAIL_MAX_BAR_HEIGHT)
            : 0,
        hourLabel: sparseLabels.get(index) ?? null,
        isMax: index === maxIndex && maxKwh > 0,
        isMin: index === minIndex && Number.isFinite(minKwh),
        isPast: point.isPast,
    }));
}
