import type {
    ActiveSlotRuntimeDTO,
    ScheduleActionDTO,
    SchedulePayload,
    ScheduleSlotDTO,
} from "../helman-api";

export type ScheduleAction = ScheduleActionDTO;
export type ScheduleActionKind = ScheduleAction["kind"];
export type ScheduleRuntime = ActiveSlotRuntimeDTO;

export interface ScheduleSlot {
    id: string;
    index: number;
    startMs: number;
    endMs: number | null;
    dayKey: string;
    timeLabel: string;
    endLabel: string | null;
    rangeLabel: string;
    action: ScheduleAction;
    runtime: ScheduleRuntime | null;
    isCurrent: boolean;
}

export interface ScheduleTableSectionModel {
    dayKey: string;
    dayLabel: string;
    slots: ScheduleSlot[];
}

export interface ScheduleSlotToggleDetail {
    slotId: string;
    selected: boolean;
}

export interface ScheduleDialogState {
    selectedSlots: ScheduleSlot[];
    initialAction: ScheduleAction;
}

export interface ScheduleDialogResult {
    action: ScheduleAction;
}

export interface ScheduleOwnerError {
    code: string | null;
    message: string;
}

export interface ScheduleOwnerSnapshot {
    schedule: SchedulePayload | null;
    loading: boolean;
    refreshing: boolean;
    writing: boolean;
    togglingExecution: boolean;
    error: ScheduleOwnerError | null;
    updatedAt: number | null;
    stale: boolean;
}

export interface NormalizedScheduleModel {
    slots: ScheduleSlot[];
    currentSlotId: string | null;
    currentDayKey: string | null;
}

export interface ScheduleSlotPatch extends Pick<ScheduleSlotDTO, "id" | "action"> {}

export function areScheduleActionsEqual(left: ScheduleAction, right: ScheduleAction): boolean {
    return left.kind === right.kind && (left.targetSoc ?? null) === (right.targetSoc ?? null);
}

export function isTargetScheduleAction(
    action: ScheduleAction,
): action is ScheduleAction & Required<Pick<ScheduleAction, "targetSoc">> {
    return action.kind === "charge_to_target_soc" || action.kind === "discharge_to_target_soc";
}
