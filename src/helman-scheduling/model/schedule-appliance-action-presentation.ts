import type { LocalizeFunction } from "../../localize/localize";
import type { ScheduleApplianceMetadata } from "./schedule-appliance-metadata";
import type { ScheduleApplianceAction } from "../schedule-types";
import {
    isScheduleEvChargerAction,
    isScheduleGenericApplianceAction,
} from "../schedule-types";

type ScheduleApplianceActionTone = "neutral" | "charge" | "stop";
type ScheduleApplianceActionToneClass = `action-tone-${ScheduleApplianceActionTone}`;

export interface ScheduleApplianceActionPresentation {
    icon: string;
    label: string;
    toneClass: ScheduleApplianceActionToneClass;
}

export function getScheduleApplianceActionPresentation({
    appliance,
    action,
    localize,
}: {
    appliance: Pick<ScheduleApplianceMetadata, "kind">;
    action: ScheduleApplianceAction;
    localize: LocalizeFunction;
}): ScheduleApplianceActionPresentation {
    if (appliance.kind === "ev_charger" && isScheduleEvChargerAction(action)) {
        return _getEvChargerActionPresentation(action, localize);
    }

    if (appliance.kind === "generic" && isScheduleGenericApplianceAction(action)) {
        return action.on
            ? {
                icon: "mdi:power-plug",
                label: localize("scheduling.appliance.generic.action.on"),
                toneClass: "action-tone-charge",
            }
            : {
                icon: "mdi:circle-outline",
                label: localize("scheduling.dialog.appliance.no_action"),
                toneClass: "action-tone-neutral",
            };
    }

    return {
        icon: "mdi:flash",
        label: localize("scheduling.appliance.action.generic"),
        toneClass: "action-tone-neutral",
    };
}

function _getEvChargerActionPresentation(
    action: Extract<ScheduleApplianceAction, { charge: boolean }>,
    localize: LocalizeFunction,
): ScheduleApplianceActionPresentation {
    const modeLabel = _buildEvModeLabel(action, localize);
    return {
        icon: "mdi:car-electric",
        label: action.charge ? modeLabel : localize("scheduling.appliance.ev.action.no_charge"),
        toneClass: action.charge ? "action-tone-charge" : "action-tone-stop",
    };
}

function _buildEvModeLabel(
    action: Extract<ScheduleApplianceAction, { charge: boolean }>,
    localize: LocalizeFunction,
): string {
    if (!action.charge) {
        return localize("scheduling.appliance.ev.action.no_charge");
    }

    const useMode = action.useMode ?? "Fast";
    if (useMode === "ECO") {
        const ecoLabel = localize("scheduling.appliance.ev.mode.eco");
        return action.ecoGear ? `${ecoLabel} ${action.ecoGear}` : ecoLabel;
    }

    return localize("scheduling.appliance.ev.mode.fast");
}
