import { redirect } from "next/navigation";
import { adminRoutes } from "@/lib/routes";

/** `/admin` ouvre directement la pile de travail du jour. */
export default function AdminHome() {
  redirect(adminRoutes.orders);
}
