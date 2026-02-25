import type { LovelaceCardConfig } from "../hass-frontend/src/data/lovelace/config/card";

export interface HelmanUiConfig {
    sources_title: string;
    consumers_title: string;
    groups_title: string;
    others_group_label: string;
    show_empty_groups?: boolean;
    show_others_group?: boolean;
    device_label_text: Record<string, Record<string, string>>;
    history_buckets: number;
    history_bucket_duration: number;
}

export interface HelmanCardConfig extends LovelaceCardConfig {
    card_size?: number;
    max_power?: number;
}
