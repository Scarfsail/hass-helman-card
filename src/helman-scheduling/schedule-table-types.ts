import type { SlotForecastPoint } from "./model/slot-forecast-model";
import type {
    ScheduleAction,
    ScheduleApplianceAction,
    ScheduleSlot,
} from "./schedule-types";

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

export type ScheduleTableColumnKey =
    | "time"
    | "action"
    | "soc"
    | "solar"
    | "grid"
    | "price";

export const SCHEDULE_TABLE_COLUMNS: readonly ScheduleTableColumnKey[] = [
    "time",
    "action",
    "soc",
    "solar",
    "grid",
    "price",
];

export interface ScheduleTableInverterActionItemModel {
    kind: "inverter";
    key: string;
    action: ScheduleAction;
    firstSlotId: string;
}

export interface ScheduleTableApplianceActionItemModel {
    kind: "appliance";
    key: string;
    applianceId: string;
    applianceName: string;
    applianceKind: string;
    action: ScheduleApplianceAction;
    firstSlotId: string;
}

export type ScheduleTableActionItemModel =
    | ScheduleTableInverterActionItemModel
    | ScheduleTableApplianceActionItemModel;

export interface ScheduleTableActionCellModel {
    items: ScheduleTableActionItemModel[];
}

export interface ScheduleTableSlotRowModel {
    kind: "slot";
    rowId: string;
    slot: ScheduleSlot;
    actionCell: ScheduleTableActionCellModel;
    displayTimeLabel: ScheduleTableTimeLabel;
    rangeLabel: string;
    forecast: SlotForecastPoint | null;
    isCurrent: boolean;
    variant: "raw" | "hour-child";
    parentHourKey: string | null;
}

export interface ScheduleTableHourRowModel {
    kind: "hour";
    rowId: string;
    hourKey: string;
    dayKey: string;
    displayTimeLabel: ScheduleTableTimeLabel;
    rangeLabel: string;
    slotIds: string[];
    actionCell: ScheduleTableActionCellModel;
    forecast: SlotForecastPoint | null;
    isCurrent: boolean;
    expanded: boolean;
}

export interface ScheduleTableDetailRowModel {
    kind: "detail";
    rowId: string;
    ownerRowId: string;
    slot: ScheduleSlot;
    variant: "raw" | "hour" | "hour-child";
}

export type ScheduleTableRowModel =
    | ScheduleTableSlotRowModel
    | ScheduleTableHourRowModel
    | ScheduleTableDetailRowModel;

export interface ScheduleTableSectionModel {
    dayKey: string;
    dayLabel: string;
    rows: ScheduleTableRowModel[];
}

export interface ScheduleTableModel {
    columns: readonly ScheduleTableColumnKey[];
    sections: ScheduleTableSectionModel[];
    forecast: ScheduleTableForecastMeta;
}

export const EMPTY_SCHEDULE_TABLE_MODEL: ScheduleTableModel = {
    columns: SCHEDULE_TABLE_COLUMNS,
    sections: [],
    forecast: EMPTY_SCHEDULE_TABLE_FORECAST_META,
};

export interface ScheduleHourToggleDetail {
    hourKey: string;
}
