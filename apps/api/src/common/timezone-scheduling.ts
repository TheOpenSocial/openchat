const DAY_INDEX_BY_NAME: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

type WeeklyOccurrenceInput = {
  days: Array<keyof typeof DAY_INDEX_BY_NAME>;
  hour: number;
  minute: number;
  timezone: string;
  from: Date;
  intervalWeeks?: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const cacheKey = normalizedTimeZone;
  const cached = formatterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

function normalizeTimeZone(timeZone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const weekdayToken =
    values.get("weekday")?.toLowerCase().slice(0, 3) ?? "sun";
  const hourValue = Number(values.get("hour") ?? "0");

  return {
    year: Number(values.get("year") ?? "0"),
    month: Number(values.get("month") ?? "1"),
    day: Number(values.get("day") ?? "1"),
    hour: hourValue === 24 ? 0 : hourValue,
    minute: Number(values.get("minute") ?? "0"),
    second: Number(values.get("second") ?? "0"),
    weekday: DAY_INDEX_BY_NAME[weekdayToken] ?? 0,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const zoned = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
    0,
  );
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}) {
  const normalizedTimeZone = normalizeTimeZone(input.timeZone);
  const targetUtc = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
    0,
  );

  let guess = targetUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guess), normalizedTimeZone);
    const nextGuess = targetUtc - offset;
    if (Math.abs(nextGuess - guess) < 1000) {
      return new Date(nextGuess);
    }
    guess = nextGuess;
  }

  return new Date(guess);
}

export function computeNextWeeklyOccurrence(input: WeeklyOccurrenceInput) {
  const intervalWeeks = Math.max(1, input.intervalWeeks ?? 1);
  const searchStart = new Date(input.from.getTime() + 60_000);
  const startLocal = getZonedDateParts(searchStart, input.timezone);
  const selectedDays = new Set<number>(
    input.days.map((day) => DAY_INDEX_BY_NAME[day]).filter(Number.isInteger),
  );

  for (
    let offset = 0;
    offset <= Math.max(35, intervalWeeks * 21);
    offset += 1
  ) {
    const localDate = new Date(
      Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day + offset),
    );
    const candidate = zonedDateTimeToUtc({
      year: localDate.getUTCFullYear(),
      month: localDate.getUTCMonth() + 1,
      day: localDate.getUTCDate(),
      hour: input.hour,
      minute: input.minute,
      timeZone: input.timezone,
    });
    const candidateLocal = getZonedDateParts(candidate, input.timezone);

    if (!selectedDays.has(candidateLocal.weekday)) {
      continue;
    }
    if (candidate.getTime() < searchStart.getTime()) {
      continue;
    }

    const weekDelta = Math.floor(offset / 7);
    if (weekDelta % intervalWeeks !== 0) {
      continue;
    }

    return candidate;
  }

  const fallbackLocalDate = new Date(
    Date.UTC(
      startLocal.year,
      startLocal.month - 1,
      startLocal.day + 7 * intervalWeeks,
    ),
  );

  return zonedDateTimeToUtc({
    year: fallbackLocalDate.getUTCFullYear(),
    month: fallbackLocalDate.getUTCMonth() + 1,
    day: fallbackLocalDate.getUTCDate(),
    hour: input.hour,
    minute: input.minute,
    timeZone: input.timezone,
  });
}

export function getLocalHour(date: Date, timeZone: string) {
  return getZonedDateParts(date, timeZone).hour;
}
