import type { SlotForecastPoint } from "./model/slot-forecast-model";
import type { ScheduleAction, ScheduleSlot } from "./schedule-types";

export interface ScheduleTableTimeLabel {
    leading: string | null;
    primary: string;
    trailing: string | null;
    hideLeading: boolean;
    hideTrailing: boolean;
}

export interface ScheduleTableForecastMeta {
    batteryAvailable: boolean;
    solarAvailable: boolean;
    gridAvailable: boolean;
    priceAvailable: boolean;
    priceDisplayUnit: string | null;
    solarMaxWh: number;
    gridMaxAbsKwh: number;
    priceMaxAbs: number;
}

export const EMPTY_SCHEDULE_TABLE_FORECAST_META: ScheduleTableForecastMeta = {
    batteryAvailable: false,
    solarAvailable: false,
    gridAvailable: false,
    priceAvailable: false,
    priceDisplayUnit: null,
    solarMaxWh: 0,
    gridMaxAbsKwh: 0,
    priceMaxAbs: 0,
};

export interface ScheduleTableActionPillModel {
    key: string;
    action: ScheduleAction;
    firstSlotId: string;
}

export interface ScheduleTableSlotRowModel {
    kind: "slot";
    rowId: string;
    slot: ScheduleSlot;
    displayTimeLabel: ScheduleTableTimeLabel;
    rangeLabel: string;
    forecast: SlotForecastPoint | null;
    variant: "raw" | "hour-child";
    showRuntime: boolean;
}

export interface ScheduleTableHourRowModel {
    kind: "hour";
    rowId: string;
    hourKey: string;
    dayKey: string;
    displayTimeLabel: ScheduleTableTimeLabel;
    rangeLabel: string;
    slotIds: string[];
    actionPills: ScheduleTableActionPillModel[];
    forecast: SlotForecastPoint | null;
    expanded: boolean;
    runtimeSlot: ScheduleSlot | null;
    childRows: ScheduleTableSlotRowModel[];
}

export type ScheduleTableRowModel =
    | ScheduleTableSlotRowModel
    | ScheduleTableHourRowModel;

export interface ScheduleTableSectionModel {
    dayKey: string;
    dayLabel: string;
    rows: ScheduleTableRowModel[];
}

export interface ScheduleTableModel {
    sections: ScheduleTableSectionModel[];
    forecast: ScheduleTableForecastMeta;
}

export const EMPTY_SCHEDULE_TABLE_MODEL: ScheduleTableModel = {
    sections: [],
    forecast: EMPTY_SCHEDULE_TABLE_FORECAST_META,
};

export interface ScheduleHourToggleDetail {
    hourKey: string;
}
