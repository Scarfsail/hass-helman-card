import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleAction } from "../schedule-types";
import { getScheduleActionLabel } from "./schedule-labels";

type ScheduleActionTone = "neutral" | "charge" | "discharge" | "stop";
type ScheduleActionToneClass = `action-tone-${ScheduleActionTone}`;

export interface ScheduleActionPresentation {
    icon: string;
    label: string;
    toneClass: ScheduleActionToneClass;
}

export function getScheduleActionPresentation(
    action: ScheduleAction,
    localize: LocalizeFunction,
): ScheduleActionPresentation {
    const tone = _getScheduleActionTone(action.kind);
    return {
        icon: _getScheduleActionIcon(action.kind),
        label: getScheduleActionLabel(action, localize),
        toneClass: `action-tone-${tone}`,
    };
}

function _getScheduleActionTone(actionKind: ScheduleAction["kind"]): ScheduleActionTone {
    switch (actionKind) {
        case "normal":
            return "neutral";
        case "charge_to_target_soc":
            return "charge";
        case "discharge_to_target_soc":
            return "discharge";
        case "stop_charging":
        case "stop_discharging":
            return "stop";
    }
}

function _getScheduleActionIcon(actionKind: ScheduleAction["kind"]): string {
    switch (actionKind) {
        case "normal":
            return "mdi:circle-outline";
        case "charge_to_target_soc":
            return "mdi:arrow-up-bold-circle-outline";
        case "discharge_to_target_soc":
            return "mdi:arrow-down-bold-circle-outline";
        case "stop_charging":
            return "mdi:arrow-up-bold-circle";
        case "stop_discharging":
            return "mdi:arrow-down-bold-circle";
    }
}
