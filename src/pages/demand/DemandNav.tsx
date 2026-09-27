import { Tabs } from "../../components/design";
import { useLocation } from "../../router";
import { UserStoryReview } from "./UserStoryReview";
import { useNavTarget } from "../am/legacyNav";

/**
 * Business Demand: the Domain Owner's journey, from a request to an
 * approved, business-valid user story -- Requests, User Stories, User
 * Story Review (the Domain Owner's decision) and New request. It ends at
 * approval; architecture and delivery are Application Management's.
 */
export function DemandNav() {
  const { path, query } = useLocation();
  const active = path === "/stories/review" ? "review" : path === "/stories/new" ? "new"
    : query.get("phase") === "understand" ? "requests" : "stories";
  return (
    <Tabs label="Business Demand" active={active}
      hrefFor={(k) => ({ requests: "/stories?phase=understand", stories: "/stories", review: "/stories/review", new: "/stories/new" }[k] ?? "/stories")}
      tabs={[
        { key: "requests", label: "Requests" },
        { key: "stories", label: "User Stories" },
        { key: "review", label: "User Story Review" },
        { key: "new", label: "New request" },
      ]} />
  );
}

/** User Story Review, the Domain Owner's decision screen (restored from main). */
export function DemandReview() {
  const target = useNavTarget();
  return (
    <>
      <DemandNav />
      <UserStoryReview {...target} />
    </>
  );
}
