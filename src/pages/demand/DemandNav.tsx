import { Tabs } from "../../components/design";
import { useLocation } from "../../router";
import { useEffect } from "react";
import { navigate, storyPath } from "../../router";

/**
 * Business Demand: the Domain Owner's journey, from a request to an
 * approved, business-valid user story -- Requests, User Stories, User
 * Story Review (the Domain Owner's decision) and New request. It ends at
 * approval; architecture and delivery are Application Management's.
 */
export function DemandNav() {
  const { path, query } = useLocation();
  const active = path === "/stories/new" ? "new" : query.get("phase") === "story_review" ? "review"
    : query.get("phase") === "understand" ? "requests" : "stories";
  return (
    <Tabs label="Business Demand" active={active}
      hrefFor={(k) => ({ requests: "/stories?phase=understand", stories: "/stories", review: "/stories?phase=story_review", new: "/stories/new" }[k] ?? "/stories")}
      tabs={[
        { key: "requests", label: "Requests" },
        { key: "stories", label: "User Stories" },
        { key: "review", label: "To review" },
        { key: "new", label: "New request" },
      ]} />
  );
}

/**
 * The former User Story Review screen (audit F08: one review journey). The
 * Domain Owner now decides on the story itself; old links land there, or on
 * the list of stories waiting for review.
 */
export function ReviewRedirect() {
  const { query } = useLocation();
  const story = query.get("story");
  useEffect(() => {
    navigate(story ? storyPath(story, "story") : "/stories?phase=story_review", { replace: true });
  }, [story]);
  return null;
}
