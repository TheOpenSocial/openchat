import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, rawQuery: string, limit = 6) {
    const query = rawQuery.trim();
    const normalized = query.toLowerCase();
    const cappedLimit = Math.min(Math.max(limit, 1), 20);

    const [users, topics, interests, intents, circles] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { not: userId },
          OR: [
            { displayName: { contains: query, mode: "insensitive" } },
            { profile: { bio: { contains: query, mode: "insensitive" } } },
            { profile: { city: { contains: query, mode: "insensitive" } } },
          ],
        },
        take: cappedLimit * 2,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          displayName: true,
          profile: {
            select: {
              city: true,
              country: true,
              trustScore: true,
              moderationState: true,
            },
          },
        },
      }),
      this.prisma.userTopic.findMany({
        where: {
          normalizedLabel: { contains: normalized, mode: "insensitive" },
        },
        take: 120,
        select: { normalizedLabel: true },
      }),
      this.prisma.userInterest.findMany({
        where: {
          normalizedLabel: { contains: normalized, mode: "insensitive" },
        },
        take: 120,
        select: { normalizedLabel: true },
      }),
      this.prisma.intent.findMany({
        where: {
          userId: { not: userId },
          status: { in: ["matching", "fanout", "partial"] },
          rawText: { contains: query, mode: "insensitive" },
        },
        take: cappedLimit * 3,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          rawText: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.recurringCircle.findMany({
        where: {
          status: "active",
          OR: [{ ownerUserId: userId }, { visibility: "discoverable" }],
          AND: [
            {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
              ],
            },
          ],
        },
        take: cappedLimit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          visibility: true,
          nextSessionAt: true,
          ownerUserId: true,
        },
      }),
    ]);

    const topicCounts = this.countLabels([
      ...topics.map((row) => row.normalizedLabel),
      ...interests.map((row) => row.normalizedLabel),
    ]);

    const userResults = users
      .map((user) => {
        const nameScore = user.displayName.toLowerCase().includes(normalized)
          ? 0.65
          : 0.35;
        const trustBoost = Number(user.profile?.trustScore ?? 0) * 0.2;
        const score = this.clamp(nameScore + trustBoost);
        return {
          userId: user.id,
          displayName: user.displayName,
          city: user.profile?.city ?? null,
          country: user.profile?.country ?? null,
          moderationState: user.profile?.moderationState ?? "clean",
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);

    const topicResults = Array.from(topicCounts.entries())
      .map(([label, count]) => ({
        label,
        count,
        score: this.clamp(0.35 + count / 10),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, cappedLimit);

    const activityResults = intents.slice(0, cappedLimit).map((intent) => ({
      intentId: intent.id,
      ownerUserId: intent.userId,
      status: intent.status,
      summary: intent.rawText.slice(0, 160),
      createdAt: intent.createdAt.toISOString(),
      score: 0.55,
    }));

    const groupResults = circles.map((circle) => ({
      circleId: circle.id,
      title: circle.title,
      description: circle.description,
      visibility: circle.visibility,
      ownerUserId: circle.ownerUserId,
      nextSessionAt: circle.nextSessionAt?.toISOString() ?? null,
      score: circle.visibility === "discoverable" ? 0.7 : 0.5,
    }));

    return {
      userId,
      query,
      generatedAt: new Date().toISOString(),
      users: userResults,
      topics: topicResults,
      activities: activityResults,
      groups: groupResults,
    };
  }

  private countLabels(labels: string[]) {
    const counts = new Map<string, number>();
    for (const label of labels) {
      const normalized = label.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
    return counts;
  }

  private clamp(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }
}
