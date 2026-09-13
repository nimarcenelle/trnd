import { redirect } from "next/navigation";

// The short, shareable address for the week's list. The real page lives
// under /app, where the proxy handles sign-in.
export default function PicksRedirect() {
  redirect("/app/picks");
}
