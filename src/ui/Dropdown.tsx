import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { sfx } from "../audio/sfx";
import { ChevronDownIcon } from "./Icons";

interface DropdownProps<T extends string | number> {
  /** Small caption on the left of the button, e.g. SORT BY */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Boxy select in the game's style: a white button that opens a navy list, the current choice in white. */
export function Dropdown<T extends string | number>({
  label,
  options,
  value,
  onChange,
  className,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function toggle() {
    sfx.play("tap");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen((o) => !o);
  }

  function choose(index: number) {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (!option || option.value === value) return;
    sfx.play("tap");
    onChange(option.value);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        toggle();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div
      className={`a9-drop${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
      onKeyDown={onKeyDown}
    >
      <span className="a9-drop__label">{label}</span>
      <span className="a9-drop__field">
        <button
          ref={buttonRef}
          type="button"
          className="a9-drop__button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onClick={toggle}
        >
          <span className="a9-drop__value">{current?.label}</span>
          <ChevronDownIcon />
        </button>
        {open && (
          <ul
            className="a9-drop__menu"
            role="listbox"
            id={listId}
            aria-label={label}
          >
            {options.map((option, i) => (
              <li
                key={String(option.value)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={option.value === value}
                className={`a9-drop__option${option.value === value ? " is-selected" : ""}${i === active ? " is-active" : ""}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}
      </span>
    </div>
  );
}
