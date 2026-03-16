import type { ForecastPayload, ForecastPointDTO } from "../helman-api";
import type {
    HelmanForecastSectionVisibility,
} from "./HelmanForecastCardConfig";
import {
    buildBatteryOverviewCardModel,
    type BatteryOverviewChartBarModel,
} from "../helman-simple/node-detail/battery-capacity-forecast-overview-model";
import {
    buildBatteryCapacityForecastModel,
    type BatteryCapacityForecastDay,
} from "../helman-simple/node-detail/battery-capacity-forecast-detail-model";
import {
    buildForecastDetailModel,
    type ForecastDetailDayModel,
} from "../helman-simple/node-detail/forecast-detail-model";
import {
    buildHouseForecastModel,
    type HouseForecastDay,
} from "../helman-simple/node-detail/house-forecast-detail-model";
import {
    buildHouseMiniChartBars,
    computeHouseMetricMax,
    type HouseMetricAccessors,
    type HouseMiniChartBarModel,
} from "../helman-simple/node-detail/house-forecast-chart-model";
import {
    getForecastPriceToneClass,
    type ForecastPriceToneClass,
} from "../helman-simple/node-detail/forecast-render-helpers";
import {
    isPastForecastTimestamp,
    normalizeForecastBarHeight,
    type ForecastChartBuildContext,
} from "../helman-simple/node-detail/forecast-chart-shared";

interface SolarPriceMiniChartScaleModel {
    maxSolarHourValue: number;
    maxAbsolutePriceValue: number;
    hasNegativePriceValues: boolean;
}

export interface UnifiedSolarMiniChartBarModel {
    heightPercent: number;
    isPast: boolean;
    isGap: boolean;
}

export interface UnifiedPriceMiniChartBarModel {
    heightPercent: number;
    offsetPercent: number;
    toneClass: ForecastPriceToneClass;
    isPast: boolean;
}

export interface UnifiedPriceOverviewChip {
    shortLabel: string;
    value: number;
    toneClass: ForecastPriceToneClass;
    muted: boolean;
}

export interface UnifiedSolarOverviewModel {
    summaryKwh: number;
    totalKwh: number | null;
    gaugeFillPercent: number;
    totalGaugeFillPercent: number;
    miniChartBars: UnifiedSolarMiniChartBarModel[];
}

export interface UnifiedBatteryOverviewModel {
    endSocPct: number;
    minSocPct: number;
    maxSocPct: number;
    gaugeFillPercent: number;
    miniChartBars: BatteryOverviewChartBarModel[];
    coverageEndsAt: string;
    coversDayEnd: boolean;
}

export interface UnifiedHouseOverviewModel {
    baselineDayKwh: number;
    deferrableDayKwh: number;
    gaugeFillPercent: number;
    miniChartBars: HouseMiniChartBarModel[];
}

export interface UnifiedPriceOverviewModel {
    currentPrice: number | null;
    priceMin: number | null;
    priceMax: number | null;
    chips: UnifiedPriceOverviewChip[];
    miniChartBars: UnifiedPriceMiniChartBarModel[];
    hasNegativeValues: boolean;
}

export interface UnifiedForecastDayModel {
    dayKey: string;
    isToday: boolean;
    isTomorrow: boolean;
    solarPriceDay: ForecastDetailDayModel | null;
    batteryDay: BatteryCapacityForecastDay | null;
    houseDay: HouseForecastDay | null;
    solar: UnifiedSolarOverviewModel | null;
    battery: UnifiedBatteryOverviewModel | null;
    house: UnifiedHouseOverviewModel | null;
    price: UnifiedPriceOverviewModel | null;
}

export interface UnifiedForecastModel {
    days: UnifiedForecastDayModel[];
    visibleSections: HelmanForecastSectionVisibility;
}

const HOUSE_BASELINE_ACCESSORS: HouseMetricAccessors = {
    getHourValue: (hour) => hour.baselineKwh,
    getLowerValue: (hour) => hour.baselineLowerKwh,
    getUpperValue: (hour) => hour.baselineUpperKwh,
};

const EMPTY_FORECAST_MODEL: UnifiedForecastModel = {
    days: [],
    visibleSections: {
        solar: false,
        battery: false,
        house: false,
        price: false,
    },
};

export function buildUnifiedForecastModel({
    forecast,
    chartContext,
    sectionVisibility,
    remainingTodayKwhOverride,
    now = new Date(),
}: {
    forecast: ForecastPayload | null;
    chartContext: ForecastChartBuildContext;
    sectionVisibility: HelmanForecastSectionVisibility;
    remainingTodayKwhOverride?: number | null;
    now?: Date;
}): UnifiedForecastModel {
    if (forecast === null) {
        return EMPTY_FORECAST_MODEL;
    }

    const solarPriceDays = buildForecastDetailModel({
        solarForecast: forecast.solar,
        gridForecast: forecast.grid,
        timeZone: chartContext.timeZone,
        remainingTodayKwhOverride,
        now,
    });
    const batteryDays = buildBatteryCapacityForecastModel({
        actualHistory: forecast.battery_capacity.actualHistory,
        series: forecast.battery_capacity.series,
        currentSoc: forecast.battery_capacity.currentSoc,
        startedAt: forecast.battery_capacity.startedAt,
        timeZone: chartContext.timeZone,
        now,
    });
    const houseDays = buildHouseForecastModel({
        actualHistory: forecast.house_consumption.actualHistory,
        currentHour: forecast.house_consumption.currentHour ?? null,
        series: forecast.house_consumption.series,
        timeZone: chartContext.timeZone,
        now,
    });

    const solarPriceScale = _buildSolarPriceMiniChartScaleModel(solarPriceDays);
    const maxSolarGaugeValueKwh = _getMaxSolarGaugeValueKwh(solarPriceDays);
    const maxHouseGaugeValueKwh = Math.max(...houseDays.map((day) => day.baselineDayKwh), 0);
    const maxHouseMiniChartValue = computeHouseMetricMax(houseDays, HOUSE_BASELINE_ACCESSORS);

    const solarPriceDaysByKey = new Map(solarPriceDays.map((day) => [day.dayKey, day]));
    const batteryDaysByKey = new Map(batteryDays.map((day) => [day.dayKey, day]));
    const houseDaysByKey = new Map(houseDays.map((day) => [day.dayKey, day]));

    const days = Array.from(
        new Set([
            ...solarPriceDaysByKey.keys(),
            ...batteryDaysByKey.keys(),
            ...houseDaysByKey.keys(),
        ]),
    )
        .sort()
        .map((dayKey) => {
            const solarPriceDay = solarPriceDaysByKey.get(dayKey) ?? null;
            const batteryDay = batteryDaysByKey.get(dayKey) ?? null;
            const houseDay = houseDaysByKey.get(dayKey) ?? null;
            const isToday = solarPriceDay?.isToday ?? batteryDay?.isToday ?? houseDay?.isToday ?? false;
            const isTomorrow = solarPriceDay?.isTomorrow ?? batteryDay?.isTomorrow ?? houseDay?.isTomorrow ?? false;
            const solar = sectionVisibility.solar && solarPriceDay !== null && _hasSolarOverview(solarPriceDay)
                ? _buildSolarOverviewModel(solarPriceDay, solarPriceScale, chartContext, maxSolarGaugeValueKwh)
                : null;
            const battery = sectionVisibility.battery && batteryDay !== null
                ? _buildBatteryOverviewModel(batteryDay, chartContext)
                : null;
            const house = sectionVisibility.house && houseDay !== null
                ? _buildHouseOverviewModel(houseDay, chartContext, maxHouseGaugeValueKwh, maxHouseMiniChartValue)
                : null;
            const price = sectionVisibility.price && solarPriceDay !== null
                ? _buildPriceOverviewModel(solarPriceDay, solarPriceScale, chartContext)
                : null;

            if (solar === null && battery === null && house === null && price === null) {
                return null;
            }

            return {
                dayKey,
                isToday,
                isTomorrow,
                solarPriceDay,
                batteryDay,
                houseDay,
                solar,
                battery,
                house,
                price,
            } satisfies UnifiedForecastDayModel;
        })
        .filter((day): day is UnifiedForecastDayModel => day !== null);

    return {
        days,
        visibleSections: {
            solar: days.some((day) => day.solar !== null),
            battery: days.some((day) => day.battery !== null),
            house: days.some((day) => day.house !== null),
            price: days.some((day) => day.price !== null),
        },
    };
}

function _buildSolarOverviewModel(
    day: ForecastDetailDayModel,
    scale: SolarPriceMiniChartScaleModel,
    chartContext: ForecastChartBuildContext,
    maxSolarGaugeValueKwh: number,
): UnifiedSolarOverviewModel {
    return {
        summaryKwh: day.solarSummaryKwh!,
        totalKwh: day.solarTotalKwh,
        gaugeFillPercent: _normalizeGaugeFill(_getRemainingSolarGaugeValueKwh(day), maxSolarGaugeValueKwh),
        totalGaugeFillPercent: _normalizeGaugeFill(_getComparableSolarGaugeValueKwh(day), maxSolarGaugeValueKwh),
        miniChartBars: day.solarHours.map((point) => ({
            heightPercent: normalizeForecastBarHeight(
                Math.max(point.value ?? 0, 0),
                scale.maxSolarHourValue,
                100,
            ),
            isPast: isPastForecastTimestamp(point.timestamp, day.isToday, chartContext),
            isGap: point.source === "gap",
        })),
    };
}

function _buildBatteryOverviewModel(
    day: BatteryCapacityForecastDay,
    chartContext: ForecastChartBuildContext,
): UnifiedBatteryOverviewModel {
    const overview = buildBatteryOverviewCardModel({ day, context: chartContext });
    return {
        endSocPct: day.endSocPct,
        minSocPct: day.minSocPct,
        maxSocPct: day.maxSocPct,
        gaugeFillPercent: overview.gaugeFillPercent,
        miniChartBars: overview.miniChartBars,
        coverageEndsAt: day.coverageEndsAt,
        coversDayEnd: day.coversDayEnd,
    };
}

function _buildHouseOverviewModel(
    day: HouseForecastDay,
    chartContext: ForecastChartBuildContext,
    maxHouseGaugeValueKwh: number,
    maxHouseMiniChartValue: number,
): UnifiedHouseOverviewModel {
    return {
        baselineDayKwh: day.baselineDayKwh,
        deferrableDayKwh: day.deferrableDayKwh,
        gaugeFillPercent: _normalizeGaugeFill(day.baselineDayKwh, maxHouseGaugeValueKwh),
        miniChartBars: buildHouseMiniChartBars(
            day,
            HOUSE_BASELINE_ACCESSORS,
            maxHouseMiniChartValue,
            chartContext,
        ),
    };
}

function _buildPriceOverviewModel(
    day: ForecastDetailDayModel,
    scale: SolarPriceMiniChartScaleModel,
    chartContext: ForecastChartBuildContext,
): UnifiedPriceOverviewModel | null {
    const chips = _buildPriceOverviewChips(day);
    const miniChartBars = day.priceHours.map((point) => {
        const heightPercent = normalizeForecastBarHeight(
            Math.abs(point.value),
            scale.maxAbsolutePriceValue,
            scale.hasNegativePriceValues ? 50 : 100,
        );

        return {
            heightPercent,
            offsetPercent: scale.hasNegativePriceValues && point.value < 0
                ? Math.max(0, 50 - heightPercent)
                : scale.hasNegativePriceValues
                    ? 50
                    : 0,
            toneClass: getForecastPriceToneClass(point.value),
            isPast: isPastForecastTimestamp(point.timestamp, day.isToday, chartContext),
        } satisfies UnifiedPriceMiniChartBarModel;
    });

    if (chips.length === 0 && miniChartBars.length === 0) {
        return null;
    }

    return {
        currentPrice: day.currentPrice,
        priceMin: day.priceMin,
        priceMax: day.priceMax,
        chips,
        miniChartBars,
        hasNegativeValues: scale.hasNegativePriceValues,
    };
}

function _buildPriceOverviewChips(day: ForecastDetailDayModel): UnifiedPriceOverviewChip[] {
    const hasCurrentPrice = day.isToday && day.currentPrice !== null;
    const chips: UnifiedPriceOverviewChip[] = [];

    if (hasCurrentPrice && day.currentPrice !== null) {
        chips.push({
            shortLabel: "",
            value: day.currentPrice,
            toneClass: getForecastPriceToneClass(day.currentPrice),
            muted: false,
        });
    }

    if (day.priceMin !== null) {
        chips.push({
            shortLabel: "↓",
            value: day.priceMin,
            toneClass: getForecastPriceToneClass(day.priceMin),
            muted: hasCurrentPrice,
        });
    }

    if (day.priceMax !== null) {
        chips.push({
            shortLabel: "↑",
            value: day.priceMax,
            toneClass: getForecastPriceToneClass(day.priceMax),
            muted: hasCurrentPrice,
        });
    }

    return chips;
}

function _buildSolarPriceMiniChartScaleModel(days: ForecastDetailDayModel[]): SolarPriceMiniChartScaleModel {
    return {
        maxSolarHourValue: Math.max(
            ...days.flatMap((day) => day.solarHours.map((point) => Math.max(point.value ?? 0, 0))),
            0,
        ),
        maxAbsolutePriceValue: Math.max(
            ...days.flatMap((day) => day.priceHours.map((point) => Math.abs(point.value))),
            0,
        ),
        hasNegativePriceValues: days.some((day) => day.priceHours.some((point) => point.value < 0)),
    };
}

function _hasSolarOverview(day: ForecastDetailDayModel): boolean {
    return day.hasSolarData && day.solarSummaryKwh !== null;
}

function _getMaxSolarGaugeValueKwh(days: ForecastDetailDayModel[]): number {
    return days.reduce((maxValue, day) => {
        const comparableSolarKwh = _getComparableSolarGaugeValueKwh(day);
        if (comparableSolarKwh === null) {
            return maxValue;
        }

        return Math.max(maxValue, comparableSolarKwh);
    }, 0);
}

function _getComparableSolarGaugeValueKwh(day: ForecastDetailDayModel): number | null {
    return day.solarTotalKwh ?? day.solarSummaryKwh;
}

function _getRemainingSolarGaugeValueKwh(day: ForecastDetailDayModel): number | null {
    if (day.solarSummaryKwh === null) {
        return null;
    }

    if (day.solarTotalKwh === null) {
        return day.solarSummaryKwh;
    }

    return Math.max(0, Math.min(day.solarSummaryKwh, day.solarTotalKwh));
}

function _normalizeGaugeFill(value: number | null, maxValue: number): number {
    if (value === null || maxValue <= 0) {
        return 0;
    }

    return Math.min((value / maxValue) * 100, 100);
}
