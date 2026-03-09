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
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 8px;
        align-items: start;
    }

    .forecast-day-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
        padding: 10px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background: var(--secondary-background-color);
        transition: border-color 120ms ease, box-shadow 120ms ease;
    }

    .forecast-day-card.today {
        border-color: var(--primary-color);
    }

    .forecast-day-card.expanded {
        border-color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }

    .forecast-day-summary {
        display: flex;
        flex-direction: column;
        gap: 6px;
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
        align-items: flex-start;
        gap: 8px;
    }

    .forecast-day-label {
        font-size: 0.88rem;
        font-weight: 600;
        line-height: 1.2;
    }

    .forecast-day-toggle {
        color: var(--secondary-text-color);
        font-size: 1rem;
        font-weight: 600;
        line-height: 1;
    }

    .forecast-day-solar-value {
        font-size: 0.96rem;
        font-weight: 700;
        line-height: 1.2;
    }

    .forecast-day-price-line {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        min-height: 1rem;
        font-size: 0.74rem;
        font-weight: 600;
        line-height: 1.2;
    }

    .forecast-day-price-chip {
        white-space: nowrap;
    }

    .forecast-day-price-separator {
        color: var(--secondary-text-color);
    }

    .forecast-day-mini-charts {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 2px;
    }

    .forecast-day-chart-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .forecast-day-chart-key {
        flex: 0 0 auto;
        width: 0.75rem;
        color: var(--secondary-text-color);
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
    }

    .forecast-day-chart-track {
        position: relative;
        display: flex;
        align-items: stretch;
        flex: 1 1 auto;
        gap: 2px;
        min-width: 0;
        height: 18px;
        padding: 1px 0;
    }

    .forecast-day-chart-track::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        border-radius: 999px;
        background: var(--divider-color);
        opacity: 0.7;
    }

    .forecast-day-chart-track.price.has-negative::before {
        bottom: 50%;
    }

    .forecast-day-chart-track.empty::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 2px;
        bottom: 2px;
        border: 1px dashed var(--divider-color);
        border-radius: 999px;
        opacity: 0.45;
    }

    .forecast-day-chart-bar {
        position: relative;
        flex: 1 1 0;
        min-width: 0;
        color: var(--primary-color);
    }

    .forecast-day-chart-bar::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: var(--forecast-bar-offset, 0%);
        height: var(--forecast-bar-height, 0%);
        border-radius: 999px;
        background: currentColor;
        opacity: 0.95;
    }

    .forecast-day-placeholder {
        color: var(--secondary-text-color);
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1.2;
    }

    .forecast-detail-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background: var(--card-background-color);
    }

    .forecast-detail-panel-header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 12px;
    }

    .forecast-detail-panel-heading {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .forecast-detail-panel-title {
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.2;
    }

    .forecast-detail-panel-subtitle,
    .forecast-status-note {
        color: var(--secondary-text-color);
        font-size: 0.8rem;
    }

    .forecast-detail-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 12px 16px;
        align-items: flex-start;
    }

    .forecast-detail-summary-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }

    .forecast-detail-summary-label,
    .forecast-detail-row-label {
        color: var(--secondary-text-color);
        font-size: 0.72rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .forecast-detail-summary-value {
        font-size: 0.85rem;
        font-weight: 600;
        line-height: 1.2;
    }

    .forecast-detail-summary-placeholder {
        color: var(--secondary-text-color);
    }

    .forecast-detail-summary-item .forecast-day-price-line {
        min-height: 0;
        font-size: 0.78rem;
    }

    .forecast-detail-chart {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .forecast-detail-row,
    .forecast-detail-axis {
        display: grid;
        grid-template-columns: minmax(52px, auto) 1fr;
        gap: 8px;
        align-items: center;
    }

    .forecast-detail-track,
    .forecast-detail-axis-grid {
        position: relative;
        display: grid;
        grid-template-columns: repeat(var(--forecast-column-count, 1), minmax(0, 1fr));
        gap: 4px;
        min-width: 0;
    }

    .forecast-detail-track {
        min-height: 76px;
    }

    .forecast-detail-track::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1px;
        border-radius: 999px;
        background: var(--divider-color);
        opacity: 0.8;
    }

    .forecast-detail-track.price.has-negative::before {
        bottom: 50%;
    }

    .forecast-detail-track.empty::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 6px;
        bottom: 6px;
        border: 1px dashed var(--divider-color);
        border-radius: 12px;
        opacity: 0.45;
    }

    .forecast-detail-column {
        position: relative;
        min-width: 0;
    }

    .forecast-detail-bar {
        position: absolute;
        left: 50%;
        bottom: var(--forecast-bar-offset, 0%);
        width: calc(100% - 2px);
        max-width: 12px;
        min-width: 4px;
        height: var(--forecast-bar-height, 0%);
        transform: translateX(-50%);
        border-radius: 999px;
        background: currentColor;
        opacity: 0.95;
    }

    .forecast-detail-bar.solar,
    .forecast-detail-highlight.solar {
        color: var(--primary-color);
    }

    .forecast-detail-highlight {
        position: absolute;
        left: 50%;
        z-index: 1;
        padding: 1px 4px;
        border-radius: 999px;
        background: var(--card-background-color);
        box-shadow: 0 0 0 1px var(--divider-color);
        font-size: 0.64rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        transform: translateX(-50%);
        pointer-events: none;
    }

    .forecast-detail-highlight.top {
        top: 2px;
    }

    .forecast-detail-highlight.bottom {
        bottom: 2px;
    }

    .forecast-detail-axis {
        align-items: start;
    }

    .forecast-detail-axis-tick {
        display: flex;
        justify-content: center;
        min-width: 0;
        color: var(--secondary-text-color);
        font-size: 0.68rem;
        line-height: 1.2;
    }

    .forecast-day-chart-track.price .forecast-day-chart-bar.price-positive,
    .forecast-day-price-chip.price-positive,
    .forecast-detail-track.price .forecast-detail-bar.price-positive,
    .forecast-detail-highlight.price-positive {
        color: var(--success-color, #2e7d32);
    }

    .forecast-day-chart-track.price .forecast-day-chart-bar.price-negative,
    .forecast-day-price-chip.price-negative,
    .forecast-detail-track.price .forecast-detail-bar.price-negative,
    .forecast-detail-highlight.price-negative {
        color: var(--error-color, #c62828);
    }

    .forecast-day-chart-track.price .forecast-day-chart-bar.price-neutral,
    .forecast-day-price-chip.price-neutral,
    .forecast-detail-track.price .forecast-detail-bar.price-neutral,
    .forecast-detail-highlight.price-neutral {
        color: var(--warning-color, #ef6c00);
    }

    .muted {
        color: var(--secondary-text-color);
        font-size: 0.9rem;
    }
`;
