import { redirect } from "next/navigation";

/** The planner used to live here, back when it only did kitchens. Demo links
 * and bookmarks still point at this path, so it forwards rather than 404s. */
export default function KitchenRedirect() {
	redirect("/planner");
}
