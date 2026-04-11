"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Button } from "@/src/components/ui/button";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api, type SavedSearchRecord } from "@/src/lib/api";

export function SavedSearchesScreen() {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        if (isDesignMock) {
          setSavedSearches([
            {
              id: "saved_search_preview_1",
              userId: session.userId,
              title: "Search: design dinner",
              searchType: "activity_search",
              queryConfig: { q: "design dinner", limit: 6 },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]);
          return;
        }

        const searches = await api.listSavedSearches(
          session.userId,
          session.accessToken,
        );
        setSavedSearches(searches);
      } catch (error) {
        setBanner({
          tone: "error",
          text: `Could not load saved searches: ${String(error)}`,
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isDesignMock, session, setBanner]);

  const createSavedSearchQuick = async () => {
    if (!session) {
      return;
    }
    try {
      if (isDesignMock) {
        setBanner({ tone: "success", text: "Preview saved search created." });
        return;
      }
      const created = await api.createSavedSearch(
        session.userId,
        {
          title: "Search: tennis",
          searchType: "activity_search",
          queryConfig: { q: "tennis", limit: 6 },
        },
        session.accessToken,
      );
      setSavedSearches((current) => [created, ...current]);
      setBanner({ tone: "success", text: "Saved search created." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create saved search: ${String(error)}`,
      });
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Keep reusable search intent separate from the main discovery flow."
          title="Saved searches"
        />
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void createSavedSearchQuick()}
              type="button"
              variant="primary"
            >
              New saved search
            </Button>
            <Link href="/scheduled-tasks">
              <Button type="button" variant="secondary">
                Open scheduled tasks
              </Button>
            </Link>
          </div>

          {loading ? (
            <p className="text-sm text-ash">Loading saved searches…</p>
          ) : savedSearches.length === 0 ? (
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                No saved searches yet. Create one to reuse high-signal queries.
              </p>
            </WorkspaceMutedPanel>
          ) : (
            savedSearches.map((search) => (
              <WorkspaceMutedPanel key={search.id}>
                <p className="font-medium text-white/90">{search.title}</p>
                <p className="mt-1 text-xs text-ash">{search.searchType}</p>
                <p className="mt-2 text-xs text-ash">
                  updated {new Date(search.updatedAt).toLocaleString()}
                </p>
              </WorkspaceMutedPanel>
            ))
          )}
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description="Saved searches power recurring automation and activity summaries."
          title="How they connect"
        />
        <div className="mt-4 space-y-3">
          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-ash">
              A saved search stores a typed query. Scheduled tasks can run it on
              a cadence and deliver the result into notifications or the agent
              thread.
            </p>
          </WorkspaceMutedPanel>
          <div className="flex flex-wrap gap-2">
            <Link href="/automations">
              <Button type="button" variant="secondary">
                Open automations
              </Button>
            </Link>
            <Link href="/activity">
              <Button type="button" variant="secondary">
                Open activity
              </Button>
            </Link>
          </div>
        </div>
      </WorkspacePanel>
    </div>
  );
}
