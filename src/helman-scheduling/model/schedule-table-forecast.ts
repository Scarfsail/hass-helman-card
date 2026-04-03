import type { SlotForecastMap, SlotForecastPoint } from "./slot-forecast-model";
import type { ScheduleTableForecastMeta, ScheduleTableSectionModel } from "../schedule-table-types";
import type { ScheduleSlot } from "../schedule-types";

export function aggregateScheduleHourForecast({
    slots,
    slotForecastMap,
}: {
    slots: readonly ScheduleSlot[];
    slotForecastMap: SlotForecastMap;
}): SlotForecastPoint | null {
    if (slots.length === 0) {
        return null;
    }

    const lastPoint = slotForecastMap.points.get(slots[slots.length - 1].id);

    let solarTotal = 0;
    let hasSolar = false;
    let gridImportTotal = 0;
    let gridExportTotal = 0;
    let hasGrid = false;
    let priceTotal = 0;
    let priceCount = 0;

    for (const slot of slots) {
        const point = slotForecastMap.points.get(slot.id);
        if (!point) {
            continue;
        }

        if (point.solarWh !== null) {
            solarTotal += point.solarWh;
            hasSolar = true;
        }

        if (point.gridImportKwh !== null || point.gridExportKwh !== null) {
            gridImportTotal += point.gridImportKwh ?? 0;
            gridExportTotal += point.gridExportKwh ?? 0;
            hasGrid = true;
        }

        if (point.price !== null) {
            priceTotal += point.price;
            priceCount += 1;
        }
    }

    const forecastPoint: SlotForecastPoint = {
        socPct: lastPoint?.socPct ?? null,
        solarWh: hasSolar ? solarTotal : null,
        gridNetKwh: hasGrid ? gridExportTotal - gridImportTotal : null,
        gridImportKwh: hasGrid ? gridImportTotal : null,
        gridExportKwh: hasGrid ? gridExportTotal : null,
        price: priceCount > 0 ? priceTotal / priceCount : null,
    };

    return forecastPoint.socPct === null
        && forecastPoint.solarWh === null
        && forecastPoint.gridNetKwh === null
        && forecastPoint.gridImportKwh === null
        && forecastPoint.gridExportKwh === null
        && forecastPoint.price === null
        ? null
        : forecastPoint;
}

export function buildScheduleTableForecastMeta({
    slotForecastMap,
    sections,
}: {
    slotForecastMap: SlotForecastMap;
    sections: readonly ScheduleTableSectionModel[];
}): ScheduleTableForecastMeta {
    let solarMaxWh = 0;
    let gridMaxAbsKwh = 0;
    let priceMaxAbs = 0;

    const scanPoint = (point: SlotForecastPoint | null | undefined): void => {
        if (!point) {
            return;
        }

        if (point.solarWh !== null) {
            solarMaxWh = Math.max(solarMaxWh, point.solarWh);
        }

        if (point.gridNetKwh !== null) {
            gridMaxAbsKwh = Math.max(
                gridMaxAbsKwh,
                Math.abs(point.gridNetKwh),
                Math.abs(point.gridImportKwh ?? 0),
                Math.abs(point.gridExportKwh ?? 0),
            );
        }

        if (point.price !== null) {
            priceMaxAbs = Math.max(priceMaxAbs, Math.abs(point.price));
        }
    };

    for (const section of sections) {
        for (const row of section.rows) {
            if (row.kind === "detail") {
                continue;
            }

            scanPoint(row.forecast);
        }
    }

    return {
        batteryAvailable: slotForecastMap.batteryAvailable,
        solarAvailable: slotForecastMap.solarAvailable,
        gridAvailable: slotForecastMap.gridAvailable,
        priceAvailable: slotForecastMap.priceAvailable,
        priceDisplayUnit: slotForecastMap.priceDisplayUnit,
        solarMaxWh,
        gridMaxAbsKwh,
        priceMaxAbs,
    };
}
