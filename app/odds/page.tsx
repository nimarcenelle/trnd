import { Suspense } from "react";

import OddsFlow from "@/components/essayodds/odds-flow";
import { paidSession } from "@/lib/essayodds/access";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "See my odds · EssayOdds" };

export default async function OddsPage() {
  const paid = isEssayOpen ? Boolean(await paidSession()) : false;
  return (
    <Suspense>
      <OddsFlow paid={paid} open={isEssayOpen} />
    </Suspense>
  );
}
