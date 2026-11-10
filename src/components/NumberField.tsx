interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  help: string;
  /** 輸入框被清空時會收到 `NaN`，由設定驗證負責顯示錯誤。 */
  onChange: (value: number) => void;
}

/** 數字輸入框加滑桿，兩者連動同一個值。 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  help,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="input-unit">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isNaN(value) ? '' : value}
          onChange={(event) => onChange(event.target.valueAsNumber)}
        />
        <span>{unit}</span>
      </div>
      <input
        type="range"
        aria-label={label + '滑桿'}
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      <small>{help}</small>
    </label>
  );
}
