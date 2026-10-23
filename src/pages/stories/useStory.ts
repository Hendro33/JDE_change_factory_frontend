import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { processApi, type StoryProcessView } from "../../services/processApi";
import { technicalApi, type TechnicalWorkView } from "../../services/technicalApi";
import type { ArchitectureReviewRun, Change, DomainReview, WorkspaceTab } from "../../types/domain";
import { storyPath } from "../../router";
import type { StoryCtx } from "./storyContext";

/**
 * Loads one story with everything its views need -- the same for the
 * business view (Business Demand) and the application view (Application
 * Management), so both show one record and one state. While JADE itself is
 * working, it refreshes every few seconds.
 */
export function useStory(storyId: string | null): {
  change: Change | null | undefined; error: unknown; ctx: StoryCtx | null; reload: () => void;
} {
  const [change, setChange] = useState<Change | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [domainReview, setDomainReview] = useState<DomainReview | null>(null);
  const [run, setRun] = useState<ArchitectureReviewRun | null>(null);
  const [process, setProcess] = useState<StoryProcessView | null>(null);
  const [tech, setTech] = useState<TechnicalWorkView | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!storyId) { setChange(null); return; }
    api.getChange(storyId).then((c) => { setChange(c ?? null); setError(null); }).catch((e) => setError(e));
  }, [storyId, tick]);

  const isStory = !!change && !["RECEIVED", "REFINING"].includes(change.state);
  useEffect(() => {
    if (!storyId || !change || !isStory) return;
    api.getDomainReview(storyId).then((r) => setDomainReview(r ?? null)).catch(() => setDomainReview(null));
    api.getArchitectureReview(storyId).then((r) => setRun(r ?? null)).catch(() => setRun(null));
    processApi.story(storyId).then(setProcess).catch(() => setProcess(null));
    const route = change.lifecycle?.route ?? change.architectDecision?.recommendedRoute;
    if (route === "Technical Agent" || route === "Mixed") technicalApi.work(storyId).then(setTech).catch(() => setTech(null));
    else setTech(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, tick, isStory]);

  const jadeWorking = change?.lifecycle?.nextAction.owner === "jade";
  useEffect(() => {
    if (!jadeWorking) return;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [jadeWorking]);

  const ctx: StoryCtx | null = change ? { change, reload, domainReview, setDomainReview, run, setRun, process, tech } : null;
  return { change, error, ctx, reload };
}

const APP_TABS = new Set<WorkspaceTab>(["solution", "delivery", "technical", "record"]);

/** The application view of a change (Application Management). */
export function changePath(id: string, tab?: WorkspaceTab, anchor?: string): string {
  return `/am/changes/${encodeURIComponent(id)}${tab && tab !== "solution" ? `/${tab}` : ""}${anchor ? `#${anchor}` : ""}`;
}

/**
 * Where a tab lives: the business view's tabs on the story, the
 * application view's in Application Management (for people who work
 * there; everyone else follows progress on the story).
 */
export function workPath(id: string, tab: WorkspaceTab | undefined, appManagement: boolean, anchor?: string): string {
  const t: WorkspaceTab = tab === "overview" || !tab ? "story" : tab === "outcome" ? "progress" : tab;
  if (APP_TABS.has(t)) return appManagement ? changePath(id, t, anchor) : storyPath(id, "progress", anchor);
  return storyPath(id, t === "story" ? undefined : t, anchor);
}
