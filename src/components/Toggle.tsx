interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, disabled = false, onChange }: ToggleProps) {
  return (
    <div className="toggle-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <button
        type="button"
        className={checked ? 'toggle on' : 'toggle'}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
