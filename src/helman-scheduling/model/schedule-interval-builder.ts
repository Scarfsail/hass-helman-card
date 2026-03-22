import type {
    ScheduleDaySectionModel,
    ScheduleIntervalRowModel,
    ScheduleSlot,
} from "../schedule-types";
import { areScheduleActionsEqual } from "../schedule-types";
import { formatScheduleDayLabel } from "./schedule-time";

export function buildScheduleDaySections({
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
}): ScheduleDaySectionModel[] {
    const sections: ScheduleDaySectionModel[] = [];
    let currentSection: ScheduleDaySectionModel | null = null;
    let currentRowSlots: ScheduleSlot[] = [];

    const flushRow = (): void => {
        if (currentSection === null || currentRowSlots.length === 0) {
            return;
        }

        currentSection.rows.push(_buildIntervalRow(currentRowSlots));
        currentRowSlots = [];
    };

    for (const slot of slots) {
        if (currentSection === null || currentSection.dayKey !== slot.dayKey) {
            flushRow();
            currentSection = {
                dayKey: slot.dayKey,
                dayLabel: formatScheduleDayLabel({
                    dayKey: slot.dayKey,
                    currentDayKey,
                    locale,
                    todayLabel,
                    tomorrowLabel,
                }),
                rows: [],
            };
            sections.push(currentSection);
        }

        if (currentRowSlots.length === 0) {
            currentRowSlots = [slot];
            continue;
        }

        const previousSlot = currentRowSlots[currentRowSlots.length - 1];
        if (
            !areScheduleActionsEqual(previousSlot.action, slot.action)
            || previousSlot.endMs === null
            || previousSlot.endMs !== slot.startMs
        ) {
            flushRow();
            currentRowSlots = [slot];
            continue;
        }

        currentRowSlots.push(slot);
    }

    flushRow();
    return sections;
}

function _buildIntervalRow(slots: ScheduleSlot[]): ScheduleIntervalRowModel {
    const firstSlot = slots[0];
    const lastSlot = slots[slots.length - 1];
    const currentSlot = slots.find((slot) => slot.isCurrent) ?? null;

    return {
        id: `${firstSlot.id}__${lastSlot.id}`,
        dayKey: firstSlot.dayKey,
        startSlotId: firstSlot.id,
        endSlotId: lastSlot.id,
        startMs: firstSlot.startMs,
        endMs: lastSlot.endMs,
        timeRangeLabel: _buildIntervalTimeRangeLabel(firstSlot, lastSlot),
        action: firstSlot.action,
        slotCount: slots.length,
        slotIds: slots.map((slot) => slot.id),
        slots: [...slots],
        containsCurrentSlot: currentSlot !== null,
        currentSlotId: currentSlot?.id ?? null,
        accessory: null,
    };
}

function _buildIntervalTimeRangeLabel(firstSlot: ScheduleSlot, lastSlot: ScheduleSlot): string {
    if (firstSlot.id === lastSlot.id) {
        return firstSlot.rangeLabel;
    }

    if (lastSlot.endLabel !== null) {
        return `${firstSlot.timeLabel}–${lastSlot.endLabel}`;
    }

    return `${firstSlot.timeLabel}–${lastSlot.timeLabel}+`;
}
