import type { ArchitectureReviewRun, Change, DomainReview } from "../../types/domain";
import type { StoryProcessView } from "../../services/processApi";
import type { TechnicalWorkView } from "../../services/technicalApi";

/** Everything the Story Workspace has loaded for one story, shared by its tabs. */
export interface StoryCtx {
  change: Change;
  /** Re-read the story (and its lifecycle) after any action. */
  reload: () => void;
  domainReview: DomainReview | null;
  setDomainReview: (r: DomainReview | null) => void;
  run: ArchitectureReviewRun | null;
  setRun: (r: ArchitectureReviewRun | null) => void;
  process: StoryProcessView | null;
  tech: TechnicalWorkView | null;
}

/** The route in business words. */
export const ROUTE_LABEL: Record<string, { title: string; summary: string }> = {
  "Functional Agent": { title: "Change JD Edwards configuration", summary: "Standard JD Edwards functionality, set up differently. No custom code." },
  "Technical Agent": { title: "Change custom JD Edwards objects", summary: "A change to the customer's own JD Edwards objects, prepared by JADE and applied through the controlled gate." },
  "Mixed": { title: "Configuration and custom objects", summary: "Part configuration, part a change to the customer's own objects." },
  "Human Implementation": { title: "Implemented by a person", summary: "JADE cannot safely automate this; a consultant implements it following the proposal." },
  "Resolve without Change": { title: "No JD Edwards change needed", summary: "The need can be met without changing JD Edwards." },
  "Clarification Required": { title: "A business answer is needed first", summary: "The information so far contradicts itself or leaves an open business question." },
};

/** Strip demo-script markers from agent text; the Simulation badge carries that fact instead. */
export function cleanAgentText(text: string | undefined | null): { text: string; simulated: boolean } {
  const raw = text ?? "";
  const simulated = /SCRIPTED STAND-IN|SYNTHETIC|SIMULATION/i.test(raw);
  const cleaned = raw
    .replace(/^\s*SCRIPTED STAND-IN(?:\s*\(not a model run\))?\s*:\s*/i, "")
    .replace(/^\s*SYNTHETIC\s*:\s*/i, "")
    .trim();
  return { text: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), simulated };
}
