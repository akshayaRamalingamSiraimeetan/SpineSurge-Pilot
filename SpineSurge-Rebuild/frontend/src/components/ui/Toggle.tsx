/* Switch toggle mapped to the design's `.toggle` class. */
import { useState } from 'react';

export function Toggle({ defaultOn = false, onChange }: { defaultOn?: boolean; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={'toggle' + (on ? ' on' : '')}
      onClick={() => {
        const next = !on;
        setOn(next);
        onChange?.(next);
      }}
    />
  );
}
