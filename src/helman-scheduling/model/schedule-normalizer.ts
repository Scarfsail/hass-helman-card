import type { SchedulePayload } from "../../helman-api";
import type {
    NormalizedScheduleModel,
    ScheduleAction,
    ScheduleNowStripModel,
    ScheduleRuntime,
    ScheduleSlot,
} from "../schedule-types";
import {
    getScheduleSlotDayKey,
    getScheduleSlotLabels,
    getScheduleSlotStartMs,
    SCHEDULE_SLOT_DURATION_MS,
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
            now: null,
            currentSlotId: null,
            currentDayKey: null,
        };
    }

    const nowMs = now.getTime();
    const normalizedSlots = schedule.slots
        .map((slot) => _normalizeSlot(slot, timeZone, locale))
        .sort((left, right) => left.startMs - right.startMs)
        .map((slot, index) => ({
            ...slot,
            index,
        }));

    const resolvedCurrentSlotId = normalizedSlots.find((slot) => slot.startMs <= nowMs && nowMs < slot.endMs)?.id
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
        now: currentSlot ? _buildNowStripModel(currentSlot) : null,
        currentSlotId: currentSlot?.id ?? null,
        currentDayKey: currentSlot?.dayKey ?? null,
    };
}

function _normalizeSlot(
    slot: SchedulePayload["slots"][number],
    timeZone: string,
    locale: string,
): Omit<ScheduleSlot, "index" | "isCurrent"> {
    const startMs = getScheduleSlotStartMs(slot.id);
    if (startMs === null) {
        throw new Error(`helman-scheduling: invalid schedule slot id "${slot.id}"`);
    }

    const dayKey = getScheduleSlotDayKey(slot.id, timeZone);
    if (dayKey === null) {
        throw new Error(`helman-scheduling: failed to derive day key for slot "${slot.id}"`);
    }

    const labels = getScheduleSlotLabels(slot.id, locale, timeZone);
    return {
        id: slot.id,
        startMs,
        endMs: startMs + SCHEDULE_SLOT_DURATION_MS,
        dayKey,
        timeLabel: labels.timeLabel,
        endLabel: labels.endLabel,
        rangeLabel: labels.rangeLabel,
        action: _cloneAction(slot.action),
        runtime: _cloneRuntime(slot.runtime),
    };
}

function _buildNowStripModel(slot: ScheduleSlot): ScheduleNowStripModel {
    return {
        slotId: slot.id,
        rangeLabel: slot.rangeLabel,
        scheduledAction: slot.action,
        runtime: slot.runtime,
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
