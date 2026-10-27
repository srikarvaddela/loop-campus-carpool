"use client";

import { useId, useRef, useState } from "react";
import { Building2, MapPin, Plane } from "lucide-react";
import { suggestPlaces, type Place } from "../lib/locations";

type Props = {
  value: string;
  onChange: (value: string) => void;
  preference: "pickup" | "destination";
  label: string;
  placeholder: string;
  name?: string;
  required?: boolean;
  readOnly?: boolean;
};

export default function LocationInput({ value, onChange, preference, label, ...inputProps }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = suggestPlaces(value, preference);
  const expanded = open && !inputProps.readOnly;
  const activeIndex = active < options.length ? active : -1;

  function choose(place: Place) {
    onChange(place.value);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="location-input" ref={root} onBlur={(event) => {
      if (!root.current?.contains(event.relatedTarget as Node | null)) {
        setOpen(false);
        setActive(-1);
      }
    }}>
      <input
        {...inputProps}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-list` : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={value}
        minLength={inputProps.required ? 2 : undefined}
        maxLength={100}
        onFocus={() => { setOpen(true); setActive(-1); }}
        onClick={() => { if (!open) setOpen(true); }}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || inputProps.readOnly) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (options.length) {
              const next = event.key === "ArrowDown" ? (expanded ? activeIndex + 1 : 0) % options.length : activeIndex <= 0 ? options.length - 1 : activeIndex - 1;
              setActive(next);
              root.current?.querySelector(`#${CSS.escape(id)}-option-${next}`)?.scrollIntoView({ block: "nearest" });
            }
          } else if (event.key === "Enter" && expanded && activeIndex >= 0) {
            event.preventDefault();
            choose(options[activeIndex]);
          } else if (event.key === "Escape" && expanded) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setActive(-1);
          } else if (event.key === "Tab") {
            setOpen(false);
            setActive(-1);
          }
        }}
      />
      {expanded && (
        <div className={`location-menu location-menu-${preference}`}>
          <div className="location-menu-heading">{value.trim() ? "Matching places" : preference === "pickup" ? "Popular UT Dallas pickups" : "Popular Dallas destinations"}</div>
          <div role="listbox" id={`${id}-list`} aria-label={`${label} suggestions`} className="location-options">
            {options.map((place, index) => {
              const Icon = place.kind === "campus" ? Building2 : place.kind === "airport" ? Plane : MapPin;
              return (
                <div
                  key={place.value}
                  role="option"
                  aria-selected={activeIndex === index}
                  id={`${id}-option-${index}`}
                  className="location-option"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); choose(place); }}
                  onPointerMove={() => setActive(index)}
                >
                  <span className="location-option-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span className="location-option-copy"><strong>{place.name}</strong><small>{place.area}</small></span>
                </div>
              );
            })}
          </div>
          <div role="status" className="location-menu-hint">{options.length ? "Choose a place, or keep your own location." : "No suggestions. You can use this as a custom location."}</div>
        </div>
      )}
    </div>
  );
}
