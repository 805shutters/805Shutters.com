import { useId, useState } from "react";
import styles from "./MobileInstallOptions.module.css";

export type MobileInstallOption = {
  field: string;
  label: string;
  value: string | null;
};

export const MOBILE_INSTALL_LABELS = {
  hard_surface_install: "Hard-surface install",
  ladder_over_15ft: "Ladder over 15 ft",
  requires_takedown: "Remove existing treatment",
} as const;

export function MobileInstallOptions({
  options,
  onChange,
}: {
  options: readonly MobileInstallOption[];
  onChange: (field: string, value: string) => void;
}) {
  const groupId = useId();
  const [expandedField, setExpandedField] = useState<string | null>(null);

  return (
    <div className={styles.root} data-mobile-install-options>
      {options.map(({ field, label, value }) => {
        const selected = value === "Yes" || value === "No" ? value : null;
        const expanded = selected === null || expandedField === field;
        const choices: readonly ("No" | "Yes")[] = expanded
          ? ["No", "Yes"]
          : selected
            ? [selected]
            : [];
        const labelId = `${groupId}-${field}`;

        return (
          <div className={styles.row} data-install-field={field} key={field}>
            <span className={styles.label} id={labelId}>
              {label}
            </span>
            <div
              className={styles.choices}
              role="group"
              aria-labelledby={labelId}
            >
              {choices.map((choice) => {
                const isSelected = choice === selected;
                return (
                  <button
                    className={styles.button}
                    type="button"
                    key={choice}
                    aria-pressed={isSelected}
                    aria-expanded={isSelected ? expanded : undefined}
                    aria-label={
                      isSelected && !expanded
                        ? `${label}: ${choice} selected. Show choices`
                        : isSelected
                          ? `${label}: ${choice} selected`
                          : `${label}: choose ${choice}`
                    }
                    onClick={() => {
                      if (selected !== null && !expanded) {
                        setExpandedField(field);
                        return;
                      }
                      setExpandedField(null);
                      if (choice !== selected) onChange(field, choice);
                    }}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
