import type { ForecastPointDTO } from "../helman-api";
import type {
    BatteryCapacityForecastDay,
    BatteryCapacityForecastSlot,
} from "../helman-simple/node-detail/battery-capacity-forecast-detail-model";
import {
    buildBatteryDetailChartModel,
    type BatteryDetailChartModel,
} from "../helman-simple/node-detail/battery-capacity-forecast-chart-model";
import type {
    ForecastDetailDayModel,
    ForecastSolarHourPoint,
} from "../helman-simple/node-detail/forecast-detail-model";
import {
    type ForecastChartBuildContext,
    normalizeForecastBarHeight,
} from "../helman-simple/node-detail/forecast-chart-shared";
import type {
    HouseForecastDay,
    HouseForecastHour,
} from "../helman-simple/node-detail/house-forecast-detail-model";
import {
    buildHouseDeferrableBreakdownRows,
    buildHouseDetailColumns,
    type HouseBreakdownRowModel,
    type HouseDetailColumnModel,
} from "../helman-simple/node-detail/house-forecast-chart-model";
import {
    getForecastPriceToneClass,
    type ForecastPriceToneClass,
} from "../helman-simple/node-detail/forecast-render-helpers";
import {
    alignPointsToSharedAxis,
    buildSharedForecastAxis,
    projectIntervalsToSharedAxis,
    type SharedForecastAxis,
} from "../helman-simple/node-detail/shared-forecast-axis";
import type { UnifiedForecastDayModel } from "./unified-forecast-model";

interface UnifiedSolarPointProjection {
    columnTimestamp: string;
    isPast: boolean;
    hourLabel: string | null;
    point: ForecastSolarHourPoint | null;
}

interface UnifiedPricePointProjection {
    columnTimestamp: string;
    isPast: boolean;
    hourLabel: string | null;
    point: ForecastPointDTO | null;
}

export interface UnifiedSolarDetailColumnModel {
    timestamp: string;
    hourLabel: string | null;
    isPast: boolean;
    isGap: boolean;
    source: ForecastSolarHourPoint["source"] | "gap";
    value: number | null;
    heightPercent: number;
    isMax: boolean;
}

export interface UnifiedPriceDetailColumnModel {
    timestamp: string;
    hourLabel: string | null;
    isPast: boolean;
    isGap: boolean;
    value: number | null;
    heightPercent: number;
    offsetPercent: number;
    toneClass: ForecastPriceToneClass;
    isMin: boolean;
    isMax: boolean;
}

export interface UnifiedSolarDetailRowModel {
    columns: UnifiedSolarDetailColumnModel[];
}

export interface UnifiedPriceDetailRowModel {
    columns: UnifiedPriceDetailColumnModel[];
    hasNegativeValues: boolean;
    minColumnIndex: number;
    maxColumnIndex: number;
}

export interface UnifiedHouseDetailModel {
    columns: HouseDetailColumnModel[];
    breakdownRows: HouseBreakdownRowModel[];
}

export interface UnifiedForecastDetailModel {
    axis: SharedForecastAxis;
    solar: UnifiedSolarDetailRowModel | null;
    price: UnifiedPriceDetailRowModel | null;
    battery: BatteryDetailChartModel | null;
    house: UnifiedHouseDetailModel | null;
}

export function buildUnifiedForecastDetailModel({
    day,
    chartContext,
    batteryMinSoc,
    batteryMaxSoc,
}: {
    day: UnifiedForecastDayModel;
    chartContext: ForecastChartBuildContext;
    batteryMinSoc: number | null;
    batteryMaxSoc: number | null;
}): UnifiedForecastDetailModel {
    const axis = buildSharedForecastAxis({
        dayKey: day.dayKey,
        chartContext,
        referenceTimestamps: _collectReferenceTimestamps(day),
    });

    return {
        axis,
        solar: day.solar !== null && day.solarPriceDay !== null
            ? _buildSolarDetailRow(day.solarPriceDay, axis, chartContext.timeZone, day.dayKey)
            : null,
        price: day.price !== null && day.solarPriceDay !== null
            ? _buildPriceDetailRow(day.solarPriceDay, axis, chartContext.timeZone, day.dayKey)
            : null,
        battery: day.battery !== null && day.batteryDay !== null
            ? buildBatteryDetailChartModel({
                day: _alignBatteryDayToAxis(day.batteryDay, axis, chartContext.timeZone),
                minSoc: batteryMinSoc,
                maxSoc: batteryMaxSoc,
                context: chartContext,
            })
            : null,
        house: day.house !== null && day.houseDay !== null
            ? _buildHouseDetailModel(day.houseDay, axis, chartContext)
            : null,
    };
}

function _collectReferenceTimestamps(day: UnifiedForecastDayModel): string[] {
    const timestamps: string[] = [];

    if (day.solar !== null && day.solarPriceDay !== null) {
        timestamps.push(...day.solarPriceDay.solarHours.map((point) => point.timestamp));
    }

    if (day.price !== null && day.solarPriceDay !== null) {
        timestamps.push(...day.solarPriceDay.priceHours.map((point) => point.timestamp));
    }

    if (day.battery !== null && day.batteryDay !== null) {
        timestamps.push(...day.batteryDay.slots.map((slot) => slot.timestamp));
    }

    if (day.house !== null && day.houseDay !== null) {
        timestamps.push(...day.houseDay.hours.map((hour) => hour.timestamp));
    }

    return timestamps;
}

function _buildSolarDetailRow(
    day: ForecastDetailDayModel,
    axis: SharedForecastAxis,
    timeZone: string,
    dayKey: string,
): UnifiedSolarDetailRowModel {
    const projections: UnifiedSolarPointProjection[] = alignPointsToSharedAxis(
        axis,
        day.solarHours,
        timeZone,
        dayKey,
    ).map((projection) => ({
        columnTimestamp: projection.column.timestamp,
        isPast: projection.column.isPast,
        hourLabel: projection.column.hourLabel,
        point: projection.entry,
    }));
    const maxValue = Math.max(...projections.map((projection) => Math.max(projection.point?.value ?? 0, 0)), 0);
    let maxColumnIndex = -1;
    let highlightedValue = 0;
    for (let index = 0; index < projections.length; index++) {
        const value = Math.max(projections[index].point?.value ?? 0, 0);
        if (value > highlightedValue) {
            highlightedValue = value;
            maxColumnIndex = index;
        }
    }

    return {
        columns: projections.map((projection, index) => ({
            timestamp: projection.point?.timestamp ?? projection.columnTimestamp,
            hourLabel: projection.hourLabel,
            isPast: projection.isPast,
            isGap: projection.point === null || projection.point.source === "gap",
            source: projection.point?.source ?? "gap",
            value: projection.point?.value ?? null,
            heightPercent: normalizeForecastBarHeight(
                Math.max(projection.point?.value ?? 0, 0),
                maxValue,
                78,
            ),
            isMax: index === maxColumnIndex && highlightedValue > 0,
        })),
    };
}

function _buildPriceDetailRow(
    day: ForecastDetailDayModel,
    axis: SharedForecastAxis,
    timeZone: string,
    dayKey: string,
): UnifiedPriceDetailRowModel {
    const projections: UnifiedPricePointProjection[] = alignPointsToSharedAxis(
        axis,
        day.priceHours,
        timeZone,
        dayKey,
    ).map((projection) => ({
        columnTimestamp: projection.column.timestamp,
        isPast: projection.column.isPast,
        hourLabel: projection.column.hourLabel,
        point: projection.entry,
    }));
    const hasNegativeValues = projections.some((projection) => (projection.point?.value ?? 0) < 0);
    const maxAbsoluteValue = Math.max(...projections.map((projection) => Math.abs(projection.point?.value ?? 0)), 0);
    let minColumnIndex = -1;
    let maxColumnIndex = -1;
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < projections.length; index++) {
        const value = projections[index].point?.value;
        if (value === undefined) {
            continue;
        }
        if (value < minValue) {
            minValue = value;
            minColumnIndex = index;
        }
        if (value > maxValue) {
            maxValue = value;
            maxColumnIndex = index;
        }
    }

    return {
        columns: projections.map((projection, index) => {
            const value = projection.point?.value ?? null;
            const heightPercent = normalizeForecastBarHeight(
                Math.abs(value ?? 0),
                maxAbsoluteValue,
                hasNegativeValues ? 34 : 78,
            );
            return {
                timestamp: projection.point?.timestamp ?? projection.columnTimestamp,
                hourLabel: projection.hourLabel,
                isPast: projection.isPast,
                isGap: projection.point === null,
                value,
                heightPercent,
                offsetPercent: value === null
                    ? 0
                    : hasNegativeValues && value < 0
                        ? Math.max(0, 50 - heightPercent)
                        : hasNegativeValues
                            ? 50
                            : 0,
                toneClass: getForecastPriceToneClass(value ?? 0),
                isMin: index === minColumnIndex && Number.isFinite(minValue),
                isMax: index === maxColumnIndex && Number.isFinite(maxValue),
            } satisfies UnifiedPriceDetailColumnModel;
        }),
        hasNegativeValues,
        minColumnIndex,
        maxColumnIndex,
    };
}

function _alignBatteryDayToAxis(
    day: BatteryCapacityForecastDay,
    axis: SharedForecastAxis,
    timeZone: string,
): BatteryCapacityForecastDay {
    const projections = projectIntervalsToSharedAxis(axis, day.slots, timeZone, day.dayKey);

    return {
        ...day,
        slots: projections.map((projection, index) => projection.entry ?? _buildGapBatterySlot(
            projection.column.timestamp,
            axis.columns[index + 1]?.timestamp ?? null,
        )),
    };
}

function _buildGapBatterySlot(
    timestamp: string,
    nextTimestamp: string | null,
): BatteryCapacityForecastSlot {
    return {
        source: "gap",
        timestamp,
        endsAt: nextTimestamp ?? _addHour(timestamp),
        durationHours: 1,
        startSocPct: null,
        socPct: null,
        chargedKwh: 0,
        dischargedKwh: 0,
        importedFromGridKwh: 0,
        exportedToGridKwh: 0,
        hitMinSoc: false,
        hitMaxSoc: false,
        limitedByChargePower: false,
        limitedByDischargePower: false,
    };
}

function _buildHouseDetailModel(
    day: HouseForecastDay,
    axis: SharedForecastAxis,
    chartContext: ForecastChartBuildContext,
): UnifiedHouseDetailModel {
    const alignedDay = _alignHouseDayToAxis(day, axis, chartContext.timeZone);

    return {
        columns: buildHouseDetailColumns(
            alignedDay,
            {
                getHourValue: (hour) => hour.baselineKwh,
                getLowerValue: (hour) => hour.baselineLowerKwh,
                getUpperValue: (hour) => hour.baselineUpperKwh,
            },
            chartContext,
        ),
        breakdownRows: buildHouseDeferrableBreakdownRows(alignedDay, chartContext),
    };
}

function _alignHouseDayToAxis(
    day: HouseForecastDay,
    axis: SharedForecastAxis,
    timeZone: string,
): HouseForecastDay {
    const projections = alignPointsToSharedAxis(axis, day.hours, timeZone, day.dayKey);

    return {
        ...day,
        hours: projections.map((projection) => projection.entry ?? _buildGapHouseHour(projection.column.timestamp)),
    };
}

function _buildGapHouseHour(timestamp: string): HouseForecastHour {
    return {
        timestamp,
        baselineKwh: null,
        baselineLowerKwh: null,
        baselineUpperKwh: null,
        deferrableKwh: null,
        deferrableLowerKwh: null,
        deferrableUpperKwh: null,
        consumers: [],
        source: "gap",
    };
}

function _addHour(timestamp: string): string {
    const parsed = new Date(timestamp).getTime();
    if (Number.isNaN(parsed)) {
        return timestamp;
    }

    return new Date(parsed + 3600000).toISOString();
}
