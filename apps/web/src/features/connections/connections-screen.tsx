"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  WorkspaceHeader,
  WorkspaceList,
  WorkspaceListItem,
  WorkspaceMutedPanel,
  WorkspacePanel,
} from "@/src/components/layout/workspace";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Select } from "@/src/components/ui/select";
import { useAppSession } from "@/src/features/app-shell/app-session";
import { api } from "@/src/lib/api";

type ConnectionEntry = {
  id: string;
  type: "dm" | "group";
  chatId: string | null;
  createdAt: string;
  status: "created" | "chat_created";
};

const CONNECTIONS_STORAGE_KEY = "opensocial.web.connections.v1";

function createMockConnections(): ConnectionEntry[] {
  return [
    {
      id: "conn_mock_1",
      type: "dm",
      chatId: "chat_mock_1",
      createdAt: new Date().toISOString(),
      status: "chat_created",
    },
    {
      id: "conn_mock_2",
      type: "group",
      chatId: null,
      createdAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      status: "created",
    },
  ];
}

export function ConnectionsScreen() {
  const { isDesignMock, session, setBanner } = useAppSession();
  const [connections, setConnections] = useState<ConnectionEntry[]>([]);
  const [connectionType, setConnectionType] = useState<"dm" | "group">("dm");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isDesignMock && session) {
      setConnections(createMockConnections());
      setLoading(false);
      return;
    }

    const raw = window.localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) {
      setLoading(false);
      return;
    }

    try {
      setConnections(JSON.parse(raw) as ConnectionEntry[]);
    } catch {
      window.localStorage.removeItem(CONNECTIONS_STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, [isDesignMock, session]);

  useEffect(() => {
    if (typeof window === "undefined" || loading) {
      return;
    }
    window.localStorage.setItem(
      CONNECTIONS_STORAGE_KEY,
      JSON.stringify(connections),
    );
  }, [connections, loading]);

  const createConnection = async () => {
    if (!session) {
      return;
    }

    setCreating(true);
    try {
      if (isDesignMock) {
        const entry: ConnectionEntry = {
          id: `conn_mock_${Date.now().toString(36)}`,
          type: connectionType,
          chatId: null,
          createdAt: new Date().toISOString(),
          status: "created",
        };
        setConnections((current) => [entry, ...current]);
        setBanner({
          tone: "success",
          text:
            connectionType === "dm"
              ? "Preview direct connection created."
              : "Preview group connection created.",
        });
        return;
      }

      const created = await api.createConnection(
        session.userId,
        connectionType,
        session.accessToken,
      );
      const connectionId = String(
        (created as { id?: string | number }).id ?? "",
      ).trim();
      if (!connectionId) {
        throw new Error("Connection response did not include an id.");
      }

      let chatId: string | null = null;
      try {
        const chat = await api.createChat(
          connectionId,
          connectionType,
          session.accessToken,
        );
        chatId = String(chat.id);
      } catch {
        // Keep the connection record even if the follow-up chat step fails.
      }

      const entry: ConnectionEntry = {
        id: connectionId,
        type: connectionType,
        chatId,
        createdAt: new Date().toISOString(),
        status: chatId ? "chat_created" : "created",
      };
      setConnections((current) => [entry, ...current]);
      setBanner({
        tone: "success",
        text:
          connectionType === "dm"
            ? "Direct connection created."
            : "Group connection created.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        text: `Could not create connection: ${String(error)}`,
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <WorkspacePanel>
        <WorkspaceHeader
          description="Create direct or group connections without changing the existing chat surface."
          title="Connections"
        />

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-white/90">Connection type</p>
            <div className="mt-2">
              <Select
                onChange={(event) =>
                  setConnectionType(event.currentTarget.value as "dm" | "group")
                }
                value={connectionType}
              >
                <option value="dm">Direct message</option>
                <option value="group">Group connection</option>
              </Select>
            </div>
          </div>

          <Button
            disabled={creating}
            onClick={() => {
              void createConnection();
            }}
            type="button"
            variant="primary"
          >
            {creating ? "Creating…" : "Create connection"}
          </Button>

          <WorkspaceMutedPanel>
            <p className="text-sm leading-6 text-ash">
              Connection creation stays explicit. Use this route to open a
              people or group relationship before you move into chats.
            </p>
          </WorkspaceMutedPanel>

          <div className="flex flex-wrap gap-2">
            <Link href="/chats">
              <Button type="button" variant="secondary">
                Open chats
              </Button>
            </Link>
            <Link href="/discover">
              <Button type="button" variant="secondary">
                Find people
              </Button>
            </Link>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <WorkspaceHeader
          description="Recent connection records created from the web shell."
          title="Recent connections"
        />
        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-ash">Loading connections…</p>
          ) : connections.length === 0 ? (
            <WorkspaceMutedPanel>
              <p className="text-sm leading-6 text-ash">
                No connections yet. Create one to keep the shell path alive.
              </p>
            </WorkspaceMutedPanel>
          ) : (
            <WorkspaceList>
              {connections.map((connection) => (
                <WorkspaceListItem key={connection.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white/92">
                        {connection.type === "dm"
                          ? "Direct connection"
                          : "Group connection"}{" "}
                        · {connection.id.slice(0, 8)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ash">
                        created{" "}
                        {new Date(connection.createdAt).toLocaleString()}
                        {connection.chatId
                          ? ` · chat ${connection.chatId.slice(0, 8)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="primary">{connection.status}</Badge>
                      <Link href="/chats">
                        <Button size="sm" type="button" variant="secondary">
                          Open chats
                        </Button>
                      </Link>
                    </div>
                  </div>
                </WorkspaceListItem>
              ))}
            </WorkspaceList>
          )}
        </div>
      </WorkspacePanel>
    </div>
  );
}
