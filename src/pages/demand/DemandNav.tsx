import { Tabs } from "../../components/design";
import { useLocation } from "../../router";
import { useEffect, useState } from "react";
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
  // The target is fixed on the first render: once the redirect lands, this component sees the new
  // location before it unmounts, and must not redirect a second time (register P2).
  const [to] = useState(() => { const story = query.get("story"); return story ? storyPath(story) : "/stories?phase=story_review"; });
  useEffect(() => {
    const t = setTimeout(() => navigate(to, { replace: true }), 0);
    return () => clearTimeout(t);
  }, [to]);
  return null;
}
