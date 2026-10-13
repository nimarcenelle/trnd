"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({ children, pending, className = "btn btn-primary" }: { children: React.ReactNode; pending?: string; className?: string }) {
  const status = useFormStatus();
  return (
    <button type="submit" className={className} disabled={status.pending}>
      {status.pending && pending ? pending : children}
    </button>
  );
}
