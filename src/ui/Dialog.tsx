import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { enterScreen, exitScreen } from "../animation/a9";
import { sfx } from "../audio/sfx";
import { Button } from "./Button";
import { CloseIcon } from "./Icons";
import { Reveal } from "./Reveal";

interface DialogProps {
  title: string;
  children: ReactNode;
  /** White action button in the body, e.g. RETRY. Called after the dialog closes. */
  action?: { label: string; onClick: () => void };
  onClose: () => void;
}

/**
 * Warning dialog in the game's style (CUSTOMER CARE / CONNECTION ERROR): dark header with a white
 * top rule, pink close tab, blue body with centered text and a white button.
 */
export function Dialog({ title, children, action, onClose }: DialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);

  useLayoutEffect(() => {
    if (rootRef.current) void enterScreen(rootRef.current);
  }, []);

  async function close(then?: () => void) {
    if (closingRef.current || !rootRef.current) return;
    closingRef.current = true;
    await exitScreen(rootRef.current);
    onClose();
    then?.();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        sfx.play("click");
        void close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="a9-dialog" ref={rootRef} role="alertdialog" aria-modal="true" aria-labelledby="a9-dialog-title">
      <div className="a9-dialog__backdrop" data-a9-bg onClick={() => void close()} />
      <Reveal kind="panel" className="a9-dialog__panel">
        <div className="a9-dialog__head">
          <h2 id="a9-dialog-title">{title}</h2>
          <button
            type="button"
            className="a9-dialog__close"
            aria-label="Close"
            onClick={() => {
              sfx.play("click");
              void close();
            }}
          >
            <CloseIcon size={30} />
          </button>
        </div>
        <div className="a9-dialog__body">
          {children}
          {action && (
            <Button variant="normal" className="a9-dialog__action" onClick={() => void close(action.onClick)} autoFocus>
              {action.label}
            </Button>
          )}
        </div>
      </Reveal>
    </div>
  );
}
