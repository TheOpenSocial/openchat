"use client";

import { useMemo } from "react";
import { apiRequest, apiRequestNullable, type HttpMethod } from "../../lib/api";
import { errorText } from "./workbench-utils";

export function useAdminApiActions(input: {
  accessToken?: string;
  adminUserId: string;
  adminRole: "admin" | "support" | "moderator";
  setBusyKey: (
    value: string | null | ((current: string | null) => string | null),
  ) => void;
  setBanner: (
    value: { tone: "info" | "error" | "success"; text: string } | null,
  ) => void;
}) {
  const adminRequestHeaders = useMemo(
    () => ({
      ...(input.accessToken
        ? { authorization: `Bearer ${input.accessToken}` }
        : {}),
      "x-admin-user-id": input.adminUserId.trim(),
      "x-admin-role": input.adminRole,
    }),
    [input.accessToken, input.adminRole, input.adminUserId],
  );

  const requestApi = <T>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    },
  ) =>
    apiRequest<T>(method, path, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        ...adminRequestHeaders,
      },
    });

  const requestApiNullable = <T>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      query?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
    },
  ) =>
    apiRequestNullable<T>(method, path, {
      ...options,
      headers: {
        ...(options?.headers ?? {}),
        ...adminRequestHeaders,
      },
    });

  const runAction = async <T>(
    key: string,
    operation: () => Promise<T>,
    successText: string | ((payload: T) => string),
    onSuccess?: (payload: T) => void,
  ) => {
    input.setBusyKey(key);
    input.setBanner(null);

    try {
      const payload = await operation();
      onSuccess?.(payload);
      const text =
        typeof successText === "function" ? successText(payload) : successText;
      input.setBanner({
        tone: "success",
        text,
      });
      return payload;
    } catch (error) {
      input.setBanner({
        tone: "error",
        text: `${key} failed: ${errorText(error)}`,
      });
      return null;
    } finally {
      input.setBusyKey((current) => (current === key ? null : current));
    }
  };

  return {
    requestApi,
    requestApiNullable,
    runAction,
  };
}
