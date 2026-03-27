import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../../lib/api";
import { uploadProfilePhotoFromPickerAsset } from "../../lib/profile-photo-upload";
import type { UserProfileDraft } from "../../types";
import {
  normalizeOtherProfile,
  normalizeSelfProfile,
  type ProfileViewModel,
} from "./profile-model";

type SelfProfileInput = {
  userId: string;
  displayName: string;
  email?: string | null;
  accessToken: string;
  initialDraft: UserProfileDraft;
};

export function useSelfProfileData(input: SelfProfileInput) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileRecord, setProfileRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [trustRecord, setTrustRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [globalRulesRecord, setGlobalRulesRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [lifeGraphRecord, setLifeGraphRecord] = useState<Record<
    string,
    unknown
  > | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profile, trust, globalRules, lifeGraph] = await Promise.all([
        api.getProfile(input.userId, input.accessToken).catch(() => null),
        api.getTrustProfile(input.userId, input.accessToken).catch(() => null),
        api.getGlobalRules(input.userId, input.accessToken).catch(() => null),
        api.getLifeGraph(input.userId, input.accessToken).catch(() => null),
      ]);
      setProfileRecord(profile);
      setTrustRecord(trust);
      setGlobalRulesRecord(globalRules);
      setLifeGraphRecord(lifeGraph);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, [input.accessToken, input.userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const profile = useMemo(
    () =>
      normalizeSelfProfile({
        userId: input.userId,
        displayName: input.displayName,
        email: input.email,
        draft: input.initialDraft,
        profileRecord,
        trustRecord,
        lifeGraphRecord,
        globalRulesRecord,
      }),
    [
      input.displayName,
      input.email,
      input.initialDraft,
      input.userId,
      globalRulesRecord,
      lifeGraphRecord,
      profileRecord,
      trustRecord,
    ],
  );

  const save = useCallback(
    async (updates: {
      displayName?: string;
      bio?: string;
      city?: string;
      country?: string;
      interests?: string[];
      socialMode?: "one_to_one" | "group" | "either";
      preferOneToOne?: boolean;
      allowGroupInvites?: boolean;
      notificationMode?: "immediate" | "digest" | "quiet";
    }) => {
      setSaving(true);
      setError(null);
      try {
        await api.updateProfile(
          input.userId,
          {
            displayName: updates.displayName,
            bio: updates.bio,
            city: updates.city,
            country: updates.country,
          },
          input.accessToken,
        );

        if (updates.interests) {
          const normalizedInterests = updates.interests
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
          await api.replaceInterests(
            input.userId,
            normalizedInterests.map((label) => ({ kind: "topic", label })),
            input.accessToken,
          );
          await api.replaceTopics(
            input.userId,
            normalizedInterests.map((label) => ({ label })),
            input.accessToken,
          );
        }

        if (updates.socialMode) {
          await api.setSocialMode(
            input.userId,
            {
              socialMode:
                updates.socialMode === "group"
                  ? "high_energy"
                  : updates.socialMode === "either"
                    ? "balanced"
                    : "chill",
              preferOneToOne: updates.preferOneToOne ?? true,
              allowGroupInvites: updates.allowGroupInvites ?? false,
            },
            input.accessToken,
          );
        }

        if (updates.notificationMode) {
          const currentRules = globalRulesRecord ?? {};
          await api.setGlobalRules(
            input.userId,
            {
              whoCanContact:
                currentRules.whoCanContact === "verified_only" ||
                currentRules.whoCanContact === "trusted_only"
                  ? currentRules.whoCanContact
                  : "anyone",
              reachable:
                currentRules.reachable === "always" ||
                currentRules.reachable === "do_not_disturb"
                  ? currentRules.reachable
                  : "available_only",
              intentMode:
                currentRules.intentMode === "one_to_one" ||
                currentRules.intentMode === "group"
                  ? currentRules.intentMode
                  : "balanced",
              modality:
                currentRules.modality === "online" ||
                currentRules.modality === "offline"
                  ? currentRules.modality
                  : "either",
              languagePreferences: Array.isArray(
                currentRules.languagePreferences,
              )
                ? currentRules.languagePreferences.filter(
                    (value): value is string => typeof value === "string",
                  )
                : ["en"],
              countryPreferences: Array.isArray(currentRules.countryPreferences)
                ? currentRules.countryPreferences.filter(
                    (value): value is string => typeof value === "string",
                  )
                : [],
              requireVerifiedUsers:
                typeof currentRules.requireVerifiedUsers === "boolean"
                  ? currentRules.requireVerifiedUsers
                  : false,
              notificationMode: updates.notificationMode,
              agentAutonomy:
                currentRules.agentAutonomy === "manual" ||
                currentRules.agentAutonomy === "auto_non_risky"
                  ? currentRules.agentAutonomy
                  : "suggest_only",
              memoryMode:
                currentRules.memoryMode === "minimal" ||
                currentRules.memoryMode === "extended"
                  ? currentRules.memoryMode
                  : "standard",
            },
            input.accessToken,
          );
        }

        await reload();
      } catch (nextError) {
        setError(String(nextError));
        throw nextError;
      } finally {
        setSaving(false);
      }
    },
    [globalRulesRecord, input.accessToken, input.userId, reload],
  );

  const refreshUnderstanding = useCallback(async () => {
    await Promise.all([
      api
        .refreshProfileSummaryMemory(input.userId, input.accessToken)
        .catch(() => null),
      api
        .refreshPreferenceMemory(input.userId, input.accessToken)
        .catch(() => null),
    ]);
    await reload();
  }, [input.accessToken, input.userId, reload]);

  const updateAvatar = useCallback(
    async (asset: {
      uri: string;
      mimeType?: string | null;
      fileSize?: number | null;
    }) => {
      setAvatarUploading(true);
      setError(null);
      try {
        await uploadProfilePhotoFromPickerAsset(
          input.userId,
          input.accessToken,
          asset,
        );
        await reload();
      } catch (nextError) {
        setError(String(nextError));
        throw nextError;
      } finally {
        setAvatarUploading(false);
      }
    },
    [input.accessToken, input.userId, reload],
  );

  return {
    avatarUploading,
    error,
    loading,
    profile,
    refreshUnderstanding,
    reload,
    save,
    saving,
    updateAvatar,
  };
}

type OtherProfileInput = {
  currentUserId: string;
  targetUserId: string;
  accessToken: string;
  contextReason?: string;
  sharedTopics?: string[];
  lastInteraction?: string;
};

export function useOtherUserProfileData(input: OtherProfileInput) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileViewModel | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRecord, trustRecord] = await Promise.all([
        api.getProfile(input.targetUserId, input.accessToken).catch(() => null),
        api
          .getTrustProfile(input.targetUserId, input.accessToken)
          .catch(() => null),
      ]);
      setProfile(
        normalizeOtherProfile({
          targetUserId: input.targetUserId,
          profileRecord,
          trustRecord,
          contextReason: input.contextReason,
          sharedTopics: input.sharedTopics,
          lastInteraction: input.lastInteraction,
        }),
      );
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, [
    input.accessToken,
    input.contextReason,
    input.lastInteraction,
    input.sharedTopics,
    input.targetUserId,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const block = useCallback(async () => {
    await api.blockUser(
      {
        blockerUserId: input.currentUserId,
        blockedUserId: input.targetUserId,
      },
      input.accessToken,
    );
  }, [input.accessToken, input.currentUserId, input.targetUserId]);

  const report = useCallback(async () => {
    await api.createReport(
      {
        reporterUserId: input.currentUserId,
        targetUserId: input.targetUserId,
        reason: "profile_context_review",
        entityType: "profile",
        entityId: input.targetUserId,
      },
      input.accessToken,
    );
  }, [input.accessToken, input.currentUserId, input.targetUserId]);

  return {
    block,
    error,
    loading,
    profile,
    reload,
    report,
  };
}
