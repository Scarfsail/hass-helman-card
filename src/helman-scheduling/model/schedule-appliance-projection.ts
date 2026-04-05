import type {
    ApplianceProjectionPointDTO,
    ApplianceProjectionsPayload,
} from "../../helman-api";
import type { ScheduleApplianceAction } from "../schedule-types";

export interface ScheduleApplianceProjectionPoint {
    vehicleId: string | null;
    mode: string | null;
    expectedVehicleSocPct: number;
}

export interface ScheduleApplianceProjectionIndex {
    generatedAt: string | null;
    points: ReadonlyMap<string, ReadonlyMap<string, readonly ScheduleApplianceProjectionPoint[]>>;
}

export const EMPTY_SCHEDULE_APPLIANCE_PROJECTION_INDEX: ScheduleApplianceProjectionIndex = {
    generatedAt: null,
    points: new Map(),
};

export function buildScheduleApplianceProjectionIndex(
    payload: ApplianceProjectionsPayload,
): ScheduleApplianceProjectionIndex {
    const points = new Map<string, Map<string, readonly ScheduleApplianceProjectionPoint[]>>();

    for (const [applianceId, projection] of Object.entries(payload.appliances)) {
        if (!_isNonEmptyString(applianceId)) {
            continue;
        }

        const slotPoints = new Map<string, Map<string, ScheduleApplianceProjectionPoint>>();
        for (const point of projection.series) {
            const normalized = _normalizeProjectionPoint(point);
            if (normalized === null) {
                continue;
            }

            const slotCandidates = slotPoints.get(normalized.slotId) ?? new Map<string, ScheduleApplianceProjectionPoint>();
            const existing = slotCandidates.get(normalized.identityKey);
            if (!existing || existing.expectedVehicleSocPct < normalized.point.expectedVehicleSocPct) {
                slotCandidates.set(normalized.identityKey, normalized.point);
            }
            slotPoints.set(normalized.slotId, slotCandidates);
        }

        if (slotPoints.size > 0) {
            points.set(
                applianceId,
                new Map(
                    Array.from(slotPoints.entries()).map(([slotId, candidates]) => [
                        slotId,
                        Array.from(candidates.values()),
                    ]),
                ),
            );
        }
    }

    if (points.size === 0) {
        return EMPTY_SCHEDULE_APPLIANCE_PROJECTION_INDEX;
    }

    return {
        generatedAt: payload.generatedAt,
        points,
    };
}

export function getExpectedVehicleSocPct({
    projectionIndex,
    applianceKind,
    applianceId,
    action,
    slotId,
}: {
    projectionIndex: ScheduleApplianceProjectionIndex;
    applianceKind: string | null | undefined;
    applianceId: string;
    action: ScheduleApplianceAction;
    slotId: string;
}): number | null {
    if (applianceKind !== "ev_charger" || action.charge !== true) {
        return null;
    }

    const candidates = projectionIndex.points.get(applianceId)?.get(slotId);
    if (!candidates || candidates.length === 0) {
        return null;
    }

    const matches = candidates
        .filter((candidate) => _matchesProjectedAction(action, candidate))
        .map((candidate) => candidate.expectedVehicleSocPct);
    if (matches.length === 0) {
        return null;
    }

    return Math.max(...matches);
}

function _normalizeProjectionPoint(
    point: ApplianceProjectionPointDTO,
): { slotId: string; identityKey: string; point: ScheduleApplianceProjectionPoint } | null {
    if (!_isNonEmptyString(point.slotId)) {
        return null;
    }

    const expectedVehicleSocPct = _normalizeSocPct(point.vehicleSoc);
    if (expectedVehicleSocPct === null) {
        return null;
    }

    return {
        slotId: point.slotId,
        identityKey: _buildProjectionIdentityKey(point),
        point: {
            vehicleId: _normalizeOptionalString(point.vehicleId),
            mode: _normalizeOptionalString(point.mode),
            expectedVehicleSocPct,
        },
    };
}

function _matchesProjectedAction(
    action: ScheduleApplianceAction,
    candidate: ScheduleApplianceProjectionPoint,
): boolean {
    if (
        _isNonEmptyString(action.vehicleId)
        && _isNonEmptyString(candidate.vehicleId)
        && action.vehicleId !== candidate.vehicleId
    ) {
        return false;
    }

    if (
        _isNonEmptyString(action.useMode)
        && _isNonEmptyString(candidate.mode)
        && action.useMode !== candidate.mode
    ) {
        return false;
    }

    return true;
}

function _buildProjectionIdentityKey(point: ApplianceProjectionPointDTO): string {
    return `${_normalizeOptionalString(point.vehicleId) ?? ""}|${_normalizeOptionalString(point.mode) ?? ""}`;
}

function _normalizeSocPct(value: number | null): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }

    return Math.max(0, Math.min(100, Math.round(value)));
}

function _normalizeOptionalString(value: string | null): string | null {
    return _isNonEmptyString(value) ? value : null;
}

function _isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}
