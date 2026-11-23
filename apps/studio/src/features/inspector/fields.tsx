import { gesture } from '../../state/uiStore.ts';
import { ColorInput } from '../../ui/ColorInput.tsx';
import { Field } from '../../ui/controls.tsx';
import { Slider, type SliderProps } from '../../ui/Slider.tsx';

/** A slider whose drags form a single undo step and lower viewport quality meanwhile. */
export function NumberField(props: Omit<SliderProps, 'onBegin' | 'onEnd'>) {
  return <Slider {...props} onBegin={() => gesture.begin(props.label)} onEnd={gesture.end} />;
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <ColorInput
        label={label}
        value={value}
        onChange={onChange}
        onBegin={() => gesture.begin(label)}
        onEnd={gesture.end}
      />
    </Field>
  );
}

/** Three sliders for an X/Y/Z vector. */
export function VectorField({
  label,
  value,
  onChange,
  step = 0.01,
  precision = 2,
  unit,
  defaultValue,
  dragStep,
}: {
  label: string;
  value: readonly [number, number, number];
  onChange: (value: [number, number, number]) => void;
  step?: number;
  precision?: number;
  unit?: string;
  defaultValue?: number;
  dragStep?: number;
}) {
  const axes = ['X', 'Y', 'Z'] as const;
  return (
    <Field label={label}>
      {axes.map((axis, index) => (
        <NumberField
          key={axis}
          label={axis}
          value={value[index]!}
          step={step}
          precision={precision}
          {...(unit !== undefined ? { unit } : {})}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(dragStep !== undefined ? { dragStep } : {})}
          onChange={(next) => {
            const copy: [number, number, number] = [value[0], value[1], value[2]];
            copy[index] = next;
            onChange(copy);
          }}
        />
      ))}
    </Field>
  );
}
