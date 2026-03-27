import type { SchedulePayload } from "../../helman-api";
import type {
    NormalizedScheduleModel,
    ScheduleAction,
    ScheduleRuntime,
    ScheduleSlot,
} from "../schedule-types";
import {
    getScheduleDayKey,
    getScheduleSlotDayKey,
    getScheduleTimeRangeLabels,
    resolveScheduleSlotBoundaries,
} from "./schedule-time";

export function normalizeSchedulePayload({
    schedule,
    timeZone,
    locale,
    now = new Date(),
}: {
    schedule: SchedulePayload | null;
    timeZone: string;
    locale: string;
    now?: Date;
}): NormalizedScheduleModel {
    if (schedule === null) {
        return {
            slots: [],
            currentSlotId: null,
            currentDayKey: null,
        };
    }

    const nowMs = now.getTime();
    const slotBoundaries = resolveScheduleSlotBoundaries(schedule.slots.map((slot) => slot.id));
    const slotBoundariesById = new Map(slotBoundaries.map((slot) => [slot.id, slot]));
    const normalizedSlots = schedule.slots
        .map((slot) => {
            const boundary = slotBoundariesById.get(slot.id);
            if (boundary === undefined) {
                throw new Error(`helman-scheduling: missing derived timing for slot "${slot.id}"`);
            }

            return _normalizeSlot({
                slot,
                boundary,
                timeZone,
                locale,
            });
        })
        .sort((left, right) => left.startMs - right.startMs)
        .map((slot, index) => ({
            ...slot,
            index,
        }));

    const resolvedCurrentSlotId = normalizedSlots.find((slot) =>
        slot.endMs !== null && slot.startMs <= nowMs && nowMs < slot.endMs
    )?.id
        ?? normalizedSlots.find((slot) => slot.runtime !== null)?.id
        ?? null;

    const slots = normalizedSlots.map((slot) => ({
        ...slot,
        runtime: slot.id === resolvedCurrentSlotId ? slot.runtime : null,
        isCurrent: slot.id === resolvedCurrentSlotId,
    }));

    const currentSlot = resolvedCurrentSlotId !== null
        ? slots.find((slot) => slot.id === resolvedCurrentSlotId) ?? null
        : null;

    return {
        slots,
        currentSlotId: currentSlot?.id ?? null,
        currentDayKey: getScheduleDayKey(now, timeZone),
    };
}

function _normalizeSlot({
    slot,
    boundary,
    timeZone,
    locale,
}: {
    slot: SchedulePayload["slots"][number];
    boundary: { startMs: number; endMs: number | null };
    timeZone: string;
    locale: string;
}): Omit<ScheduleSlot, "index" | "isCurrent"> {
    const dayKey = getScheduleSlotDayKey(slot.id, timeZone);
    if (dayKey === null) {
        throw new Error(`helman-scheduling: failed to derive day key for slot "${slot.id}"`);
    }

    const labels = getScheduleTimeRangeLabels({
        startMs: boundary.startMs,
        endMs: boundary.endMs,
        locale,
        timeZone,
    });
    return {
        id: slot.id,
        startMs: boundary.startMs,
        endMs: boundary.endMs,
        dayKey,
        timeLabel: labels.timeLabel,
        endLabel: labels.endLabel,
        rangeLabel: labels.rangeLabel,
        action: _cloneAction(slot.action),
        runtime: _cloneRuntime(slot.runtime),
    };
}

function _cloneAction(action: ScheduleAction): ScheduleAction {
    return action.targetSoc === undefined
        ? { kind: action.kind }
        : { kind: action.kind, targetSoc: action.targetSoc };
}

function _cloneRuntime(runtime: ScheduleRuntime | undefined): ScheduleRuntime | null {
    if (runtime === undefined) {
        return null;
    }

    return {
        status: runtime.status,
        reason: runtime.reason,
        errorCode: runtime.errorCode,
        executedAction: runtime.executedAction ? _cloneAction(runtime.executedAction) : undefined,
    };
}
