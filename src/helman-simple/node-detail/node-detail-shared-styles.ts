import { css } from "lit-element";

export const nodeDetailSharedStyles = css`
    :host {
        display: block;
    }

    .content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 240px;
        padding: 8px 0;
    }

    .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
    }

    .detail-row.clickable {
        cursor: pointer;
        border-radius: 4px;
        padding: 2px 4px;
        margin: 0 -4px;
    }

    .detail-row.clickable:hover {
        background: var(--secondary-background-color);
    }

    .label {
        color: var(--secondary-text-color);
        font-size: 0.9rem;
    }

    .value {
        font-weight: 600;
        font-size: 0.9rem;
    }

    .section-title {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        letter-spacing: 0.05em;
        margin-top: 4px;
    }

    .power-device-wrapper {
        display: flex;
        width: 100%;
    }

    .power-devices-dual {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 8px;
        width: 100%;
    }

    .power-device-section {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 160px;
        gap: 4px;
    }

    .forecast-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .forecast-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .forecast-detail-days {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 4px;
    }

    .forecast-day-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 156px;
        flex-shrink: 0;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background: var(--secondary-background-color);
    }

    .forecast-day-card.today {
        border-color: var(--primary-color);
    }

    .forecast-day-card.expanded {
        min-width: 240px;
        border-color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .forecast-day-summary {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .forecast-day-summary:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
        border-radius: 8px;
    }

    .forecast-day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .forecast-day-label {
        font-size: 0.9rem;
        font-weight: 600;
        text-align: center;
    }

    .forecast-day-toggle {
        color: var(--secondary-text-color);
        font-size: 1.1rem;
        font-weight: 600;
        line-height: 1;
    }

    .forecast-day-lane {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 76px;
        padding: 8px;
        border-radius: 8px;
        background: var(--card-background-color);
    }

    .forecast-day-lane-label {
        color: var(--secondary-text-color);
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .forecast-day-solar-value {
        font-size: 1rem;
        font-weight: 600;
    }

    .forecast-day-price-range {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .forecast-day-price-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }

    .forecast-day-price-label {
        color: var(--secondary-text-color);
        font-size: 0.8rem;
    }

    .forecast-day-price-value {
        font-size: 0.85rem;
        font-weight: 600;
        text-align: right;
    }

    .forecast-day-placeholder {
        color: var(--secondary-text-color);
        font-size: 0.85rem;
        line-height: 1.3;
    }

    .price-positive .forecast-day-price-value {
        color: var(--success-color, #2e7d32);
    }

    .price-negative .forecast-day-price-value {
        color: var(--error-color, #c62828);
    }

    .price-neutral .forecast-day-price-value {
        color: var(--warning-color, #ef6c00);
    }

    .forecast-day-hourly {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 4px;
        border-top: 1px solid var(--divider-color);
    }

    .forecast-day-hourly-label,
    .forecast-status-note {
        color: var(--secondary-text-color);
        font-size: 0.8rem;
    }

    .forecast-day-hourly-label {
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .forecast-hourly-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 320px;
        overflow-y: auto;
        padding-right: 4px;
    }

    .forecast-hour-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        border-radius: 8px;
        background: var(--card-background-color);
    }

    .forecast-hour-time {
        color: var(--secondary-text-color);
        font-size: 0.82rem;
        font-weight: 600;
    }

    .forecast-hour-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
    }

    .forecast-hour-metric {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .forecast-hour-metric-label {
        color: var(--secondary-text-color);
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .forecast-hour-metric-value {
        font-size: 0.85rem;
        font-weight: 600;
    }

    .forecast-hour-metric.price-positive .forecast-hour-metric-value {
        color: var(--success-color, #2e7d32);
    }

    .forecast-hour-metric.price-negative .forecast-hour-metric-value {
        color: var(--error-color, #c62828);
    }

    .forecast-hour-metric.price-neutral .forecast-hour-metric-value {
        color: var(--warning-color, #ef6c00);
    }

    .muted {
        color: var(--secondary-text-color);
        font-size: 0.9rem;
    }
`;
