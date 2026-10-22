import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { twMerge } from "tailwind-merge";
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [isOpen]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={twMerge(
        "fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-background text-foreground p-6 shadow-2xl backdrop:bg-black/50",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="rounded p-2 focus-visible:outline-2"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
