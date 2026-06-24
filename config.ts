import type { RangePreset } from "./shared/types.js";

/**
 * Non-secret comparison config. Committed to the repo.
 * Secrets (token, base URL) live in .env ... see .env.example.
 *
 * Edit the values below to point at your own group/projects and people.
 */
export interface AppConfig {
  /** Provide ONE of groupPath or projectPaths. groupPath is preferred (one bulk query). */
  groupPath?: string;
  /** Fallback: explicit "group/project" full paths when you don't have a single group. */
  projectPaths?: string[];

  /** The hand-picked comparison set, by GitLab username. */
  users: string[];

  /** Highlighted + ranked in the UI. Must appear in `users`. */
  currentUser: string;

  /** Default window; the UI can override without a restart. */
  defaultRange: RangePreset;

  /** Max concurrent GitLab requests (rate-limit politeness). */
  concurrency: number;

  /**
   * MR size health bands, in changed lines (additions + deletions).
   * MRs at or below `tooSmall` or above `tooLarge` fall outside the healthy band.
   */
  sizeBand: { tooSmall: number; tooLarge: number };

  /**
   * Linear delivery metrics (optional). The API key lives in .env (LINEAR_API_KEY); this
   * is just the non-secret identity map. Omit the block, or leave emailByUser empty, to
   * disable the "Issues done" metric. Issues are counted by assignee across all teams.
   */
  linear?: {
    /** GitLab username -> Linear account email. Unmapped users get no Linear data. */
    emailByUser: Record<string, string>;
    /**
     * Exclude stale backlog from "Issues done": skip issues completed more than this many
     * days after they were created. Bulk-closing months-old issues otherwise inflates the
     * count (an EM grooming the backlog scored 47, of which 43 were ~223 days old). Set to
     * 0 or omit to count every completed issue regardless of age. Default 90.
     */
    maxIssueAgeDays?: number;
  };
}

export const config: AppConfig = {
  groupPath: "",
  projectPaths: ["assured/assured-dev"],

  users: [
    "m4ttheweric", // Matthew Goodwin (you)
    "westonnovelli", // Weston Novelli
    "geoff82", // Geoff Miller
    "leath1", // Leath Cooper
    "edroch", // Ed Rocha
    "john.west.assured.claims", // John West
    "doug-at-assured", // Doug Treadwell
    // ClaimView Islands pod (#pod-claimview-internal, active in apps/adjuster/.../ClaimViewIslands)
    "peterfrench-assured", // Peter French
    "hacknightly", // Darrell Banks
    "djclaims", // Djam Saidmuradov
    "jorgecoello", // Jorge Coello
    "CalebDudley-Assured", // Caleb Dudley
    "fabian-assured", // Fabian Buentello
    "jerry.hong1", // Jerry Hong
  ],
  currentUser: "m4ttheweric",

  defaultRange: "30d",

  concurrency: 6,

  sizeBand: { tooSmall: 10, tooLarge: 400 },

  // Linear emails resolved from the Assured workspace. Edit when people join/leave.
  linear: {
    emailByUser: {
      m4ttheweric: "matthew.goodwin@assured.claims",
      westonnovelli: "weston@assured.claims",
      geoff82: "geoff@assured.claims",
      leath1: "leath@assured.claims",
      edroch: "ed.rocha@assured.claims",
      "john.west.assured.claims": "john.west@assured.claims",
      "doug-at-assured": "doug@assured.claims",
      "peterfrench-assured": "peter.french@assured.claims",
      hacknightly: "darrell.banks@assured.claims",
      djclaims: "djam@assured.claims",
      jorgecoello: "jorge@assured.claims",
      "CalebDudley-Assured": "caleb.dudley@assured.claims",
      "fabian-assured": "fabian.buentello@assured.claims",
      "jeremy.brown.assured": "jeremy.brown@assured.claims",
      "jerry.hong1": "jerry.hong@assured.claims",
    },
    maxIssueAgeDays: 90,
  },
};
