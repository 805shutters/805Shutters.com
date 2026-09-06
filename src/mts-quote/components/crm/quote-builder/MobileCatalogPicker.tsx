"use client";

import { useEffect, useId, useReducer, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import styles from "./MobileCatalogPicker.module.css";

export const MOBILE_PICKER_PAGE_SIZE = 24;

export type MobileCatalogPickerItem = {
  id: string;
  name: string;
  code?: string;
  collection?: string;
  detail?: string;
  searchText?: string;
  imageUrl?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type MobileCatalogPickerState = {
  isOpen: boolean;
  query: string;
  visibleCount: number;
};

export type MobileCatalogPickerAction =
  | { type: "reopen" }
  | { type: "query"; query: string }
  | { type: "clear-query" }
  | { type: "cancel"; hasSelection: boolean }
  | { type: "choose" }
  | { type: "clear-selection" }
  | { type: "show-more" }
  | { type: "sync-selection"; hasSelection: boolean };

export function createMobileCatalogPickerState(hasSelection: boolean): MobileCatalogPickerState {
  return { isOpen: !hasSelection, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
}

export function reduceMobileCatalogPickerState(
  state: MobileCatalogPickerState,
  action: MobileCatalogPickerAction,
): MobileCatalogPickerState {
  switch (action.type) {
    case "reopen":
      return { ...state, isOpen: true, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
    case "query":
      return { ...state, isOpen: true, query: action.query, visibleCount: MOBILE_PICKER_PAGE_SIZE };
    case "clear-query":
      return { ...state, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
    case "cancel":
      return { ...state, isOpen: !action.hasSelection, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
    case "choose":
      return { ...state, isOpen: false, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
    case "clear-selection":
      return { ...state, isOpen: true, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
    case "show-more":
      return { ...state, visibleCount: state.visibleCount + MOBILE_PICKER_PAGE_SIZE };
    case "sync-selection":
      return { ...state, isOpen: !action.hasSelection, query: "", visibleCount: MOBILE_PICKER_PAGE_SIZE };
  }
}

export function filterMobileCatalogPickerItems<T extends MobileCatalogPickerItem>(
  items: readonly T[],
  query: string,
): T[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const searchable = [item.name, item.code, item.collection, item.detail, item.searchText]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function selectMobileCatalogPickerItem<T extends MobileCatalogPickerItem>(
  item: T,
  onSelect: (selected: T) => void,
): boolean {
  if (item.disabled) return false;
  onSelect(item);
  return true;
}

type MobileCatalogPickerProps<T extends MobileCatalogPickerItem> = {
  label: string;
  selectedItem: T | null;
  items: readonly T[];
  onSelect: (selected: T) => void;
  onClear: () => void;
  noResultsLabel: string;
  browseOnEmptyQuery?: boolean;
};

function Swatch({ item }: { item: MobileCatalogPickerItem }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [item.imageUrl]);

  return item.imageUrl && !imageFailed ? (
    <img
      className={styles.swatch}
      src={item.imageUrl}
      alt=""
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span className={`${styles.swatch} ${styles.swatchFallback}`} aria-hidden="true" />
  );
}

export function MobileCatalogPicker<T extends MobileCatalogPickerItem>({
  label,
  selectedItem,
  items,
  onSelect,
  onClear,
  noResultsLabel,
  browseOnEmptyQuery = false,
}: MobileCatalogPickerProps<T>) {
  const inputId = useId();
  const [state, dispatch] = useReducer(
    reduceMobileCatalogPickerState,
    Boolean(selectedItem),
    createMobileCatalogPickerState,
  );
  const selectedId = selectedItem?.id ?? "";

  useEffect(() => {
    dispatch({ type: "sync-selection", hasSelection: Boolean(selectedItem) });
  }, [selectedId]);

  if (selectedItem && !state.isOpen) {
    return (
      <div className={styles.root} data-mobile-catalog-picker={label}>
        <button
          type="button"
          className={styles.selected}
          onClick={() => dispatch({ type: "reopen" })}
          aria-expanded="false"
          aria-label={`${label}: ${selectedItem.name}. Change selection`}
        >
          <Swatch item={selectedItem} />
          <span className={styles.selectedText}>
            <strong>{selectedItem.name}</strong>
            <span>
              {[selectedItem.code, selectedItem.collection].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className={styles.edit}>Edit <ChevronDown aria-hidden="true" /></span>
        </button>
      </div>
    );
  }

  const hasQuery = Boolean(state.query.trim());
  const showResults = browseOnEmptyQuery || hasQuery;
  const filteredItems = showResults ? filterMobileCatalogPickerItems(items, state.query) : [];
  const visibleItems = filteredItems.slice(0, state.visibleCount);
  const hasMore = showResults && visibleItems.length < filteredItems.length;

  return (
    <div className={styles.root} data-mobile-catalog-picker={label}>
      <div className={styles.searchBar}>
        <Search aria-hidden="true" />
        <label className={styles.srOnly} htmlFor={inputId}>Search {label.toLowerCase()}</label>
        <input
          id={inputId}
          type="search"
          value={state.query}
          onChange={(event) => dispatch({ type: "query", query: event.target.value })}
          placeholder="Search colors or codes"
          autoComplete="off"
        />
        {state.query ? (
          <button
            type="button"
            className={styles.clearQuery}
            onClick={() => dispatch({ type: "clear-query" })}
            aria-label="Clear search"
          >
            <X aria-hidden="true" />
          </button>
        ) : <span className={styles.clearSpacer} />}
      </div>

      {showResults || selectedItem ? (
        <div className={styles.toolbar}>
          {showResults ? (
            <span>{filteredItems.length} {filteredItems.length === 1 ? "choice" : "choices"}</span>
          ) : <span />}
          {selectedItem ? (
            <button
              type="button"
              onClick={() => dispatch({ type: "cancel", hasSelection: true })}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {showResults && visibleItems.length ? (
        <div className={styles.grid} role="group" aria-label={`${label} choices`}>
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.choice}
              disabled={item.disabled}
              aria-pressed={selectedId === item.id}
              aria-label={`${item.name}${item.code ? `, ${item.code}` : ""}${item.disabledReason ? `, ${item.disabledReason}` : ""}`}
              onClick={() => {
                if (selectMobileCatalogPickerItem(item, onSelect)) dispatch({ type: "choose" });
              }}
            >
              <Swatch item={item} />
              <span className={styles.choiceText}>
                <strong>{item.name}</strong>
                {item.code ? <span>{item.code}</span> : null}
                {item.collection ? <small>{item.collection}</small> : null}
                {item.detail ? <small>{item.detail}</small> : null}
                {item.disabledReason ? <small>{item.disabledReason}</small> : null}
              </span>
              {selectedId === item.id ? <Check className={styles.check} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : showResults ? (
        <p className={styles.empty} role="status">{noResultsLabel}</p>
      ) : null}

      {hasMore ? (
        <button type="button" className={styles.showMore} onClick={() => dispatch({ type: "show-more" })}>
          Show more ({filteredItems.length - visibleItems.length})
        </button>
      ) : null}

      {selectedItem ? (
        <button
          type="button"
          className={styles.clearSelection}
          onClick={() => {
            onClear();
            dispatch({ type: "clear-selection" });
          }}
        >
          Clear {label.toLowerCase()}
        </button>
      ) : null}
    </div>
  );
}
