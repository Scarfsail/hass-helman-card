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
    rowScale: ScheduleTableForecastRowScale;
    dayAggregateScale: ScheduleTableDayAggregateScale;
}

export interface ScheduleTableForecastRowScale {
    solarMaxWh: number;
    gridMaxAbsKwh: number;
    priceMaxAbs: number;
}

export interface ScheduleTableDayAggregateScale {
    solarMaxWh: number;
    gridMaxKwh: number;
    priceMaxAbs: number;
}

export const EMPTY_SCHEDULE_TABLE_FORECAST_META: ScheduleTableForecastMeta = {
    batteryAvailable: false,
    solarAvailable: false,
    gridAvailable: false,
    priceAvailable: false,
    priceDisplayUnit: null,
    rowScale: {
        solarMaxWh: 0,
        gridMaxAbsKwh: 0,
        priceMaxAbs: 0,
    },
    dayAggregateScale: {
        solarMaxWh: 0,
        gridMaxKwh: 0,
        priceMaxAbs: 0,
    },
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

export interface ScheduleTableDayAggregateModel {
    batteryMinSocPct: number | null;
    batteryMaxSocPct: number | null;
    solarWh: number | null;
    gridImportKwh: number | null;
    gridExportKwh: number | null;
    priceHasData: boolean;
    pricePositiveMin: number | null;
    pricePositiveMax: number | null;
    priceNegativeMin: number | null;
    priceNegativeMax: number | null;
}

export type ScheduleTableRowModel =
    | ScheduleTableSlotRowModel
    | ScheduleTableHourRowModel
    | ScheduleTableDetailRowModel;

export interface ScheduleTableSectionModel {
    dayKey: string;
    dayLabel: string;
    dayAggregate: ScheduleTableDayAggregateModel | null;
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

export interface ScheduleDayToggleDetail {
    dayKey: string;
}

export interface ScheduleHourToggleDetail {
    hourKey: string;
}
