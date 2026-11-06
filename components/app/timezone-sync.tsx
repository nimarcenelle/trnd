"use client";

import { useEffect } from "react";

import { setTimezoneAction } from "@/lib/actions";

/** Tells the server the creator's timezone, so the weekly plan lands Tuesday 8 AM where they are. */
export default function TimezoneSync({ current }: { current: string | null | undefined }) {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== current) void setTimezoneAction(tz);
    } catch {
      /* no Intl: the default zone stands */
    }
  }, [current]);
  return null;
}
