import type {
    ApplianceRuntimeDTO,
    InverterRuntimeDTO,
    SchedulePayload,
} from "../../helman-api";
import type {
    NormalizedScheduleModel,
    ScheduleApplianceRuntime,
    ScheduleInverterRuntime,
    ScheduleRuntime,
    ScheduleSlot,
} from "../schedule-types";
import {
    cloneScheduleInverterAction,
    cloneScheduleRuntime,
    cloneScheduleDomains,
} from "../schedule-types";
import {
    getScheduleDayKey,
    getScheduleSlotDayKey,
    getScheduleSlotStartMs,
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
    const slotBoundariesByMs = new Map(slotBoundaries.map((slot) => [slot.startMs, slot]));
    const seenMs = new Set<number>();
    const normalizedRuntime = _normalizeScheduleRuntime(schedule.runtime);
    const runtimeSlotId = normalizedRuntime?.slotId ?? null;
    const normalizedSlots = schedule.slots
        .flatMap((slot) => {
            const startMs = getScheduleSlotStartMs(slot.id);
            if (startMs === null) {
                return [];
            }

            if (seenMs.has(startMs)) {
                return [];
            }
            seenMs.add(startMs);

            const boundary = slotBoundariesByMs.get(startMs);
            if (boundary === undefined) {
                return [];
            }

            return [_normalizeSlot({
                slot,
                boundary,
                timeZone,
                locale,
            })];
        })
        .sort((left, right) => left.startMs - right.startMs)
        .map((slot, index) => ({
            ...slot,
            index,
        }));

    const resolvedCurrentSlotId = normalizedSlots.find((slot) =>
        slot.startMs <= nowMs && (slot.endMs === null || nowMs < slot.endMs)
    )?.id
        ?? runtimeSlotId
        ?? null;

    const slots = normalizedSlots.map((slot) => ({
        ...slot,
        runtime: slot.id === runtimeSlotId && normalizedRuntime !== null
            ? cloneScheduleRuntime(normalizedRuntime.runtime)
            : null,
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
        domains: cloneScheduleDomains(slot.domains),
        runtime: null,
    };
}

function _normalizeScheduleRuntime(
    runtime: SchedulePayload["runtime"],
): { slotId: string; runtime: ScheduleRuntime } | null {
    if (runtime === undefined) {
        return null;
    }

    return {
        slotId: runtime.activeSlotId,
        runtime: {
            inverter: runtime.inverter
                ? _normalizeInverterRuntime(runtime.inverter)
                : null,
            appliances: Object.fromEntries(
                Object.entries(runtime.appliances).map(([applianceId, applianceRuntime]) => [
                    applianceId,
                    _normalizeApplianceRuntime(applianceRuntime),
                ]),
            ),
            reconciledAt: runtime.reconciledAt,
        },
    };
}

function _normalizeInverterRuntime(runtime: InverterRuntimeDTO): ScheduleInverterRuntime {
    return {
        actionKind: runtime.actionKind,
        outcome: runtime.outcome,
        reason: runtime.reason,
        errorCode: runtime.errorCode,
        message: runtime.message,
        executedAction: runtime.executedAction
            ? cloneScheduleInverterAction(runtime.executedAction)
            : undefined,
    };
}

function _normalizeApplianceRuntime(runtime: ApplianceRuntimeDTO): ScheduleApplianceRuntime {
    return {
        actionKind: runtime.actionKind,
        outcome: runtime.outcome,
        errorCode: runtime.errorCode,
        message: runtime.message,
        updatedAt: runtime.updatedAt,
    };
}
