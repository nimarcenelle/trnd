import { Suspense } from "react";

import OddsFlow from "@/components/admitted/odds-flow";
import { paidSession } from "@/lib/admitted/access";
import { isEssayOpen } from "@/lib/env";

export const metadata = { title: "See my odds · Admitted" };

export default async function OddsPage() {
  const paid = isEssayOpen ? Boolean(await paidSession()) : false;
  return (
    <Suspense>
      <OddsFlow paid={paid} open={isEssayOpen} />
    </Suspense>
  );
}
