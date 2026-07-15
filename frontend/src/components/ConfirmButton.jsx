import { useEffect, useState } from 'react';

/**
 * Two-step inline confirm to replace jarring native window.confirm().
 * First click arms; second click within `timeout` ms fires onConfirm.
 */
export default function ConfirmButton({
  onConfirm,
  children = 'Delete',
  confirmLabel = 'Confirm',
  pending = false,
  pendingLabel = 'Working…',
  className = 'btn-ghost text-danger',
  confirmClassName = 'btn-danger text-xs',
  timeout = 4000,
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), timeout);
    return () => clearTimeout(t);
  }, [armed, timeout]);

  if (armed) {
    return (
      <span className="inline-flex gap-1.5">
        <button
          type="button"
          className={confirmClassName}
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConfirm();
          }}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setArmed(false);
          }}
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setArmed(true);
      }}
    >
      {children}
    </button>
  );
}
