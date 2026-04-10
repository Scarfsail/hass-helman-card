import { css } from "lit-element";

export const schedulingSharedStyles = css`
    :host {
        display: block;
    }

    .panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        background: var(--secondary-background-color);
    }

    .panel-title {
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.2;
    }

    .panel-header-inline {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 4px 8px;
    }

    .panel.panel-highlight-success,
    .appliance-panel.panel-highlight-success {
        border-color: color-mix(in srgb, var(--success-color, #2e7d32) 48%, var(--divider-color));
        background: color-mix(in srgb, var(--success-color, #2e7d32) 14%, var(--secondary-background-color));
        box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--success-color, #2e7d32) 14%, transparent),
            0 0 0 1px color-mix(in srgb, var(--success-color, #2e7d32) 6%, transparent);
    }

    .panel.panel-highlight-stop,
    .appliance-panel.panel-highlight-stop {
        border-color: color-mix(in srgb, var(--error-color, #c62828) 48%, var(--divider-color));
        background: color-mix(in srgb, var(--error-color, #c62828) 14%, var(--secondary-background-color));
        box-shadow:
            inset 0 0 0 1px color-mix(in srgb, var(--error-color, #c62828) 14%, transparent),
            0 0 0 1px color-mix(in srgb, var(--error-color, #c62828) 6%, transparent);
    }

    .panel-subtitle,
    .muted,
    .field-help {
        color: var(--secondary-text-color);
        font-size: 0.84rem;
        line-height: 1.35;
    }

    .section-heading,
    .field-label {
        color: var(--secondary-text-color);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 0.8rem;
        line-height: 1.2;
        white-space: nowrap;
    }

    .action-tone-empty,
    .action-tone-neutral,
    .action-tone-normal,
    .action-tone-charge,
    .action-tone-discharge,
    .action-tone-stop {
        --schedule-action-tone-bg: color-mix(in srgb, var(--schedule-action-tone-accent) 14%, transparent);
        --schedule-action-tone-border: color-mix(in srgb, var(--schedule-action-tone-accent) 30%, var(--divider-color));
        --schedule-action-tone-color: color-mix(in srgb, var(--schedule-action-tone-accent) 82%, var(--primary-text-color));
        --schedule-action-tone-icon: var(--schedule-action-tone-color);
    }

    .action-tone-empty {
        --schedule-action-tone-accent: var(--schedule-action-empty-color, var(--secondary-text-color));
        --schedule-action-tone-bg: color-mix(in srgb, var(--schedule-action-tone-accent) 7%, transparent);
        --schedule-action-tone-border: color-mix(in srgb, var(--schedule-action-tone-accent) 16%, var(--divider-color));
        --schedule-action-tone-color: var(--disabled-text-color, var(--secondary-text-color));
        --schedule-action-tone-icon: color-mix(in srgb, var(--disabled-text-color, var(--secondary-text-color)) 84%, var(--primary-text-color));
    }

    .action-tone-neutral {
        --schedule-action-tone-accent: var(--schedule-action-neutral-color, var(--secondary-text-color));
        --schedule-action-tone-color: var(--secondary-text-color);
        --schedule-action-tone-icon: color-mix(in srgb, var(--secondary-text-color) 88%, var(--primary-text-color));
    }

    .action-tone-normal {
        --schedule-action-tone-accent: var(--schedule-action-normal-color, #ffffff);
        --schedule-action-tone-bg: color-mix(in srgb, var(--schedule-action-tone-accent) 12%, var(--card-background-color));
        --schedule-action-tone-border: color-mix(in srgb, var(--schedule-action-tone-accent) 44%, var(--divider-color));
        --schedule-action-tone-color: var(--primary-text-color);
        --schedule-action-tone-icon: color-mix(in srgb, var(--schedule-action-tone-accent) 86%, var(--primary-text-color));
    }

    .action-tone-charge {
        --schedule-action-tone-accent: var(--schedule-action-charge-color, var(--success-color, #2e7d32));
    }

    .action-tone-discharge {
        --schedule-action-tone-accent: var(--schedule-action-discharge-color, var(--warning-color, #a16207));
    }

    .action-tone-stop {
        --schedule-action-tone-accent: var(--schedule-action-stop-color, var(--error-color, #c62828));
    }

    .chip.action {
        border: 1px solid var(--schedule-action-tone-border, color-mix(in srgb, var(--primary-color) 28%, transparent));
        background: var(--schedule-action-tone-bg, color-mix(in srgb, var(--primary-color) 16%, transparent));
        color: var(--schedule-action-tone-color, var(--primary-text-color));
    }

    .chip.now {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
        color: var(--primary-color);
        font-weight: 600;
    }

    .chip.runtime {
        background: color-mix(in srgb, var(--accent-color, var(--primary-color)) 18%, transparent);
        color: var(--primary-text-color);
    }

    .chip.success {
        background: color-mix(in srgb, var(--success-color, #2e7d32) 16%, transparent);
        color: color-mix(in srgb, var(--success-color, #2e7d32) 82%, var(--primary-text-color));
    }

    .chip.reason,
    .chip.warning {
        background: color-mix(in srgb, var(--warning-color, #c27c0e) 18%, transparent);
        color: var(--primary-text-color);
    }

    .chip.error {
        background: color-mix(in srgb, var(--error-color) 16%, transparent);
        color: var(--error-color);
    }

    .chip.disabled {
        background: color-mix(in srgb, var(--disabled-text-color) 16%, transparent);
        color: var(--secondary-text-color);
    }

    .button-reset {
        padding: 0;
        border: none;
        background: none;
        color: inherit;
        font: inherit;
    }

    .icon-button,
    .secondary-button,
    .primary-button,
    .link-button {
        border-radius: 10px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        color: inherit;
        font: inherit;
        cursor: pointer;
    }

    .icon-button,
    .link-button {
        padding: 6px 10px;
    }

    .secondary-button,
    .primary-button {
        padding: 7px 12px;
    }

    .primary-button {
        border-color: color-mix(in srgb, var(--primary-color) 40%, var(--divider-color));
        background: color-mix(in srgb, var(--primary-color) 14%, var(--card-background-color));
    }

    .icon-button:disabled,
    .secondary-button:disabled,
    .primary-button:disabled,
    .link-button:disabled {
        opacity: 0.55;
        cursor: default;
    }

    .icon-button:focus-visible,
    .secondary-button:focus-visible,
    .primary-button:focus-visible,
    .link-button:focus-visible,
    .button-reset:focus-visible,
    .select-input:focus-visible,
    .number-input:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .select-input,
    .number-input {
        min-height: 38px;
        padding: 8px 10px;
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        background: var(--card-background-color);
        color: inherit;
        font: inherit;
    }

    .radio-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 0;
        padding: 0;
        border: none;
    }

    .radio-option {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .inline-error {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        border: 1px solid color-mix(in srgb, var(--error-color) 35%, var(--divider-color));
        border-radius: 12px;
        background: color-mix(in srgb, var(--error-color) 10%, var(--card-background-color));
    }

    .inline-error-title {
        color: var(--error-color);
        font-size: 0.9rem;
        font-weight: 700;
    }

    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
        white-space: nowrap;
    }
`;
