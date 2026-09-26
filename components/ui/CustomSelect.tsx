"use client";

import React, { useState, useRef, useEffect, useId, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search } from "lucide-react";
import styles from "./CustomSelect.module.css";

export interface CustomSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string;
  description?: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (CustomSelectOption | string)[];
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  leadingIcon?: React.ReactNode;
  id?: string;
  name?: string;
  required?: boolean;
  searchable?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  className,
  disabled = false,
  leadingIcon,
  id,
  name,
  required = false,
  searchable,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Normalize options into CustomSelectOption objects
  const normalizedOptions: CustomSelectOption[] = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string") {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  const isSearchEnabled = searchable ?? (normalizedOptions.length >= 10);

  const displayedOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchQuery]);

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Close when clicking outside and reset search
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (optionValue: string, isOptionDisabled?: boolean) => {
      if (isOptionDisabled) return;
      onChange(optionValue);
      setIsOpen(false);
    },
    [onChange]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        const currentIndex = normalizedOptions.findIndex((opt) => opt.value === value);
        setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
        return;
      }
    }

    if (!isOpen) return;

    switch (e.key) {
      case "Escape":
      case "Tab":
        setIsOpen(false);
        break;
      case "ArrowDown": {
        e.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev + 1;
          while (next < normalizedOptions.length && normalizedOptions[next].disabled) {
            next++;
          }
          return next < normalizedOptions.length ? next : prev;
        });
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        setFocusedIndex((prev) => {
          let next = prev - 1;
          while (next >= 0 && normalizedOptions[next].disabled) {
            next--;
          }
          return next >= 0 ? next : prev;
        });
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < normalizedOptions.length) {
          const opt = normalizedOptions[focusedIndex];
          if (!opt.disabled) {
            handleSelect(opt.value);
          }
        }
        break;
      }
    }
  };

  // Scroll active option into view inside dropdown
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && listboxRef.current) {
      const items = listboxRef.current.querySelectorAll(`.${styles.optionItem}`);
      const activeItem = items[focusedIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, focusedIndex]);

  return (
    <div
      ref={containerRef}
      className={`${styles.selectContainer} ${isOpen ? styles.selectContainerOpen : ""} ${className || ""}`}
    >
      {/* Hidden native input for form compatibility */}
      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          required={required}
        />
      )}

      {/* Trigger Button */}
      <button
        id={selectId}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${selectId}-listbox`}
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ""} ${
          disabled ? styles.triggerDisabled : ""
        }`}
      >
        <div className={styles.triggerContent}>
          {(leadingIcon || selectedOption?.icon) && (
            <span className={styles.leadingIcon}>
              {selectedOption?.icon || leadingIcon}
            </span>
          )}
          <span
            className={
              selectedOption ? styles.selectedLabel : styles.placeholder
            }
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <motion.span
          className={styles.chevron}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>

      {/* Animated Dropdown Menu Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={`${selectId}-listbox`}
            role="listbox"
            ref={listboxRef}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={styles.dropdownMenu}
          >
            {isSearchEnabled && (
              <div className={styles.searchWrapper}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search options..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setFocusedIndex(0);
                  }}
                  className={styles.searchInput}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            )}

            {displayedOptions.length === 0 ? (
              <div className={styles.noResults}>No matching options found</div>
            ) : (
              displayedOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isFocused = index === focusedIndex;

                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    onClick={() => handleSelect(option.value, option.disabled)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`${styles.optionItem} ${
                      isSelected ? styles.optionItemSelected : ""
                    } ${isFocused ? styles.optionItemFocused : ""} ${
                      option.disabled ? styles.optionItemDisabled : ""
                    }`}
                  >
                    <div className={styles.optionLeft}>
                      {option.icon && (
                        <span className={styles.optionIcon}>{option.icon}</span>
                      )}
                      <div className={styles.optionTextCol}>
                        <span className={styles.optionLabel}>{option.label}</span>
                        {option.description && (
                          <span className={styles.optionDescription}>
                            {option.description}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={styles.optionRight}>
                      {option.badge && (
                        <span className={styles.optionBadge}>{option.badge}</span>
                      )}
                      {isSelected && <Check size={14} className={styles.checkIcon} />}
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomSelect;
