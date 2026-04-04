import type { SlotForecastMap } from "./slot-forecast-model";
import type { ScheduleApplianceMetadata } from "./schedule-appliance-metadata";
import { buildScheduleTableRows } from "./schedule-hour-bucket-builder";
import { aggregateScheduleDayForecast, buildScheduleTableForecastMeta } from "./schedule-table-forecast";
import { formatScheduleDayLabel } from "./schedule-time";
import {
    SCHEDULE_TABLE_COLUMNS,
    type ScheduleTableModel,
    type ScheduleTableSectionModel,
} from "../schedule-table-types";
import type { ScheduleSlot } from "../schedule-types";

export function buildScheduleTableModel({
    slots,
    appliances,
    slotForecastMap,
    expandedHourKeys,
    locale,
    timeZone,
    currentDayKey,
    todayLabel,
    tomorrowLabel,
}: {
    slots: readonly ScheduleSlot[];
    appliances: readonly ScheduleApplianceMetadata[];
    slotForecastMap: SlotForecastMap;
    expandedHourKeys: readonly string[];
    locale: string;
    timeZone: string;
    currentDayKey: string | null;
    todayLabel: string;
    tomorrowLabel: string;
}): ScheduleTableModel {
    const daySections: Array<{
        dayKey: string;
        dayLabel: string;
        slots: ScheduleSlot[];
    }> = [];
    let currentSection: (typeof daySections)[number] | null = null;
    const expandedHourKeySet = new Set(expandedHourKeys);

    for (const slot of slots) {
        if (currentSection === null || currentSection.dayKey !== slot.dayKey) {
            currentSection = {
                dayKey: slot.dayKey,
                dayLabel: formatScheduleDayLabel({
                    dayKey: slot.dayKey,
                    currentDayKey,
                    locale,
                    todayLabel,
                    tomorrowLabel,
                }),
                slots: [],
            };
            daySections.push(currentSection);
        }

        currentSection.slots.push(slot);
    }

    const sections: ScheduleTableSectionModel[] = daySections.map((section) => ({
        dayKey: section.dayKey,
        dayLabel: section.dayLabel,
        dayAggregate: aggregateScheduleDayForecast({
            slots: section.slots,
            slotForecastMap,
        }),
        rows: buildScheduleTableRows({
            slots: section.slots,
            appliances,
            slotForecastMap,
            expandedHourKeys: expandedHourKeySet,
            locale,
            timeZone,
        }),
    }));

    return {
        columns: SCHEDULE_TABLE_COLUMNS,
        sections,
        forecast: buildScheduleTableForecastMeta({
            slotForecastMap,
            sections,
            slots,
            timeZone,
        }),
    };
}
