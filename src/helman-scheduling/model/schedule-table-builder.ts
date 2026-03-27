import type { ScheduleSlot, ScheduleTableSectionModel } from "../schedule-types";
import { formatScheduleDayLabel } from "./schedule-time";

export function buildScheduleTableSections({
    slots,
    locale,
    currentDayKey,
    todayLabel,
    tomorrowLabel,
}: {
    slots: readonly ScheduleSlot[];
    locale: string;
    currentDayKey: string | null;
    todayLabel: string;
    tomorrowLabel: string;
}): ScheduleTableSectionModel[] {
    const sections: ScheduleTableSectionModel[] = [];
    let currentSection: ScheduleTableSectionModel | null = null;

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
            sections.push(currentSection);
        }

        currentSection.slots.push(slot);
    }

    return sections;
}
