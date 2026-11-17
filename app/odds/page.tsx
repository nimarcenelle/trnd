import { Suspense } from "react";

import OddsFlow from "@/components/essayodds/odds-flow";
import { isPro, paidAccess } from "@/lib/essayodds/access";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "See my odds · EssayOdds" };

export default async function OddsPage() {
  const access = isEssayOpen ? await paidAccess() : null;
  return (
    <Suspense>
      <OddsFlow paid={Boolean(access)} pro={isPro(access)} open={isEssayOpen} />
    </Suspense>
  );
}
